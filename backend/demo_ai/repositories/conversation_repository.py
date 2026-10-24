from dataclasses import dataclass
from datetime import UTC, datetime
from functools import partial
from uuid import NAMESPACE_URL, uuid4, uuid5

import anyio

from ..database import Database, StorageError
from .memory_repository import cleanup_memory_sources, enqueue_memory_job


def utc_now() -> str:
    return datetime.now(UTC).isoformat(timespec="microseconds").replace("+00:00", "Z")


def require_conversation(connection, conversation_id):
    row = connection.execute(
        "SELECT * FROM conversations WHERE id=?", (conversation_id,)
    ).fetchone()
    if row is None:
        raise StorageError(
            "conversation_missing", "这段对话已不存在，请新建对话。", 404
        )
    return row


def require_idle(connection, conversation_id):
    if connection.execute(
        "SELECT 1 FROM messages WHERE conversation_id=? AND status='pending'",
        (conversation_id,),
    ).fetchone():
        raise StorageError(
            "conversation_busy", "这段对话仍在生成，请先停止或稍后重试。", 409
        )


@dataclass
class Turn:
    conversation_id: str
    request_id: str
    assistant_id: str
    attempt: int
    history: list[dict[str, str]]
    replay: dict | None = None


class ConversationRepository:
    def __init__(self, database: Database):
        self.database = database
        self.recovery: dict[str, tuple[Turn, str]] = {}

    async def _run(self, operation, *, write=False):
        return await anyio.to_thread.run_sync(
            partial(self.database.run, operation, write=write)
        )

    async def initialize(self):
        await anyio.to_thread.run_sync(self.database.initialize)

    async def create(self, title="新的对话", custom=False, identifier=None):
        def operation(connection):
            now, conversation_id = utc_now(), identifier or str(uuid4())
            existing = connection.execute(
                "SELECT * FROM conversations WHERE id=?", (conversation_id,)
            ).fetchone()
            if existing:
                return dict(existing)
            connection.execute(
                "INSERT INTO conversations(id,title,created_at,updated_at,title_is_custom) VALUES(?,?,?,?,?)",
                (conversation_id, title, now, now, int(custom)),
            )
            return dict(require_conversation(connection, conversation_id))

        return await self._run(operation, write=True)

    async def list(self, limit=100, offset=0):
        return await self._run(
            lambda c: [
                dict(row)
                for row in c.execute(
                    "SELECT * FROM conversations ORDER BY COALESCE(last_message_at,created_at) DESC,updated_at DESC,id LIMIT ? OFFSET ?",
                    (limit, offset),
                )
            ]
        )

    async def messages(self, conversation_id):
        def operation(connection):
            conversation = dict(require_conversation(connection, conversation_id))
            rows = connection.execute(
                "SELECT * FROM messages WHERE conversation_id=? ORDER BY sequence",
                (conversation_id,),
            ).fetchall()
            return {
                "conversation": conversation,
                "messages": [dict(row) for row in rows],
            }

        return await self._run(operation)

    async def rename(self, conversation_id, title):
        def operation(connection):
            require_conversation(connection, conversation_id)
            connection.execute(
                "UPDATE conversations SET title=?,title_is_custom=1,updated_at=? WHERE id=?",
                (title, utc_now(), conversation_id),
            )
            return dict(require_conversation(connection, conversation_id))

        return await self._run(operation, write=True)

    async def delete(self, conversation_id):
        def operation(connection):
            require_conversation(connection, conversation_id)
            require_idle(connection, conversation_id)
            connection.execute(
                "DELETE FROM conversations WHERE id=?", (conversation_id,)
            )
            cleanup_memory_sources(connection)

        await self._run(operation, write=True)
        await anyio.to_thread.run_sync(self.database.checkpoint)

    async def clear(self, conversation_id):
        def operation(connection):
            conversation = require_conversation(connection, conversation_id)
            require_idle(connection, conversation_id)
            connection.execute(
                "DELETE FROM messages WHERE conversation_id=?", (conversation_id,)
            )
            cleanup_memory_sources(connection)
            title = (
                conversation["title"] if conversation["title_is_custom"] else "新的对话"
            )
            connection.execute(
                "UPDATE conversations SET title=?,last_message_at=NULL,updated_at=? WHERE id=?",
                (title, utc_now(), conversation_id),
            )

        await self._run(operation, write=True)
        await anyio.to_thread.run_sync(self.database.checkpoint)

    async def begin_turn(
        self, conversation_id: str, request_id: str, content: str
    ) -> Turn:
        def operation(connection):
            conversation = require_conversation(connection, conversation_id)
            existing = connection.execute(
                "SELECT * FROM messages WHERE id=?", (request_id,)
            ).fetchone()
            assistant_id = str(
                uuid5(NAMESPACE_URL, f"mind-island:assistant:{request_id}")
            )
            replay = None
            attempt = 1
            if existing:
                if (
                    existing["conversation_id"] != conversation_id
                    or existing["role"] != "user"
                    or existing["content"] != content
                ):
                    raise StorageError(
                        "request_conflict", "消息标识与原消息不一致，请新建消息。", 409
                    )
                assistant = connection.execute(
                    "SELECT * FROM messages WHERE id=?", (assistant_id,)
                ).fetchone()
                if assistant["status"] == "completed":
                    replay = dict(assistant)
                else:
                    require_idle(connection, conversation_id)
                    latest = connection.execute(
                        "SELECT MAX(sequence) FROM messages WHERE conversation_id=?",
                        (conversation_id,),
                    ).fetchone()[0]
                    if assistant["sequence"] != latest:
                        raise StorageError(
                            "retry_order",
                            "这条旧消息之后已有新对话，请发送新消息。",
                            409,
                        )
                    attempt = assistant["attempt"] + 1
                    connection.execute(
                        "UPDATE messages SET status='pending',content='',attempt=?,error_code=NULL,finish_reason=NULL,is_safety=0 WHERE id=?",
                        (attempt, assistant_id),
                    )
            else:
                require_idle(connection, conversation_id)
                latest = connection.execute(
                    "SELECT COALESCE(MAX(sequence),0) FROM messages WHERE conversation_id=?",
                    (conversation_id,),
                ).fetchone()[0]
                now = utc_now()
                connection.execute(
                    "INSERT INTO messages(id,conversation_id,request_id,sequence,role,content,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (
                        request_id,
                        conversation_id,
                        request_id,
                        latest + 1,
                        "user",
                        content,
                        "completed",
                        now,
                    ),
                )
                connection.execute(
                    "INSERT INTO messages(id,conversation_id,request_id,sequence,role,content,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
                    (
                        assistant_id,
                        conversation_id,
                        request_id,
                        latest + 2,
                        "assistant",
                        "",
                        "pending",
                        now,
                    ),
                )
                if latest == 0 and not conversation["title_is_custom"]:
                    title = " ".join(content.split())[:20] or "新的对话"
                    connection.execute(
                        "UPDATE conversations SET title=? WHERE id=?",
                        (title, conversation_id),
                    )
            if not replay:
                now = utc_now()
                connection.execute(
                    "UPDATE conversations SET updated_at=?,last_message_at=? WHERE id=?",
                    (now, now, conversation_id),
                )
            boundary = existing["sequence"] if existing else latest + 1
            pairs = connection.execute(
                """SELECT u.content AS user_content,a.content AS assistant_content
                FROM messages u JOIN messages a ON u.request_id=a.request_id AND a.role='assistant'
                WHERE u.conversation_id=? AND u.role='user' AND a.status='completed' AND u.sequence<?
                ORDER BY u.sequence DESC LIMIT 6""",
                (conversation_id, boundary),
            ).fetchall()
            selected, characters = [], 0
            for pair in pairs:
                size = len(pair["user_content"]) + len(pair["assistant_content"])
                if characters + size > 10000:
                    break
                characters += size
                selected.insert(
                    0,
                    [
                        {"role": "user", "content": pair["user_content"]},
                        {"role": "assistant", "content": pair["assistant_content"]},
                    ],
                )
            return Turn(
                conversation_id,
                request_id,
                assistant_id,
                attempt,
                [m for pair in selected for m in pair],
                replay,
            )

        return await self._run(operation, write=True)

    async def finish(
        self,
        turn: Turn,
        content: str,
        status: str,
        *,
        safety=False,
        reason=None,
        error=None,
        memory_ticket=None,
    ):
        def operation(connection):
            result = connection.execute(
                "UPDATE messages SET content=?,status=?,is_safety=?,finish_reason=?,error_code=? WHERE id=? AND status='pending' AND attempt=?",
                (
                    content,
                    status,
                    int(safety),
                    reason,
                    error,
                    turn.assistant_id,
                    turn.attempt,
                ),
            )
            if result.rowcount != 1:
                raise StorageError(
                    "turn_changed", "回复状态已变化，请重新载入历史。", 409
                )
            now = utc_now()
            connection.execute(
                "UPDATE conversations SET updated_at=?,last_message_at=? WHERE id=?",
                (now, now, turn.conversation_id),
            )
            outcome = {"memory_queued": False, "memory_warning": False}
            if status == "completed" and not safety and memory_ticket is not None:
                connection.execute("SAVEPOINT memory_enqueue")
                try:
                    outcome["memory_queued"] = enqueue_memory_job(
                        connection, turn, memory_ticket
                    )
                except Exception:
                    connection.execute("ROLLBACK TO memory_enqueue")
                    outcome["memory_warning"] = True
                finally:
                    connection.execute("RELEASE memory_enqueue")
            return outcome

        return await self._run(operation, write=True)

    def defer_cancel(self, turn, content):
        self.recovery[turn.assistant_id] = (turn, content)

    async def recover(self):
        for identifier, (turn, content) in list(self.recovery.items()):
            try:
                await self.finish(turn, content, "cancelled", error="save_failed")
            except StorageError as error:
                if error.code != "turn_changed":
                    continue
            self.recovery.pop(identifier, None)
