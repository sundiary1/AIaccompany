from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, strict=True)
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, strict=True)
    message: str = Field(min_length=1, max_length=2000)
    history: list[HistoryMessage] = Field(default_factory=list, max_length=12)
    conversation_id: UUID | None = None
    request_id: UUID | None = None
    temporary: bool | None = None

    @model_validator(mode="after")
    def validate_history(self) -> "ChatRequest":
        if self.temporary is None:
            self.temporary = self.conversation_id is None
        if self.temporary and self.conversation_id:
            raise ValueError("Temporary chat cannot reference saved history")
        if not self.temporary and (not self.conversation_id or not self.request_id):
            raise ValueError("Saved chat needs conversation and stable request IDs")
        if self.conversation_id and self.history:
            raise ValueError("Saved context is assembled by the server")
        if len(self.history) % 2:
            raise ValueError("History must contain complete turns")
        for index, message in enumerate(self.history):
            if message.role != ("user" if index % 2 == 0 else "assistant"):
                raise ValueError("Invalid role order")
            if message.role == "user" and len(message.content) > 2000:
                raise ValueError("User history too long")
        if sum(len(m.content) for m in self.history) + len(self.message) > 12000:
            raise ValueError("Context too long")
        return self


class ConversationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    id: UUID | None = None
    title: str | None = Field(default=None, max_length=80)


class ConversationRename(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=80)
