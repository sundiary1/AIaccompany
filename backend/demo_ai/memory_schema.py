"""Additive v1 -> v2 migration. Existing conversation/message rows are untouched."""

SCHEMA_V2 = [
    """CREATE TABLE memory_settings (
        id INTEGER PRIMARY KEY CHECK(id=1), auto_extract INTEGER NOT NULL DEFAULT 0,
        use_memories INTEGER NOT NULL DEFAULT 0, consent_version INTEGER NOT NULL DEFAULT 0,
        consented_at TEXT, auto_enabled_at TEXT, epoch INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
    )""",
    """INSERT INTO memory_settings(id,updated_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'))""",
    """CREATE TABLE memories (
        id TEXT PRIMARY KEY, content TEXT NOT NULL, category TEXT NOT NULL,
        normalized TEXT NOT NULL, topic_key TEXT NOT NULL, phase TEXT NOT NULL DEFAULT '',
        source_type TEXT NOT NULL CHECK(source_type IN ('auto','manual')),
        source_conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        source_message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
        enabled INTEGER NOT NULL DEFAULT 1, review_status TEXT NOT NULL CHECK(review_status IN ('approved','pending')),
        user_edited INTEGER NOT NULL DEFAULT 0, sensitive INTEGER NOT NULL DEFAULT 0,
        related_memory_id TEXT REFERENCES memories(id) ON DELETE SET NULL,
        revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )""",
    """CREATE TABLE memory_sources (
        memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        evidence TEXT NOT NULL, normalized TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(memory_id,message_id)
    )""",
    """CREATE TABLE memory_versions (
        id TEXT PRIMARY KEY, memory_id TEXT NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
        content TEXT NOT NULL, source_message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL
    )""",
    """CREATE TABLE memory_jobs (
        id TEXT PRIMARY KEY,
        user_message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE,
        assistant_message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        epoch INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('pending','running','completed','failed','cancelled')),
        attempts INTEGER NOT NULL DEFAULT 0, provider_calls INTEGER NOT NULL DEFAULT 0,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        added_count INTEGER NOT NULL DEFAULT 0, updated_count INTEGER NOT NULL DEFAULT 0,
        review_count INTEGER NOT NULL DEFAULT 0, skipped_count INTEGER NOT NULL DEFAULT 0,
        error_code TEXT, created_at TEXT NOT NULL, started_at TEXT, finished_at TEXT
    )""",
    "CREATE INDEX memories_selection ON memories(enabled,review_status,updated_at DESC)",
    "CREATE INDEX memories_topic ON memories(topic_key,normalized)",
    "CREATE INDEX memory_sources_message ON memory_sources(message_id)",
    "CREATE INDEX memory_jobs_queue ON memory_jobs(status,created_at)",
    """CREATE TABLE memory_calls (
        job_id TEXT NOT NULL, attempt INTEGER NOT NULL, created_at TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY(job_id,attempt)
    )""",
]
