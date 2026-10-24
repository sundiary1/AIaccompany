from uuid import UUID

from fastapi import APIRouter, Request, Response

from ..memory_models import MemoryCreate, MemoryPatch, MemorySettingsPatch

router = APIRouter(prefix="/api/demo")


@router.get("/memories")
async def list_memories(request: Request):
    return await request.app.state.memories.list()


@router.post("/memories", status_code=201)
async def create_memory(request: Request, body: MemoryCreate):
    return await request.app.state.memories.create(body)


@router.delete("/memories/auto", status_code=204)
async def delete_auto(request: Request):
    await request.app.state.memories.delete()
    return Response(status_code=204)


@router.patch("/memories/{identifier}")
async def patch_memory(request: Request, identifier: UUID, body: MemoryPatch):
    return await request.app.state.memories.patch(str(identifier), body)


@router.delete("/memories/{identifier}", status_code=204)
async def delete_memory(request: Request, identifier: UUID):
    await request.app.state.memories.delete(str(identifier))
    return Response(status_code=204)


@router.get("/memory/settings")
async def memory_settings(request: Request):
    return await request.app.state.memories.settings()


@router.patch("/memory/settings")
async def update_settings(request: Request, body: MemorySettingsPatch):
    return await request.app.state.memories.update_settings(body)


@router.get("/memory/status")
async def memory_status(request: Request):
    result = await request.app.state.memories.status()
    result["mode"] = request.app.state.memory_mode
    result["max_attempts"] = request.app.state.memory_max_attempts
    return result


@router.post("/memory/jobs/{identifier}/retry", status_code=204)
async def retry_job(request: Request, identifier: UUID):
    await request.app.state.memories.retry(
        str(identifier), request.app.state.memory_max_attempts
    )
    return Response(status_code=204)
