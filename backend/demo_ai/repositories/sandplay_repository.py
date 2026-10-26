"""Short atomic writes with optimistic concurrency; no AI/memory coupling."""

import asyncio
import json
from datetime import UTC, datetime
from functools import partial

import anyio

from ..database import Database, StorageError
from ..sandplay_models import MAX_PROJECT_BYTES


def timestamp():
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def summary(row):
    return {key: row[key] for key in row.keys() if key != "scene_json"}


def detail(row):
    return {**summary(row), "scene": json.loads(row["scene_json"])}


def require(connection, identifier):
    row = connection.execute(
        "SELECT * FROM sandplay_projects WHERE id=?", (identifier,)
    ).fetchone()
    if row is None:
        raise StorageError("project_missing", "作品不存在，可能已在其他页面删除。", 404)
    return row


def check_revision(row, revision):
    if row["revision"] != revision:
        raise StorageError(
            "revision_conflict",
            "作品已在其他页面更新。当前编辑仍保留，请另存为新作品，或重新打开最新版本。",
            409,
        )


def encode(scene):
    result = json.dumps(scene.model_dump(), ensure_ascii=False, separators=(",", ":"))
    if len(result.encode("utf-8")) > MAX_PROJECT_BYTES:
        raise StorageError("scene_too_large", "作品数据超出大小限制。", 413)
    return result


class SandplayRepository:
    def __init__(self, database: Database):
        self.database = database

    async def _run(self, operation, *, write=False):
        # Wait for the short transaction even if HTTP disconnects. Never leave
        # a live background SQLite writer behind request cancellation.
        task = asyncio.create_task(
            anyio.to_thread.run_sync(partial(self.database.run, operation, write=write))
        )
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            await task
            raise
        except StorageError as error:
            if error.code in {"storage_unavailable", "storage_busy", "storage_in_use"}:
                raise StorageError(
                    error.code, "本机作品库暂时不可用，当前编辑仍保留，请稍后重试。"
                ) from None
            raise

    async def list(self, limit, offset):
        return await self._run(
            lambda c: [
                summary(row)
                for row in c.execute(
                    "SELECT id,title,schema_version,revision,created_at,updated_at FROM sandplay_projects ORDER BY updated_at DESC,id LIMIT ? OFFSET ?",
                    (limit, offset),
                )
            ]
        )

    async def get(self, identifier):
        return await self._run(lambda c: detail(require(c, identifier)))

    async def create(self, identifier, title, scene):
        scene_json = encode(scene)

        def operation(c):
            existing = c.execute(
                "SELECT * FROM sandplay_projects WHERE id=?", (identifier,)
            ).fetchone()
            if existing:
                # Stable client UUID makes a lost create response retry safe.
                if existing["title"] == title and existing["scene_json"] == scene_json:
                    return detail(existing)
                raise StorageError(
                    "project_id_conflict", "作品保存请求已改变，请另存。", 409
                )
            time = timestamp()
            c.execute(
                "INSERT INTO sandplay_projects(id,title,scene_json,schema_version,revision,created_at,updated_at) VALUES(?,?,?,6,1,?,?)",
                (identifier, title, scene_json, time, time),
            )
            return detail(require(c, identifier))

        return await self._run(operation, write=True)

    async def save(self, identifier, revision, scene):
        scene_json = encode(scene)

        def operation(c):
            row = require(c, identifier)
            # A retry whose previous response was lost is a no-op, only when
            # no intervening revision or different content exists.
            if row["revision"] == revision + 1 and row["scene_json"] == scene_json:
                return detail(row)
            check_revision(row, revision)
            if row["scene_json"] != scene_json:
                c.execute(
                    "UPDATE sandplay_projects SET scene_json=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
                    (scene_json, timestamp(), identifier, revision),
                )
            return detail(require(c, identifier))

        return await self._run(operation, write=True)

    async def rename(self, identifier, revision, title):
        def operation(c):
            row = require(c, identifier)
            check_revision(row, revision)
            if title != row["title"]:
                c.execute(
                    "UPDATE sandplay_projects SET title=?,revision=revision+1,updated_at=? WHERE id=? AND revision=?",
                    (title, timestamp(), identifier, revision),
                )
            return summary(require(c, identifier))

        return await self._run(operation, write=True)

    async def delete(self, identifier, revision):
        def operation(c):
            check_revision(require(c, identifier), revision)
            c.execute("DELETE FROM sandplay_projects WHERE id=?", (identifier,))

        await self._run(operation, write=True)
