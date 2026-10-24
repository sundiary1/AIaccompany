from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["preference", "interest", "habit", "goal", "fact", "communication"]


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    content: str = Field(min_length=1, max_length=240)
    category: Category
    source_message_id: UUID
    evidence: str = Field(min_length=4, max_length=180)
    action: Literal["add", "update"] = "add"
    target_id: UUID | None = None


class Extraction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    memories: list[Candidate] = Field(default_factory=list, max_length=4)


class MemoryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    content: str = Field(min_length=1, max_length=240)
    category: Category = "fact"
    enabled: bool = True
    allow_sensitive: bool = False


class MemoryPatch(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    content: str | None = Field(default=None, min_length=1, max_length=240)
    category: Category | None = None
    enabled: bool | None = None
    review_status: Literal["approved", "pending"] | None = None
    allow_sensitive: bool = False
    resolve_conflict: bool = False


class MemorySettingsPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    auto_extract: bool | None = None
    use_memories: bool | None = None
    acknowledge: bool = False
