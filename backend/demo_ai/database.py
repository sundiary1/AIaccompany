"""Small SQLite boundary: short transactions, bounded lock waits, no body logging."""

import os
import sqlite3
import threading
from collections.abc import Callable
from pathlib import Path
from typing import TypeVar

from .memory_schema import SCHEMA_V2

T = TypeVar("T")
DEFAULT_DATABASE_PATH = Path(__file__).parent / "data/mind_island_demo.sqlite3"


class StorageError(Exception):
    def __init__(
        self,
        code="storage_unavailable",
        message="历史保存暂时不可用，请重试或使用临时聊天。",
        status=503,
    ):
        super().__init__(code)
        self.code, self.message, self.status = code, message, status


SCHEMA_V1 = [
    """CREATE TABLE conversations (
        id TEXT PRIMARY KEY, title TEXT NOT NULL,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        last_message_at TEXT, title_is_custom INTEGER NOT NULL DEFAULT 0
    )""",
    """CREATE TABLE messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        request_id TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user','assistant')),
        content TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending','completed','failed','cancelled')),
        created_at TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 1,
        is_safety INTEGER NOT NULL DEFAULT 0,
        finish_reason TEXT,
        error_code TEXT,
        UNIQUE(conversation_id, sequence), UNIQUE(request_id, role),
        CHECK(role='assistant' OR status='completed'),
        CHECK(status!='completed' OR length(content)>0)
    )""",
    "CREATE INDEX conversations_recent ON conversations(COALESCE(last_message_at,created_at) DESC, updated_at DESC, id)",
    "CREATE INDEX messages_ordered ON messages(conversation_id,sequence)",
    "CREATE UNIQUE INDEX one_pending_reply ON messages(conversation_id) WHERE role='assistant' AND status='pending'",
]


class Database:
    def __init__(self, path: Path):
        self.path = path.resolve()
        self.initialized = False
        self._owner = None
        self._init_lock = threading.Lock()

    def _connect(self):
        connection = sqlite3.connect(self.path, timeout=1, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys=ON")
        connection.execute("PRAGMA busy_timeout=1000")
        connection.execute("PRAGMA synchronous=FULL")
        connection.execute("PRAGMA secure_delete=ON")
        return connection

    def _acquire_owner(self):
        # Prevent a second demo process from treating this process's live turns
        # as crash leftovers. This is an OS-released advisory lock, not user data.
        owner = self.path.with_suffix(".owner.lock").open("a+b")
        try:
            owner.seek(0, 2)
            if owner.tell() == 0:
                owner.write(b"0")
                owner.flush()
            owner.seek(0)
            if os.name == "nt":
                import msvcrt

                msvcrt.locking(owner.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(owner.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            owner.close()
            raise StorageError(
                "storage_in_use", "历史数据库正被另一个本机代理使用。"
            ) from None
        self._owner = owner

    def initialize(self):
        with self._init_lock:
            if self.initialized:
                return
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                self._acquire_owner()
                connection = self._connect()
                try:
                    connection.execute("PRAGMA journal_mode=WAL")
                    connection.execute("BEGIN IMMEDIATE")
                    version = connection.execute("PRAGMA user_version").fetchone()[0]
                    if version > 2:
                        raise StorageError(
                            "schema_version", "历史数据库版本较新，请使用匹配的程序。"
                        )
                    if version == 0:
                        for statement in SCHEMA_V1:
                            connection.execute(statement)
                        connection.execute("PRAGMA user_version=1")
                    if version < 2:
                        for statement in SCHEMA_V2:
                            connection.execute(statement)
                        connection.execute("PRAGMA user_version=2")
                    # Uncertain in-flight LLM calls are NOT automatically repeated.
                    connection.execute(
                        "UPDATE memory_jobs SET status='failed',error_code='interrupted',finished_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='running'"
                    )
                    # With the exclusive process lease, pending rows are from a
                    # previous process. Never recover them as completed replies.
                    connection.execute(
                        "UPDATE messages SET status='cancelled',error_code='interrupted' WHERE status='pending'"
                    )
                    connection.execute("COMMIT")
                    self.initialized = True
                finally:
                    connection.close()
            except (sqlite3.Error, OSError, StorageError) as error:
                self.close()
                if isinstance(error, StorageError):
                    raise
                raise StorageError() from None

    def close(self):
        if self._owner:
            self._owner.close()
            self._owner = None
        self.initialized = False

    def run(self, operation: Callable[[sqlite3.Connection], T], *, write=False) -> T:
        self.initialize()
        try:
            connection = self._connect()
            try:
                if write:
                    connection.execute("BEGIN IMMEDIATE")
                result = operation(connection)
                if write:
                    connection.execute("COMMIT")
                return result
            except BaseException:
                if connection.in_transaction:
                    connection.execute("ROLLBACK")
                raise
            finally:
                connection.close()
        except sqlite3.Error as error:
            busy = getattr(error, "sqlite_errorcode", 0) in {
                sqlite3.SQLITE_BUSY,
                sqlite3.SQLITE_LOCKED,
            }
            if busy:
                raise StorageError(
                    "storage_busy", "历史数据库正忙，请稍后重试。"
                ) from None
            raise StorageError() from None

    def checkpoint(self):
        # Best effort after deletion; logical cascade is already committed.
        try:
            self.run(lambda c: c.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone())
        except StorageError:
            pass
