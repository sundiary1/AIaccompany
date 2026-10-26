"""Explicit v2 -> v3 migration; independent of conversation and memory tables."""

SCHEMA_V3 = [
    """CREATE TABLE sandplay_projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 80),
        scene_json TEXT NOT NULL CHECK(length(scene_json)<=131072),
        schema_version INTEGER NOT NULL CHECK(schema_version=6),
        revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>=1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )""",
    "CREATE INDEX sandplay_projects_recent ON sandplay_projects(updated_at DESC,id)",
]
