"""Local-only work library; the shared middleware guards every endpoint."""

import asyncio
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response
from fastapi.routing import APIRoute

from ..sandplay_models import (
    MAX_PROJECT_BYTES,
    ProjectCreate,
    ProjectRename,
    ProjectSave,
)
from ..streaming import error_response


class BoundedProjectRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def bounded(request: Request):
            # Bound chunked requests too, before JSON/Pydantic allocates a body.
            size = 0
            chunks = []
            try:
                async with asyncio.timeout(10):
                    async for chunk in request.stream():
                        size += len(chunk)
                        if size > MAX_PROJECT_BYTES:
                            return error_response(
                                "scene_too_large", "作品数据超出大小限制。", 413
                            )
                        chunks.append(chunk)
            except TimeoutError:
                return error_response("request_timeout", "作品请求超时，请重试。", 408)
            request._body = b"".join(chunks)
            return await handler(request)

        return bounded


router = APIRouter(
    prefix="/api/demo/sandplay/projects", route_class=BoundedProjectRoute
)


@router.get("")
async def list_projects(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
):
    return await request.app.state.sandplay.list(limit, offset)


@router.post("", status_code=201)
async def create_project(request: Request, body: ProjectCreate):
    return await request.app.state.sandplay.create(str(body.id), body.title, body.scene)


@router.get("/{project_id}")
async def get_project(request: Request, project_id: UUID):
    return await request.app.state.sandplay.get(str(project_id))


@router.put("/{project_id}")
async def save_project(request: Request, project_id: UUID, body: ProjectSave):
    return await request.app.state.sandplay.save(
        str(project_id), body.revision, body.scene
    )


@router.patch("/{project_id}")
async def rename_project(request: Request, project_id: UUID, body: ProjectRename):
    return await request.app.state.sandplay.rename(
        str(project_id), body.revision, body.title
    )


@router.delete("/{project_id}", status_code=204)
async def delete_project(
    request: Request,
    project_id: UUID,
    revision: Annotated[int, Query(ge=1, le=2147483646)],
):
    await request.app.state.sandplay.delete(str(project_id), revision)
    return Response(status_code=204)
