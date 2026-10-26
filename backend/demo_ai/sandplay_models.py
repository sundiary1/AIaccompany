"""Bounded V15 JSON data, never Three.js objects or arbitrary model names."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# Kept in sync with the read-only V15 catalog by an automated asset test.
SANDPLAY_TYPES = frozenset(
    [
        "windmill",
        "tree",
        "sheep",
        "fence",
        "rock",
        "cactus",
        "flower",
        "pond",
        "bench",
        "shrub",
        "house",
        "tower",
        "bridge",
        "cat",
        "bird",
        "rabbit",
        "human",
        "friend",
        "star",
        "heart",
        "cloud",
        "boat",
        "pine",
        "mushroom",
        "log",
        "dog",
        "deer",
        "turtle",
        "butterfly",
        "tent",
        "well",
        "car",
        "bicycle",
        "plane",
        "rainbow",
        "table",
        "chair",
        "lamp",
        "book",
        "cup",
        "umbrella",
        "mountain",
        "flame",
        "shell",
        "moon",
        "question",
        "arrow",
        "key",
        "pagoda",
        "cross",
        "stoneLantern",
        "redLantern",
        "train",
        "baby",
        "elder",
        "student",
        "horse",
        "fox",
        "bear",
        "fish",
        "bamboo",
        "sunflower",
        "lotus",
        "school",
        "hospital",
        "gate",
        "bus",
        "ship",
        "balloon",
        "bed",
        "sofa",
        "mirror",
        "clockItem",
        "cave",
        "river",
        "crystal",
        "peace",
        "spiral",
        "torii",
        "wishing",
    ]
)
FLYING_TYPES = {"bird", "cloud", "butterfly", "plane", "balloon"}
MAX_PROJECT_BYTES = 131072


class StrictData(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Number = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Revision = Annotated[int, Field(strict=True, ge=1, le=2147483646)]
Title = Annotated[str, Field(strict=True, min_length=1, max_length=80)]


class Tray(StrictData):
    width: Number = Field(ge=10.5, le=24)
    depth: Number = Field(ge=7.5, le=18)


class SandObject(StrictData):
    type: str
    x: Number
    y: Number = Field(ge=0, le=3)
    z: Number
    rotation: Number = Field(ge=-10000, le=10000)
    scale: Number = Field(ge=0.45, le=1.9)

    @model_validator(mode="after")
    def valid_type(self):
        if self.type not in SANDPLAY_TYPES:
            raise ValueError("Unknown sand object")
        if self.type not in FLYING_TYPES and self.y != 0:
            raise ValueError("Only flying objects can have height")
        return self


class SandScene(StrictData):
    version: Literal[6]
    theme: Literal["meadow", "sand"]
    tray: Tray
    objects: list[SandObject] = Field(max_length=300)

    @model_validator(mode="after")
    def within_tray(self):
        if isinstance(self.version, bool):
            raise ValueError("Invalid version")
        for item in self.objects:
            if abs(item.x) > self.tray.width / 2 or abs(item.z) > self.tray.depth / 2:
                raise ValueError("Object is outside tray")
        return self


class ProjectCreate(StrictData):
    id: UUID
    title: Title
    scene: SandScene


class ProjectSave(StrictData):
    revision: Revision
    scene: SandScene


class ProjectRename(StrictData):
    revision: Revision
    title: Title
