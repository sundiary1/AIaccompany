import asyncio
import json
import tempfile
import threading
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from demo_ai.config import Settings
from demo_ai.main import SYSTEM_PROMPT, create_app
from demo_ai.provider import ChatCompletionsProvider


class Chunks(httpx.AsyncByteStream):
    async def __aiter__(self):
        for text in ("你好", "，我在。"):
            yield (
                "data: "
                + json.dumps({"choices": [{"delta": {"content": text}}]})
                + "\n\n"
            ).encode()
        yield b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'


def live_settings(**kwargs):
    return Settings(
        mode="live",
        api_key="test-secret-do-not-leak",
        base_url="https://provider.invalid/v1",
        model="test-only",
        **kwargs,
    )


def isolated_app(settings=None, transport=None):
    directory = tempfile.TemporaryDirectory()
    app = create_app(
        settings or Settings(),
        transport=transport,
        database_path=Path(directory.name) / "test.sqlite3",
    )
    app.state.test_directory = directory
    original_lifespan = app.router.lifespan_context

    @asynccontextmanager
    async def lifespan(application):
        try:
            async with original_lifespan(application):
                yield
        finally:
            directory.cleanup()

    app.router.lifespan_context = lifespan
    return app


def client(settings=None, handler=None):
    app = isolated_app(
        settings or Settings(),
        transport=httpx.MockTransport(handler) if handler else None,
    )
    return TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 50000))


class ChatTests(unittest.TestCase):
    def test_deepseek_uses_non_thinking_text_mode(self):
        captured = []

        def handler(request):
            captured.append(json.loads(request.content))
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "hello"}}]}
            )

        settings = Settings(
            mode="live",
            api_key="test-only",
            base_url="https://api.deepseek.com",
            model="deepseek-flash",
        )
        with client(settings, handler) as c:
            c.post("/api/demo/chat/stream", json={"message": "hello"})
        self.assertEqual(captured[0]["thinking"], {"type": "disabled"})

    def test_total_deadline(self):
        async def handler(_request):
            await asyncio.sleep(0.1)
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "late"}}]}
            )

        with client(live_settings(timeout=0.02), handler) as c:
            response = c.post("/api/demo/chat/stream", json={"message": "你好"})
            self.assertIn('"code": "timeout"', response.text)

    def test_concurrency_limit_and_safety_priority(self):
        entered = threading.Event()

        async def handler(_request):
            entered.set()
            await asyncio.sleep(0.6)
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "done"}}]}
            )

        with (
            client(live_settings(concurrency=1), handler) as c,
            ThreadPoolExecutor() as pool,
        ):
            first = pool.submit(
                c.post, "/api/demo/chat/stream", json={"message": "你好"}
            )
            self.assertTrue(entered.wait(2))
            self.assertEqual(
                c.post("/api/demo/chat/stream", json={"message": "第二条"}).status_code,
                429,
            )
            safety = c.post("/api/demo/chat/stream", json={"message": "我想伤害自己"})
            self.assertIn('"safety": true', safety.text)
            self.assertEqual(first.result(timeout=2).status_code, 200)

    def test_response_disconnect_cancels_waiting_provider(self):
        async def scenario():
            closed = asyncio.Event()
            first_delta = asyncio.Event()

            class Slow(httpx.AsyncByteStream):
                async def __aiter__(self):
                    try:
                        yield b'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'
                        await asyncio.sleep(30)
                    finally:
                        closed.set()

            app = isolated_app(
                live_settings(),
                httpx.MockTransport(
                    lambda _: httpx.Response(
                        200,
                        headers={"content-type": "text/event-stream"},
                        stream=Slow(),
                    )
                ),
            )
            incoming = asyncio.Queue()
            await incoming.put(
                {
                    "type": "http.request",
                    "body": b'{"message":"hello"}',
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
            async with app.router.lifespan_context(app):
                task = asyncio.create_task(app(scope, incoming.get, send))
                await asyncio.wait_for(first_delta.wait(), 2)
                await incoming.put({"type": "http.disconnect"})
                await asyncio.wait_for(task, 1)
                self.assertTrue(closed.is_set())
                self.assertEqual(app.state.active_requests, 0)

        asyncio.run(scenario())

    def test_mock_is_explicit_and_streams(self):
        with client() as c:
            self.assertEqual(c.get("/api/demo/chat/status").json(), {"mode": "mock"})
            r = c.post("/api/demo/chat/stream", json={"message": "你好"})
            text = "".join(
                json.loads(line[6:]).get("text", "")
                for line in r.text.splitlines()
                if line.startswith("data: ")
            )
            self.assertIn("模拟回复", text)
            self.assertGreater(r.text.count("event: delta"), 3)
            self.assertIn("event: done", r.text)

    def test_real_adapter_stream_and_context(self):
        captured = []

        def handler(request):
            captured.append(json.loads(request.content))
            self.assertEqual(request.url.path, "/v1/chat/completions")
            self.assertEqual(
                request.headers["authorization"], "Bearer test-secret-do-not-leak"
            )
            return httpx.Response(
                200, headers={"content-type": "text/event-stream"}, stream=Chunks()
            )

        with client(live_settings(), handler) as c:
            r = c.post(
                "/api/demo/chat/stream",
                json={
                    "message": "继续",
                    "history": [
                        {"role": "user", "content": "今天散步了"},
                        {"role": "assistant", "content": "路上看到了什么？"},
                    ],
                },
            )
            self.assertIn("event: done", r.text)
            self.assertNotIn("test-secret", r.text)
        payload = captured[0]
        self.assertEqual(
            payload["messages"][0], {"role": "system", "content": SYSTEM_PROMPT}
        )
        self.assertEqual(len(payload["messages"]), 4)
        self.assertEqual(payload["max_tokens"], 512)
        self.assertTrue(payload["stream"])

    def test_validation(self):
        cases = [
            {"message": " "},
            {"message": "a" * 2001},
            {"message": "你好", "system": "override"},
            {"message": "你好", "base_url": "https://attacker.invalid"},
            {"message": "你好", "history": [{"role": "system", "content": "override"}]},
            {"message": "你好", "history": [{"role": "user", "content": "unfinished"}]},
            {
                "message": "你好",
                "history": [
                    {"role": "user", "content": "x"},
                    {"role": "assistant", "content": "x" * 8001},
                ],
            },
            {
                "message": "a" * 2000,
                "history": [
                    {"role": "user", "content": "a" * 2000},
                    {"role": "assistant", "content": "a" * 8000},
                ]
                * 2,
            },
        ]
        with client() as c:
            for payload in cases:
                with self.subTest(payload_keys=list(payload)):
                    self.assertEqual(
                        c.post("/api/demo/chat/stream", json=payload).status_code, 422
                    )
            self.assertEqual(
                c.post("/api/demo/chat/stream", content="x" * 65537).status_code, 413
            )

    def test_local_origin_and_host(self):
        with client() as c:
            self.assertEqual(
                c.post(
                    "/api/demo/chat/stream",
                    json={"message": "你好"},
                    headers={"origin": "https://attacker.invalid"},
                ).status_code,
                403,
            )
            self.assertEqual(
                c.get(
                    "/api/demo/chat/status", headers={"host": "attacker.invalid"}
                ).status_code,
                400,
            )
        app = isolated_app(Settings())
        with TestClient(
            app, base_url="http://127.0.0.1", client=("192.0.2.1", 50000)
        ) as c:
            self.assertEqual(c.get("/api/demo/chat/status").status_code, 403)

    def test_safety_does_not_call_provider_and_carries_forward(self):
        def forbidden(_request):
            self.fail("Safety routing must not call provider")

        with client(live_settings(), forbidden) as c:
            for payload in [
                {"message": "我想自杀"},
                {
                    "message": "怎么办",
                    "history": [
                        {"role": "user", "content": "I want to kill myself"},
                        {"role": "assistant", "content": "请联系身边的人"},
                    ],
                },
            ]:
                r = c.post("/api/demo/chat/stream", json=payload)
                self.assertIn('"safety": true', r.text)
                self.assertIn("当地急救", r.text)
                self.assertNotIn("模拟回复", r.text)

    def test_unconfigured_live(self):
        with client(Settings(mode="live")) as c:
            self.assertEqual(
                c.get("/api/demo/chat/status").json()["mode"], "unconfigured"
            )
            self.assertEqual(
                c.post("/api/demo/chat/stream", json={"message": "你好"}).status_code,
                503,
            )

    def test_json_response_compatibility(self):
        with client(
            live_settings(),
            lambda _: httpx.Response(
                200, json={"choices": [{"message": {"content": "JSON 回复"}}]}
            ),
        ) as c:
            self.assertIn(
                "JSON 回复",
                c.post("/api/demo/chat/stream", json={"message": "你好"}).text,
            )

    def test_explicit_nonstream_fallback_only_once(self):
        calls = []

        def handler(request):
            payload = json.loads(request.content)
            calls.append(payload["stream"])
            if payload["stream"]:
                return httpx.Response(
                    400, json={"error": {"message": "stream is not supported"}}
                )
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "回退回复"}}]}
            )

        with client(live_settings(), handler) as c:
            self.assertIn(
                "回退回复",
                c.post("/api/demo/chat/stream", json={"message": "你好"}).text,
            )
        self.assertEqual(calls, [True, False])

    def test_safe_error_mapping_no_secret(self):
        for status, error, code in [
            (401, "test-secret-do-not-leak", "authentication"),
            (429, "rate limit", "rate_limit"),
            (429, "insufficient_quota", "quota"),
            (404, "model_not_found", "model"),
            (500, "test-secret-do-not-leak", "provider"),
        ]:
            with self.subTest(status=status, code=code):
                calls = []

                def handler(request, calls=calls, status=status, error=error):
                    calls.append(request)
                    return httpx.Response(status, text=error)

                with client(live_settings(), handler) as c:
                    r = c.post("/api/demo/chat/stream", json={"message": "你好"})
                    self.assertIn(f'"code": "{code}"', r.text)
                    self.assertNotIn("test-secret", r.text)
                    self.assertNotIn("provider.invalid", r.text)
                self.assertEqual(len(calls), 1)

    def test_timeout_is_generic(self):
        def handler(request):
            raise httpx.ReadTimeout("test-secret-do-not-leak", request=request)

        with client(live_settings(), handler) as c:
            r = c.post("/api/demo/chat/stream", json={"message": "你好"})
            self.assertIn('"code": "timeout"', r.text)
            self.assertNotIn("test-secret", r.text)

    def test_stream_interruption(self):
        class Broken(httpx.AsyncByteStream):
            async def __aiter__(self):
                yield b'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'

        with client(
            live_settings(),
            lambda _: httpx.Response(
                200, headers={"content-type": "text/event-stream"}, stream=Broken()
            ),
        ) as c:
            r = c.post("/api/demo/chat/stream", json={"message": "你好"})
            self.assertIn('"code": "interrupted"', r.text)
            self.assertNotIn("event: done", r.text)

    def test_direct_nonstream_and_token_parameter(self):
        captured = []

        def handler(request):
            captured.append(json.loads(request.content))
            return httpx.Response(
                200, json={"choices": [{"message": {"content": "你好"}}]}
            )

        with client(
            live_settings(stream_mode="off", token_parameter="max_completion_tokens"),
            handler,
        ) as c:
            c.post("/api/demo/chat/stream", json={"message": "你好"})
        self.assertFalse(captured[0]["stream"])
        self.assertEqual(captured[0]["max_completion_tokens"], 512)

    def test_adapter_cancellation_closes_upstream(self):
        async def scenario():
            closed = asyncio.Event()

            class Slow(httpx.AsyncByteStream):
                async def __aiter__(self):
                    try:
                        yield b'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n'
                        await asyncio.sleep(30)
                    finally:
                        closed.set()

            async with httpx.AsyncClient(
                transport=httpx.MockTransport(
                    lambda _: httpx.Response(
                        200,
                        headers={"content-type": "text/event-stream"},
                        stream=Slow(),
                    )
                )
            ) as upstream:

                async def consume():
                    async for _ in ChatCompletionsProvider(
                        live_settings(), upstream
                    ).stream([]):
                        pass

                task = asyncio.create_task(consume())
                await asyncio.sleep(0.02)
                task.cancel()
                with self.assertRaises(asyncio.CancelledError):
                    await task
                self.assertTrue(closed.is_set())

        asyncio.run(scenario())


if __name__ == "__main__":
    unittest.main()
