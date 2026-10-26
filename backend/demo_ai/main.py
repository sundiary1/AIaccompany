import asyncio
import ipaddress
import logging
from collections import deque
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .chat_routes import build_chat_router
from .config import Settings, load_settings
from .database import Database, StorageError
from .memory_worker import LLMExtractor, MemoryWorker, MockExtractor
from .provider import ChatCompletionsProvider
from .repositories.conversation_repository import ConversationRepository
from .repositories.memory_repository import MemoryRepository
from .repositories.sandplay_repository import SandplayRepository
from .routes.conversations import router as conversation_router
from .routes.memories import router as memory_router
from .routes.sandplay import router as sandplay_router
from .streaming import error_response

ALLOWED_ORIGINS = {
    f"http://{host}:{port}"
    for host in ("localhost", "127.0.0.1")
    for port in (5173, 5174)
}
SYSTEM_PROMPT = (Path(__file__).parent / "prompts/xiaoyu.txt").read_text(
    encoding="utf-8"
)
MAX_BODY_BYTES = 65536
MAX_OUTPUT_CHARS = 8000


def create_app(
    settings: Settings | None = None,
    transport=None,
    database_path=None,
    memory_extractor=None,
    start_memory_worker=True,
) -> FastAPI:
    settings = settings or load_settings()
    repository = ConversationRepository(
        Database(database_path or settings.database_path)
    )
    memories = MemoryRepository(repository.database, settings.api_key)
    # HTTP wire/debug logging can include provider URLs; keep it disabled here.
    for name in ("httpx", "httpcore"):
        logging.getLogger(name).setLevel(logging.CRITICAL)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        try:
            await repository.initialize()
        except StorageError:
            pass  # Temporary chat remains usable; history APIs report the error.

        async def recovery():
            while True:
                await asyncio.sleep(2)
                await repository.recover()

        recovery_task = asyncio.create_task(recovery())
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(20, connect=8),
            limits=httpx.Limits(
                max_connections=settings.concurrency + 1, max_keepalive_connections=2
            ),
            follow_redirects=False,
            trust_env=False,
            transport=transport,
        ) as client:
            app.state.provider = ChatCompletionsProvider(settings, client)
            extractor = memory_extractor or (
                MockExtractor()
                if settings.mode == "mock"
                else LLMExtractor(settings, client)
            )
            worker = MemoryWorker(memories, extractor, settings)
            app.state.memory_worker = worker
            memory_task = (
                asyncio.create_task(worker.run()) if start_memory_worker else None
            )
            try:
                yield
            finally:
                if memory_task:
                    memory_task.cancel()
                    try:
                        await memory_task
                    except asyncio.CancelledError:
                        pass
                recovery_task.cancel()
                try:
                    await recovery_task
                except asyncio.CancelledError:
                    pass
                repository.database.close()

    app = FastAPI(
        title="Mind Island local AI demo",
        lifespan=lifespan,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(
        TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "[::1]"]
    )
    slots = asyncio.Semaphore(settings.concurrency)
    recent: deque[float] = deque()
    app.state.active_requests = 0
    app.state.repository = repository
    app.state.memories = memories
    app.state.sandplay = SandplayRepository(repository.database)
    app.state.memory_mode = settings.mode
    app.state.memory_max_attempts = settings.memory_max_attempts

    @app.exception_handler(StorageError)
    async def storage_error(_request, error):
        return error_response(error.code, error.message, error.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request, _error):
        return error_response("invalid_request", "请求参数不正确，请检查后重试。", 422)

    @app.middleware("http")
    async def local_only(request: Request, call_next):
        try:
            local = (
                request.client is not None
                and ipaddress.ip_address(request.client.host).is_loopback
            )
        except ValueError:
            local = False
        if (
            not local
            or request.headers.get("origin", "") not in ALLOWED_ORIGINS | {""}
            or request.headers.get("sec-fetch-site") == "cross-site"
        ):
            return error_response("local_only", "此代理仅允许本机演示页面访问。", 403)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/api/demo/chat/status")
    async def status():
        mode = settings.mode if settings.mode in {"mock", "live"} else "unconfigured"
        if mode == "live" and not settings.configured:
            mode = "unconfigured"
        return JSONResponse({"mode": mode}, headers={"Cache-Control": "no-store"})

    app.include_router(conversation_router)
    app.include_router(memory_router)
    app.include_router(sandplay_router)
    app.include_router(build_chat_router(settings, slots, recent, SYSTEM_PROMPT))

    return app
