import json

import anyio
from fastapi.responses import JSONResponse, StreamingResponse


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def error_response(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse(
        {"error": {"code": code, "message": message}},
        status_code=status,
        headers={"Cache-Control": "no-store"},
    )


class DisconnectAwareStream(StreamingResponse):
    def __init__(self, *args, on_close=None, **kwargs):
        super().__init__(*args, **kwargs)
        self.on_close = on_close

    async def __call__(self, scope, receive, send):
        try:
            async with anyio.create_task_group() as group:

                async def stream():
                    try:
                        await self.stream_response(send)
                    except OSError:
                        pass
                    finally:
                        group.cancel_scope.cancel()

                group.start_soon(stream)
                await self.listen_for_disconnect(receive)
                group.cancel_scope.cancel()
        finally:
            # Includes disconnect before the response generator's first iteration.
            if self.on_close:
                with anyio.CancelScope(shield=True):
                    await self.on_close()
        if self.background:
            await self.background()
