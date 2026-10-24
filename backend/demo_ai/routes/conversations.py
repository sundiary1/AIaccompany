from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response

from ..models import ConversationCreate, ConversationRename

router = APIRouter(prefix="/api/demo/conversations")


@router.get("")
async def list_conversations(
    request: Request,
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0, le=1000000)] = 0,
):
    return await request.app.state.repository.list(limit, offset)


@router.post("", status_code=201)
async def create_conversation(request: Request, body: ConversationCreate):
    title = " ".join((body.title or "新的对话").split()) or "新的对话"
    return await request.app.state.repository.create(
        title,
        custom=body.title is not None,
        identifier=str(body.id) if body.id else None,
    )


@router.get("/{conversation_id}/messages")
async def get_messages(request: Request, conversation_id: UUID):
    return await request.app.state.repository.messages(str(conversation_id))


@router.patch("/{conversation_id}")
async def rename_conversation(
    request: Request, conversation_id: UUID, body: ConversationRename
):
    title = " ".join(body.title.split())
    return await request.app.state.repository.rename(str(conversation_id), title)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(request: Request, conversation_id: UUID):
    await request.app.state.repository.delete(str(conversation_id))
    return Response(status_code=204)


@router.delete("/{conversation_id}/messages", status_code=204)
async def clear_messages(request: Request, conversation_id: UUID):
    await request.app.state.repository.clear(str(conversation_id))
    return Response(status_code=204)
