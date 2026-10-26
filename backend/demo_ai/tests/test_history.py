import asyncio
import json
import sqlite3
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
from fastapi.testclient import TestClient

from demo_ai.config import Settings
from demo_ai.database import StorageError
from demo_ai.main import create_app
from demo_ai.provider import AIError


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "history.sqlite3"
        self.calls = []

    def app(self):
        def handler(request):
            self.calls.append(json.loads(request.content))
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "test reply"}}]}
            )

        return create_app(
            Settings(
                mode="live",
                api_key="test-only",
                base_url="https://provider.invalid/v1",
                model="test-only",
            ),
            transport=httpx.MockTransport(handler),
            database_path=self.path,
        )

    def client(self):
        return TestClient(
            self.app(), base_url="http://127.0.0.1", client=("127.0.0.1", 12345)
        )

    def create(self, client):
        response = client.post("/api/demo/conversations", json={})
        self.assertEqual(response.status_code, 201)
        return response.json()["id"]

    def send(self, client, conversation_id, text="hello", request_id=None):
        identifier = request_id or str(uuid4())
        response = client.post(
            "/api/demo/chat/stream",
            json={
                "message": text,
                "conversation_id": conversation_id,
                "request_id": identifier,
                "temporary": False,
            },
        )
        return response, identifier

    def messages(self, client, conversation_id):
        return client.get(f"/api/demo/conversations/{conversation_id}/messages").json()[
            "messages"
        ]

    def test_create_title_and_utc(self):
        with self.client() as c:
            identifier = self.create(c)
            response, _ = self.send(
                c, identifier, "今天\n 想在岛上慢慢走一走然后看看天空和树林"
            )
            self.assertIn('"persisted": true', response.text)
            row = c.get("/api/demo/conversations").json()[0]
            self.assertEqual(
                row["title"], "今天 想在岛上慢慢走一走然后看看天空和树林"[:20]
            )
            self.assertTrue(row["created_at"].endswith("Z"))
            self.assertEqual(
                [m["status"] for m in self.messages(c, identifier)],
                ["completed", "completed"],
            )

    def test_second_owner_cannot_recover_an_active_process(self):
        with self.client() as first:
            identifier = self.create(first)
            asyncio.run(
                first.app.state.repository.begin_turn(
                    identifier, str(uuid4()), "active turn"
                )
            )
            with self.client() as second:
                response = second.get("/api/demo/conversations")
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()["error"]["code"], "storage_in_use")
            self.assertEqual(self.messages(first, identifier)[-1]["status"], "pending")

    def test_newer_schema_is_rejected_without_overwriting(self):
        with self.client() as c:
            identifier = self.create(c)
            self.send(c, identifier)
        with closing(sqlite3.connect(self.path)) as db:
            db.execute("PRAGMA user_version=4")
        with self.client() as c:
            response = c.get("/api/demo/conversations")
            self.assertEqual(response.json()["error"]["code"], "schema_version")
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 2
            )

    def test_temporary_works_when_history_database_cannot_open(self):
        self.path.mkdir()
        with self.client() as c:
            self.assertEqual(c.get("/api/demo/conversations").status_code, 503)
            response = c.post(
                "/api/demo/chat/stream",
                json={"message": "temporary without storage", "temporary": True},
            )
            self.assertIn("event: done", response.text)
            self.assertIn('"persisted": false', response.text)

    def test_create_idempotency(self):
        identifier = str(uuid4())
        with self.client() as c:
            first = c.post("/api/demo/conversations", json={"id": identifier}).json()
            second = c.post("/api/demo/conversations", json={"id": identifier}).json()
            self.assertEqual(first, second)
            self.assertEqual(len(c.get("/api/demo/conversations").json()), 1)

    def test_list_order(self):
        with self.client() as c:
            first, second = self.create(c), self.create(c)
            self.send(c, first)
            self.send(c, second)
            self.assertEqual(c.get("/api/demo/conversations").json()[0]["id"], second)
            self.send(c, first)
            self.assertEqual(c.get("/api/demo/conversations").json()[0]["id"], first)

    def test_restart_restores_and_initialization_is_repeatable(self):
        with self.client() as c:
            identifier = self.create(c)
            self.send(c, identifier)
            before = self.messages(c, identifier)
        with self.client() as c:
            self.assertEqual(before, self.messages(c, identifier))
            self.send(c, identifier, "continue")
            self.assertEqual(
                self.calls[-1]["messages"][1:3],
                [
                    {"role": "user", "content": "hello"},
                    {"role": "assistant", "content": "test reply"},
                ],
            )

    def test_rename_is_parameterized_and_kept(self):
        with self.client() as c:
            identifier = self.create(c)
            title = "岛屿'); DROP TABLE messages; --"
            self.assertEqual(
                c.patch(
                    f"/api/demo/conversations/{identifier}", json={"title": title}
                ).json()["title"],
                title,
            )
            self.send(c, identifier)
            self.assertEqual(c.get("/api/demo/conversations").json()[0]["title"], title)
            self.assertEqual(len(self.messages(c, identifier)), 2)

    def test_delete_cascades(self):
        with self.client() as c:
            identifier = self.create(c)
            self.send(c, identifier)
            self.assertEqual(
                c.delete(f"/api/demo/conversations/{identifier}").status_code, 204
            )
            self.assertEqual(
                c.get(f"/api/demo/conversations/{identifier}/messages").status_code, 404
            )
            with closing(sqlite3.connect(self.path)) as db:
                self.assertEqual(
                    db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 0
                )
                self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_clear_history_removes_context(self):
        with self.client() as c:
            identifier = self.create(c)
            self.send(c, identifier)
            self.assertEqual(
                c.delete(f"/api/demo/conversations/{identifier}/messages").status_code,
                204,
            )
            self.assertEqual(self.messages(c, identifier), [])
            self.send(c, identifier, "new start")
            self.assertEqual(len(self.calls[-1]["messages"]), 2)

    def test_temporary_content_never_reaches_sqlite(self):
        needle = "PRIVATE_TEMPORARY_TEST_ONLY_42918"
        with self.client() as c:
            response = c.post(
                "/api/demo/chat/stream", json={"message": needle, "temporary": True}
            )
            self.assertIn('"persisted": false', response.text)
            self.assertEqual(c.get("/api/demo/conversations").json(), [])
            with closing(sqlite3.connect(self.path)) as db:
                self.assertEqual(
                    db.execute("SELECT COUNT(*) FROM messages").fetchone()[0], 0
                )
            for file in self.path.parent.glob("history.sqlite3*"):
                self.assertNotIn(needle.encode(), file.read_bytes())

    def test_server_context_and_reject_client_spoofing(self):
        with self.client() as c:
            identifier = self.create(c)
            self.send(c, identifier, "first turn")
            bad = c.post(
                "/api/demo/chat/stream",
                json={
                    "message": "next",
                    "conversation_id": identifier,
                    "request_id": str(uuid4()),
                    "history": [
                        {"role": "user", "content": "fake"},
                        {"role": "assistant", "content": "fake"},
                    ],
                },
            )
            self.assertEqual(bad.status_code, 422)
            self.send(c, identifier, "next")
            self.assertEqual(self.calls[-1]["messages"][1]["content"], "first turn")

    def test_completed_duplicate_replays_without_provider_call(self):
        with self.client() as c:
            identifier = self.create(c)
            _, request_id = self.send(c, identifier)
            response, _ = self.send(c, identifier, request_id=request_id)
            self.assertIn('"replayed": true', response.text)
            self.assertEqual(len(self.calls), 1)
            self.assertEqual(len(self.messages(c, identifier)), 2)

    def test_failed_retry_has_stable_ids_and_no_duplicates(self):
        with self.client() as c:
            identifier = self.create(c)
            provider = c.app.state.provider
            with patch.object(
                provider, "stream", side_effect=AIError("network", "test failure")
            ):
                _, request_id = self.send(c, identifier)
            failed = self.messages(c, identifier)
            self.assertEqual(failed[-1]["status"], "failed")
            response, _ = self.send(c, identifier, request_id=request_id)
            self.assertIn("event: done", response.text)
            restored = self.messages(c, identifier)
            self.assertEqual([r["id"] for r in failed], [r["id"] for r in restored])
            self.assertEqual(restored[-1]["attempt"], 2)

    def test_failed_turn_is_excluded_from_next_context(self):
        with self.client() as c:
            identifier = self.create(c)
            with patch.object(
                c.app.state.provider,
                "stream",
                side_effect=AIError("timeout", "test timeout"),
            ):
                self.send(c, identifier, "failed user message")
            self.send(c, identifier, "next")
            self.assertEqual(len(self.calls[-1]["messages"]), 2)

    def test_same_id_different_content_is_conflict(self):
        with self.client() as c:
            identifier = self.create(c)
            _, request_id = self.send(c, identifier)
            response, _ = self.send(c, identifier, "changed content", request_id)
            self.assertEqual(response.status_code, 409)
            self.assertEqual(len(self.messages(c, identifier)), 2)

    def test_same_conversation_busy_and_delete_busy(self):
        entered, release = threading.Event(), threading.Event()

        class Slow:
            async def stream(self, messages):
                if messages[-1]["content"] == "slow":
                    entered.set()
                    while not release.is_set():
                        await asyncio.sleep(0.01)
                yield "reply"

        with self.client() as c, ThreadPoolExecutor() as pool:
            identifier = self.create(c)
            c.app.state.provider = Slow()
            request_id = str(uuid4())
            first = pool.submit(self.send, c, identifier, "slow", request_id)
            try:
                self.assertTrue(entered.wait(2))
                self.assertEqual(self.send(c, identifier)[0].status_code, 409)
                self.assertEqual(
                    self.send(c, identifier, "slow", request_id)[0].status_code, 409
                )
                self.assertEqual(
                    c.delete(f"/api/demo/conversations/{identifier}").status_code, 409
                )
                other = self.create(c)
                self.assertIn("event: done", self.send(c, other)[0].text)
            finally:
                release.set()
                first.result(timeout=3)

    def test_cancelled_stream_saves_partial_as_cancelled(self):
        async def scenario():
            app = self.app()
            first_delta = asyncio.Event()

            class Slow:
                async def stream(self, _messages):
                    yield "partial text"
                    await asyncio.sleep(30)

            async with app.router.lifespan_context(app):
                app.state.provider = Slow()
                conversation = await app.state.repository.create()
                identifier = conversation["id"]
                incoming = asyncio.Queue()
                await incoming.put(
                    {
                        "type": "http.request",
                        "body": json.dumps(
                            {
                                "message": "cancel test",
                                "conversation_id": identifier,
                                "request_id": str(uuid4()),
                            }
                        ).encode(),
                        "more_body": False,
                    }
                )

                async def send(message):
                    if b"event: delta" in message.get("body", b""):
                        first_delta.set()

                scope = {
                    "type": "http",
                    "asgi": {"version": "3.0", "spec_version": "2.4"},
                    "http_version": "1.1",
                    "method": "POST",
                    "scheme": "http",
                    "path": "/api/demo/chat/stream",
                    "raw_path": b"/api/demo/chat/stream",
                    "query_string": b"",
                    "root_path": "",
                    "headers": [
                        (b"host", b"127.0.0.1"),
                        (b"content-type", b"application/json"),
                    ],
                    "server": ("127.0.0.1", 8001),
                    "client": ("127.0.0.1", 12345),
                }
                task = asyncio.create_task(app(scope, incoming.get, send))
                await asyncio.wait_for(first_delta.wait(), 2)
                await incoming.put({"type": "http.disconnect"})
                await asyncio.wait_for(task, 2)
                detail = await app.state.repository.messages(identifier)
                self.assertEqual(detail["messages"][-1]["status"], "cancelled")
                self.assertEqual(detail["messages"][-1]["content"], "partial text")

        asyncio.run(scenario())

    def test_startup_recovers_pending_without_false_completion(self):
        with self.client() as c:
            identifier = self.create(c)
            asyncio.run(
                c.app.state.repository.begin_turn(
                    identifier, str(uuid4()), "interrupted"
                )
            )
        with self.client() as c:
            rows = self.messages(c, identifier)
            self.assertEqual(rows[-1]["status"], "cancelled")
            self.send(c, identifier, "next")
            self.assertEqual(len(self.calls[-1]["messages"]), 2)

    def test_save_failure_never_emits_done_and_recovers_safely(self):
        with self.client() as c:
            identifier = self.create(c)
            repository = c.app.state.repository
            with patch.object(
                repository, "finish", new=AsyncMock(side_effect=StorageError())
            ):
                response, _ = self.send(c, identifier)
            self.assertNotIn("event: done", response.text)
            self.assertIn('"code": "save_failed"', response.text)
            asyncio.run(repository.recover())
            self.assertEqual(self.messages(c, identifier)[-1]["status"], "cancelled")

    def test_busy_and_unwritable_database_errors_are_sanitized(self):
        with self.client() as c:
            with closing(sqlite3.connect(self.path)) as lock:
                lock.execute("BEGIN IMMEDIATE")
                response = c.post("/api/demo/conversations", json={})
                self.assertEqual(response.status_code, 503)
                self.assertEqual(response.json()["error"]["code"], "storage_busy")
                lock.rollback()
            with patch.object(
                c.app.state.repository.database,
                "_connect",
                side_effect=sqlite3.OperationalError("private database path"),
            ):
                response = c.get("/api/demo/conversations")
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("private database path", response.text)

    def test_schema_indexes_foreign_keys_and_integrity(self):
        with self.client() as c:
            identifier = self.create(c)
            self.send(c, identifier)
            with closing(sqlite3.connect(self.path)) as db:
                self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 3)
                self.assertEqual(
                    db.execute("PRAGMA integrity_check").fetchone()[0], "ok"
                )
                indexes = {
                    row[0]
                    for row in db.execute(
                        "SELECT name FROM sqlite_master WHERE type='index'"
                    )
                }
                self.assertTrue(
                    {"conversations_recent", "messages_ordered", "one_pending_reply"}
                    <= indexes
                )

    def test_new_routes_keep_security_validation(self):
        with self.client() as c:
            self.assertEqual(
                c.get(
                    "/api/demo/conversations",
                    headers={"origin": "https://attacker.invalid"},
                ).status_code,
                403,
            )
            self.assertEqual(
                c.get("/api/demo/conversations/not-a-uuid/messages").status_code, 422
            )
            self.assertEqual(
                c.get("/api/demo/conversations?limit=1000").status_code, 422
            )
            self.assertEqual(
                c.post("/api/demo/conversations", json={"title": "a" * 81}).status_code,
                422,
            )
            self.assertEqual(
                c.patch(
                    f"/api/demo/conversations/{str(uuid4())}", json={"title": "valid"}
                ).status_code,
                404,
            )

    def test_safety_is_saved_without_calling_provider(self):
        with self.client() as c:
            identifier = self.create(c)
            self.send(c, identifier, "我想伤害自己")
            rows = self.messages(c, identifier)
            self.assertEqual(rows[-1]["status"], "completed")
            self.assertEqual(rows[-1]["is_safety"], 1)
            self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
