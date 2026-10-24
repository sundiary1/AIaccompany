import asyncio
from datetime import UTC, datetime
from functools import partial
from uuid import NAMESPACE_URL, uuid4, uuid5

import anyio

from ..database import StorageError
from ..memory_rules import (
    INSTRUCTION,
    SECRET,
    derive,
    lexical_score,
    normalize,
    sensitive,
    validate_candidate,
)


def now():
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def invalidate_jobs(connection):
    connection.execute(
        "UPDATE memory_settings SET epoch=epoch+1,updated_at=? WHERE id=1", (now(),)
    )
    connection.execute(
        "UPDATE memory_jobs SET status='cancelled',error_code='permission_changed',finished_at=? WHERE status IN ('pending','running')",
        (now(),),
    )


def enqueue_memory_job(connection, turn, ticket):
    if ticket is None:
        return False
    settings = connection.execute("SELECT * FROM memory_settings WHERE id=1").fetchone()
    source = connection.execute(
        "SELECT u.created_at FROM messages u JOIN messages a ON a.id=? WHERE u.id=? AND u.role='user' AND a.status='completed' AND a.is_safety=0",
        (turn.assistant_id, turn.request_id),
    ).fetchone()
    if (
        not source
        or not settings["auto_extract"]
        or settings["epoch"] != ticket
        or source["created_at"] < settings["auto_enabled_at"]
    ):
        return False
    identifier = str(uuid5(NAMESPACE_URL, "mind-island:memory:" + turn.request_id))
    result = connection.execute(
        "INSERT OR IGNORE INTO memory_jobs(id,user_message_id,assistant_message_id,conversation_id,epoch,status,created_at) VALUES(?,?,?,?,?,'pending',?)",
        (
            identifier,
            turn.request_id,
            turn.assistant_id,
            turn.conversation_id,
            ticket,
            now(),
        ),
    )
    return result.rowcount == 1


def cleanup_memory_sources(connection):
    # Called in the conversation deletion transaction AFTER FK cascades.
    connection.execute(
        "DELETE FROM memories WHERE source_type='auto' AND NOT EXISTS(SELECT 1 FROM memory_sources s WHERE s.memory_id=memories.id)"
    )
    for memory in connection.execute(
        "SELECT * FROM memories WHERE source_type='auto' AND source_message_id IS NULL"
    ).fetchall():
        source = connection.execute(
            "SELECT * FROM memory_sources WHERE memory_id=? AND normalized=? LIMIT 1",
            (memory["id"], memory["normalized"]),
        ).fetchone()
        if source:
            connection.execute(
                "UPDATE memories SET source_message_id=?,source_conversation_id=?,revision=revision+1,updated_at=? WHERE id=?",
                (source["message_id"], source["conversation_id"], now(), memory["id"]),
            )
        else:
            connection.execute(
                "UPDATE memories SET review_status='pending',revision=revision+1,updated_at=? WHERE id=?",
                (now(), memory["id"]),
            )


class MemoryRepository:
    def __init__(self, database, api_key=""):
        self.database, self.api_key = database, api_key

    async def _run(self, operation, *, write=False):
        # Await the short transaction even on task cancellation. Closing the
        # process lease while a detached thread still writes is unsafe on Windows.
        task = asyncio.create_task(
            anyio.to_thread.run_sync(partial(self.database.run, operation, write=write))
        )
        try:
            return await asyncio.shield(task)
        except asyncio.CancelledError:
            await task
            raise

    async def settings(self):
        return await self._run(
            lambda c: dict(
                c.execute("SELECT * FROM memory_settings WHERE id=1").fetchone()
            )
        )

    async def update_settings(self, body):
        def operation(c):
            current = dict(
                c.execute("SELECT * FROM memory_settings WHERE id=1").fetchone()
            )
            auto = (
                current["auto_extract"]
                if body.auto_extract is None
                else int(body.auto_extract)
            )
            use = (
                current["use_memories"]
                if body.use_memories is None
                else int(body.use_memories)
            )
            if (auto or use) and not current["consented_at"] and not body.acknowledge:
                raise StorageError(
                    "consent_required", "请先阅读并确认记忆授权说明。", 422
                )
            consented = current["consented_at"] or (now() if body.acknowledge else None)
            if auto != current["auto_extract"] or use != current["use_memories"]:
                invalidate_jobs(c)
            c.execute(
                "UPDATE memory_settings SET auto_extract=?,use_memories=?,consent_version=?,consented_at=?,auto_enabled_at=?,updated_at=? WHERE id=1",
                (
                    auto,
                    use,
                    1 if consented else 0,
                    consented,
                    now()
                    if auto and not current["auto_extract"]
                    else current["auto_enabled_at"],
                    now(),
                ),
            )
            return dict(
                c.execute("SELECT * FROM memory_settings WHERE id=1").fetchone()
            )

        return await self._run(operation, write=True)

    async def ticket(self):
        s = await self.settings()
        return s["epoch"] if s["auto_extract"] and s["consented_at"] else None

    async def list(self):
        def operation(c):
            rows = [
                dict(r)
                for r in c.execute(
                    "SELECT m.*,EXISTS(SELECT 1 FROM memories p WHERE p.related_memory_id=m.id AND p.review_status='pending') AS blocked_by_review FROM memories m ORDER BY updated_at DESC,id LIMIT 200"
                )
            ]
            for row in rows:
                row["sources"] = [
                    dict(s)
                    for s in c.execute(
                        "SELECT s.message_id,s.conversation_id,s.evidence,c.title AS conversation_title,s.created_at FROM memory_sources s JOIN conversations c ON c.id=s.conversation_id WHERE s.memory_id=? ORDER BY s.created_at DESC",
                        (row["id"],),
                    )
                ]
            return rows

        return await self._run(operation)

    def _manual(self, content, allow_sensitive):
        if (
            SECRET.search(content)
            or INSTRUCTION.search(content)
            or (self.api_key and self.api_key in content)
        ):
            raise StorageError(
                "memory_private",
                "不能保存凭证、身份号码或系统指令；请去除这些内容。",
                422,
            )
        flag = sensitive(content)
        if flag and not allow_sensitive:
            raise StorageError(
                "sensitive_confirmation",
                "这可能包含敏感经历，请明确确认主动保存；不会自动提取此类内容。",
                422,
            )
        return flag

    async def create(self, body):
        flag = self._manual(body.content, body.allow_sensitive)
        fact = derive(body.content.replace("用户", "我", 1))

        def operation(c):
            normalized = normalize(body.content)
            if c.execute(
                "SELECT 1 FROM memories WHERE normalized=?", (normalized,)
            ).fetchone():
                raise StorageError(
                    "duplicate_memory", "已有相同记忆，可直接编辑原条目。", 409
                )
            identifier, timestamp = str(uuid4()), now()
            if c.execute("SELECT COUNT(*) FROM memories").fetchone()[0] >= 200:
                raise StorageError(
                    "memory_limit", "记忆信箱已达 200 条，请先整理已有记忆。", 409
                )
            c.execute(
                "INSERT INTO memories(id,content,category,normalized,topic_key,phase,source_type,enabled,review_status,user_edited,sensitive,created_at,updated_at) VALUES(?,?,?,?,?,?,'manual',?,'approved',1,?,?,?)",
                (
                    identifier,
                    body.content,
                    body.category,
                    normalized,
                    fact.topic if fact else "manual:" + normalized,
                    fact.phase if fact else "",
                    int(body.enabled),
                    int(flag),
                    timestamp,
                    timestamp,
                ),
            )
            return dict(
                c.execute("SELECT * FROM memories WHERE id=?", (identifier,)).fetchone()
            )

        return await self._run(operation, write=True)

    async def patch(self, identifier, body):
        def operation(c):
            row = c.execute(
                "SELECT * FROM memories WHERE id=?", (identifier,)
            ).fetchone()
            if not row:
                raise StorageError("memory_missing", "这条记忆已不存在。", 404)
            content, category = (
                body.content or row["content"],
                body.category or row["category"],
            )
            edited = (
                body.content is not None
                or body.category is not None
                or body.review_status == "approved"
            )
            flag = self._manual(
                content,
                body.allow_sensitive
                or (row["sensitive"] and not edited and body.enabled is not True),
            )
            status = body.review_status or row["review_status"]
            if (
                status == "approved"
                and row["related_memory_id"]
                and not body.resolve_conflict
            ):
                raise StorageError(
                    "review_required", "核对冲突后，请确认停用关联的旧记忆。", 422
                )
            if edited:
                invalidate_jobs(c)
                c.execute(
                    "INSERT INTO memory_versions(id,memory_id,content,source_message_id,created_at) VALUES(?,?,?,?,?)",
                    (
                        str(uuid4()),
                        identifier,
                        row["content"],
                        row["source_message_id"],
                        now(),
                    ),
                )
            if (
                status == "approved"
                and row["related_memory_id"]
                and body.resolve_conflict
            ):
                c.execute(
                    "UPDATE memories SET enabled=0,revision=revision+1,updated_at=? WHERE id=?",
                    (now(), row["related_memory_id"]),
                )
            fact = derive(content.replace("用户", "我", 1))
            c.execute(
                "UPDATE memories SET content=?,category=?,normalized=?,topic_key=?,phase=?,enabled=?,review_status=?,user_edited=?,sensitive=?,related_memory_id=?,revision=revision+1,updated_at=? WHERE id=?",
                (
                    content,
                    category,
                    normalize(content),
                    fact.topic if fact else row["topic_key"],
                    fact.phase if fact else row["phase"],
                    row["enabled"] if body.enabled is None else int(body.enabled),
                    status,
                    int(bool(row["user_edited"]) or edited),
                    int(flag),
                    None if status == "approved" else row["related_memory_id"],
                    now(),
                    identifier,
                ),
            )
            return dict(
                c.execute("SELECT * FROM memories WHERE id=?", (identifier,)).fetchone()
            )

        return await self._run(operation, write=True)

    async def delete(self, identifier=None):
        def operation(c):
            if (
                identifier
                and not c.execute(
                    "SELECT 1 FROM memories WHERE id=?", (identifier,)
                ).fetchone()
            ):
                raise StorageError("memory_missing", "这条记忆已不存在。", 404)
            invalidate_jobs(c)
            if identifier:
                c.execute("DELETE FROM memories WHERE id=?", (identifier,))
            else:
                c.execute("DELETE FROM memories WHERE source_type='auto'")

        await self._run(operation, write=True)
        await anyio.to_thread.run_sync(self.database.checkpoint)

    async def retrieve(self, query, max_items=5, max_chars=1000):
        def operation(c):
            rows = c.execute(
                "SELECT m.* FROM memories m JOIN memory_settings s ON s.id=1 WHERE s.use_memories=1 AND s.consented_at IS NOT NULL AND m.enabled=1 AND m.review_status='approved' AND NOT EXISTS(SELECT 1 FROM memories p WHERE p.related_memory_id=m.id AND p.review_status='pending') ORDER BY m.updated_at DESC LIMIT 200"
            ).fetchall()
            current = derive(query)
            ranked = []
            for row in rows:
                if (
                    current
                    and current.topic == row["topic_key"]
                    and normalize(current.content) != row["normalized"]
                ):
                    continue
                score = lexical_score(query, row["content"], row["category"])
                if score:
                    ranked.append((score, row))
            ranked.sort(key=lambda pair: pair[0], reverse=True)
            result, used, topics = [], 0, set()
            for _, row in ranked:
                if row["topic_key"] in topics or used + len(row["content"]) > max_chars:
                    continue
                result.append({"content": row["content"], "category": row["category"]})
                used += len(row["content"])
                topics.add(row["topic_key"])
                if len(result) >= max_items:
                    break
            return result

        return await self._run(operation)

    async def claim(self, max_calls, mock=False):
        def operation(c):
            job = c.execute(
                "SELECT * FROM memory_jobs WHERE status='pending' ORDER BY created_at LIMIT 1"
            ).fetchone()
            if not job:
                return None
            settings = c.execute("SELECT * FROM memory_settings WHERE id=1").fetchone()
            source = c.execute(
                "SELECT u.id,u.content,u.created_at,a.status,a.is_safety FROM messages u JOIN messages a ON a.id=? WHERE u.id=? AND u.role='user'",
                (job["assistant_message_id"], job["user_message_id"]),
            ).fetchone()
            if (
                not source
                or not settings["auto_extract"]
                or settings["epoch"] != job["epoch"]
                or source["status"] != "completed"
                or source["is_safety"]
                or source["created_at"] < settings["auto_enabled_at"]
            ):
                c.execute(
                    "UPDATE memory_jobs SET status='cancelled',error_code='source_changed',finished_at=? WHERE id=?",
                    (now(), job["id"]),
                )
                return None
            calls = c.execute(
                "SELECT COUNT(*) FROM memory_calls WHERE created_at>=?",
                (now()[:10] + "T",),
            ).fetchone()[0]
            if not mock and calls >= max_calls:
                c.execute(
                    "UPDATE memory_jobs SET status='failed',error_code='daily_budget',finished_at=? WHERE id=?",
                    (now(), job["id"]),
                )
                return None
            c.execute(
                "UPDATE memory_jobs SET status='running',attempts=attempts+1,started_at=? WHERE id=?",
                (now(), job["id"]),
            )
            result = dict(job)
            result["attempts"] = job["attempts"] + 1
            result["source"] = dict(source)
            result["existing"] = [
                dict(r)
                for r in c.execute(
                    "SELECT m.*,EXISTS(SELECT 1 FROM memories p WHERE p.related_memory_id=m.id AND p.review_status='pending') AS blocked_by_review FROM memories m ORDER BY updated_at DESC LIMIT 40"
                )
            ]
            result["references"] = (
                [
                    r
                    for r in result["existing"]
                    if r["enabled"]
                    and r["review_status"] == "approved"
                    and not r["sensitive"]
                    and not r["blocked_by_review"]
                ][:8]
                if settings["use_memories"]
                else []
            )
            return result

        return await self._run(operation, write=True)

    async def active(self, job):
        return await self._run(
            lambda c: bool(
                c.execute(
                    "SELECT 1 FROM memory_jobs j JOIN memory_settings s ON s.id=1 JOIN messages u ON u.id=j.user_message_id JOIN messages a ON a.id=j.assistant_message_id WHERE j.id=? AND j.status='running' AND s.auto_extract=1 AND j.epoch=s.epoch AND a.status='completed'",
                    (job["id"],),
                ).fetchone()
            )
        )

    async def mark_call(self, job):
        def operation(c):
            result = c.execute(
                "INSERT OR IGNORE INTO memory_calls(job_id,attempt,created_at) VALUES(?,?,?)",
                (job["id"], job["attempts"], now()),
            )
            if result.rowcount:
                c.execute(
                    "UPDATE memory_jobs SET provider_calls=provider_calls+1 WHERE id=? AND status='running'",
                    (job["id"],),
                )

        await self._run(operation, write=True)

    async def record_usage(self, job, usage):
        def operation(c):
            c.execute(
                "UPDATE memory_calls SET input_tokens=?,output_tokens=? WHERE job_id=? AND attempt=?",
                (
                    usage.get("prompt_tokens", 0),
                    usage.get("completion_tokens", 0),
                    job["id"],
                    job["attempts"],
                ),
            )
            c.execute(
                "UPDATE memory_jobs SET input_tokens=(SELECT COALESCE(SUM(input_tokens),0) FROM memory_calls WHERE job_id=?),output_tokens=(SELECT COALESCE(SUM(output_tokens),0) FROM memory_calls WHERE job_id=?) WHERE id=?",
                (job["id"], job["id"], job["id"]),
            )

        await self._run(operation, write=True)

    async def fail(self, job, code, usage=None):
        usage = usage or {}
        await self._run(
            lambda c: c.execute(
                "UPDATE memory_jobs SET status='failed',error_code=?,input_tokens=input_tokens+?,output_tokens=output_tokens+?,finished_at=? WHERE id=? AND status='running'",
                (
                    code,
                    usage.get("prompt_tokens", 0),
                    usage.get("completion_tokens", 0),
                    now(),
                    job["id"],
                ),
            ),
            write=True,
        )

    async def finish_job(self, job, candidates, usage=None):
        usage = usage or {}

        def operation(c):
            current = c.execute(
                "SELECT j.* FROM memory_jobs j JOIN memory_settings s ON s.id=1 WHERE j.id=? AND j.status='running' AND j.epoch=s.epoch AND s.auto_extract=1",
                (job["id"],),
            ).fetchone()
            source = c.execute(
                "SELECT * FROM messages WHERE id=? AND role='user'",
                (job["user_message_id"],),
            ).fetchone()
            assistant = c.execute(
                "SELECT 1 FROM messages WHERE id=? AND status='completed' AND is_safety=0",
                (job["assistant_message_id"],),
            ).fetchone()
            if not current or not source or not assistant:
                return False
            added = updated = reviews = skipped = 0
            for candidate in candidates:
                fact = validate_candidate(candidate, dict(source), self.api_key)
                if not fact:
                    skipped += 1
                    continue
                normalized = normalize(fact.content)
                same = c.execute(
                    "SELECT * FROM memories WHERE normalized=? ORDER BY updated_at DESC LIMIT 1",
                    (normalized,),
                ).fetchone()
                existing = c.execute(
                    "SELECT * FROM memories WHERE topic_key=? AND review_status='approved' ORDER BY updated_at DESC LIMIT 1",
                    (fact.topic,),
                ).fetchone()
                if candidate.target_id:
                    target = c.execute(
                        "SELECT * FROM memories WHERE id=?", (str(candidate.target_id),)
                    ).fetchone()
                    if not target or not any(
                        r["id"] == target["id"] for r in job["existing"]
                    ):
                        skipped += 1
                        continue
                    existing = target
                timestamp = now()
                if same:
                    if same["source_type"] == "auto":
                        self._source(
                            c,
                            same["id"],
                            job,
                            candidate.evidence,
                            normalized,
                            timestamp,
                        )
                    skipped += 1
                    continue
                expected = next(
                    (
                        r
                        for r in job["existing"]
                        if existing and r["id"] == existing["id"]
                    ),
                    None,
                )
                can_update = (
                    existing
                    and expected
                    and expected["revision"] == existing["revision"]
                    and existing["source_type"] == "auto"
                    and existing["review_status"] == "approved"
                    and not existing["user_edited"]
                    and fact.explicit
                    and (fact.topic == existing["topic_key"])
                )
                if can_update:
                    c.execute(
                        "INSERT INTO memory_versions(id,memory_id,content,source_message_id,created_at) VALUES(?,?,?,?,?)",
                        (
                            str(uuid4()),
                            existing["id"],
                            existing["content"],
                            existing["source_message_id"],
                            timestamp,
                        ),
                    )
                    c.execute(
                        "UPDATE memories SET content=?,normalized=?,phase=?,category=?,source_conversation_id=?,source_message_id=?,revision=revision+1,updated_at=? WHERE id=?",
                        (
                            fact.content,
                            normalized,
                            fact.phase,
                            fact.category,
                            job["conversation_id"],
                            job["user_message_id"],
                            timestamp,
                            existing["id"],
                        ),
                    )
                    identifier = existing["id"]
                    updated += 1
                else:
                    if c.execute("SELECT COUNT(*) FROM memories").fetchone()[0] >= 200:
                        skipped += 1
                        continue
                    identifier = str(uuid4())
                    pending = existing is not None
                    c.execute(
                        "INSERT INTO memories(id,content,category,normalized,topic_key,phase,source_type,source_conversation_id,source_message_id,review_status,related_memory_id,created_at,updated_at) VALUES(?,?,?,?,?,?,'auto',?,?,?,?,?,?)",
                        (
                            identifier,
                            fact.content,
                            fact.category,
                            normalized,
                            fact.topic,
                            fact.phase,
                            job["conversation_id"],
                            job["user_message_id"],
                            "pending" if pending else "approved",
                            existing["id"] if existing else None,
                            timestamp,
                            timestamp,
                        ),
                    )
                    if pending:
                        reviews += 1
                    else:
                        added += 1
                self._source(
                    c, identifier, job, candidate.evidence, normalized, timestamp
                )
            c.execute(
                "UPDATE memory_jobs SET status='completed',added_count=?,updated_count=?,review_count=?,skipped_count=?,input_tokens=input_tokens+?,output_tokens=output_tokens+?,finished_at=? WHERE id=?",
                (
                    added,
                    updated,
                    reviews,
                    skipped,
                    usage.get("prompt_tokens", 0),
                    usage.get("completion_tokens", 0),
                    now(),
                    job["id"],
                ),
            )
            return True

        return await self._run(operation, write=True)

    @staticmethod
    def _source(c, identifier, job, evidence, normalized, timestamp):
        c.execute(
            "INSERT OR IGNORE INTO memory_sources(memory_id,conversation_id,message_id,evidence,normalized,created_at) VALUES(?,?,?,?,?,?)",
            (
                identifier,
                job["conversation_id"],
                job["user_message_id"],
                evidence,
                normalized,
                timestamp,
            ),
        )

    async def status(self):
        def operation(c):
            jobs = [
                dict(r)
                for r in c.execute(
                    "SELECT * FROM memory_jobs ORDER BY created_at DESC LIMIT 20"
                )
            ]
            totals = dict(
                c.execute(
                    "SELECT COUNT(*) AS provider_calls,COALESCE(SUM(input_tokens),0) AS input_tokens,COALESCE(SUM(output_tokens),0) AS output_tokens FROM memory_calls"
                ).fetchone()
            )
            return {
                "jobs": jobs,
                "usage": totals,
                "memory_count": c.execute("SELECT COUNT(*) FROM memories").fetchone()[
                    0
                ],
            }

        return await self._run(operation)

    async def retry(self, identifier, max_attempts):
        def operation(c):
            job = c.execute(
                "SELECT j.*,s.auto_extract,s.epoch AS current_epoch FROM memory_jobs j JOIN memory_settings s ON s.id=1 WHERE j.id=?",
                (identifier,),
            ).fetchone()
            if not job:
                raise StorageError("job_missing", "这项提取任务已不存在。", 404)
            if (
                job["status"] != "failed"
                or job["attempts"] >= max_attempts
                or not job["auto_extract"]
                or job["epoch"] != job["current_epoch"]
            ):
                raise StorageError(
                    "job_retry_denied",
                    "此任务不能重试；已达到上限或授权/来源已变化。",
                    409,
                )
            c.execute(
                "UPDATE memory_jobs SET status='pending',error_code=NULL WHERE id=?",
                (identifier,),
            )

        await self._run(operation, write=True)
