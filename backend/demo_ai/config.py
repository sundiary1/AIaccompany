import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values

from .database import DEFAULT_DATABASE_PATH

ENV_FILE = Path(__file__).with_name(".env.local")


@dataclass(frozen=True)
class Settings:
    mode: str = "mock"
    api_key: str = field(default="", repr=False)
    base_url: str = ""
    model: str = ""
    stream_mode: str = "auto"
    token_parameter: str = "max_tokens"
    max_output_tokens: int = 512
    timeout: float = 45
    concurrency: int = 2
    database_path: Path = DEFAULT_DATABASE_PATH
    memory_model: str = ""
    memory_tokens: int = 768
    memory_timeout: int = 20
    memory_daily_calls: int = 20
    memory_max_attempts: int = 2

    @property
    def configured(self) -> bool:
        try:
            url = urlsplit(self.base_url)
            _ = url.port
        except ValueError:
            return False
        return bool(
            self.api_key
            and self.model
            and url.hostname
            and url.scheme in {"https", "http"}
            and not url.username
            and not url.password
            and not url.query
            and not url.fragment
            and (
                url.scheme == "https"
                or url.hostname in {"localhost", "127.0.0.1", "::1"}
            )
        )


def load_settings() -> Settings:
    # This dedicated server file is the only dotenv source; OS variables win.
    values = {**dotenv_values(ENV_FILE), **os.environ}

    def bounded(name: str, default: int, low: int, high: int) -> int:
        try:
            return max(low, min(high, int(values.get(name) or default)))
        except (TypeError, ValueError):
            return default

    def value(name: str, default: str = "") -> str:
        return str(values.get(name) or default).strip()

    return Settings(
        mode=value("AI_MODE", "mock"),
        api_key=value("AI_API_KEY"),
        base_url=value("AI_BASE_URL").rstrip("/"),
        model=value("AI_MODEL"),
        stream_mode=value("AI_STREAM_MODE", "auto"),
        token_parameter=value("AI_TOKEN_PARAMETER", "max_tokens"),
        max_output_tokens=bounded("AI_MAX_OUTPUT_TOKENS", 512, 64, 2048),
        timeout=bounded("AI_REQUEST_TIMEOUT_SECONDS", 45, 5, 90),
        concurrency=bounded("AI_MAX_CONCURRENT", 2, 1, 4),
        database_path=Path(value("DEMO_DATABASE_PATH", str(DEFAULT_DATABASE_PATH))),
        memory_model=value("MEMORY_MODEL"),
        memory_tokens=bounded("MEMORY_MAX_OUTPUT_TOKENS", 768, 128, 1024),
        memory_timeout=bounded("MEMORY_TIMEOUT_SECONDS", 20, 5, 30),
        memory_daily_calls=bounded("MEMORY_DAILY_CALL_LIMIT", 20, 1, 100),
        memory_max_attempts=bounded("MEMORY_MAX_ATTEMPTS", 2, 1, 2),
    )
