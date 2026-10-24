"""Reject private data and generated files before they enter Git; print no secrets."""

import argparse
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRIVATE_PARTS = {
    "node_modules",
    "__pycache__",
    ".venv",
    ".venv-demo",
    ".playwright-cli",
    ".ruff_cache",
    ".pytest_cache",
    "output",
}
PRIVATE_SUFFIXES = {
    ".sqlite3",
    ".sqlite",
    ".db",
    ".pyc",
    ".pyo",
    ".pem",
    ".key",
    ".log",
}
TOKEN = re.compile(
    rb"(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)"
)


def git(*arguments):
    return subprocess.check_output(["git", *arguments], cwd=ROOT)


def forbidden(path):
    if PRIVATE_PARTS.intersection(path.parts):
        return True
    if path.name == ".env.example" or path.as_posix() == "frontend/.env.demo":
        return False
    return (
        bool(PRIVATE_PARTS.intersection(path.parts))
        or path.name == ".env"
        or path.name.startswith(".env.")
        or path.suffix in PRIVATE_SUFFIXES
        or path.name.endswith((".sqlite3-wal", ".sqlite3-shm", ".owner.lock"))
        or path.as_posix().startswith(
            ("backend/demo_ai/data/", "backend/app/frontend/", "frontend/dist/")
        )
    )


def local_secrets():
    """Use local files only as a deny-list, never as output or uploaded content."""
    secrets = []
    for path in [ROOT / ".env", ROOT / "backend/demo_ai/.env.local"]:
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() in {
                "AI_API_KEY",
                "SECRET_KEY",
                "FIRST_SUPERUSER_PASSWORD",
                "POSTGRES_PASSWORD",
            }:
                value = value.strip().strip("\"'")
                if len(value) >= 12 and not value.startswith("${"):
                    secrets.append(value.encode())
    return secrets


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--staged", action="store_true", help="Inspect the exact Git index"
    )
    args = parser.parse_args()
    names = (
        git("ls-files", "-z")
        if args.staged
        else git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    )
    errors, count, secrets = [], 0, local_secrets()
    for name in sorted(set(names.decode("utf-8").split("\0"))):
        if not name:
            continue
        path = Path(name)
        if forbidden(path):
            errors.append(f"{name}: private/generated path")
            continue
        content = git("show", ":" + name) if args.staged else (ROOT / path).read_bytes()
        count += 1
        if TOKEN.search(content) or any(secret in content for secret in secrets):
            errors.append(f"{name}: possible credential (value withheld)")
        if len(content) > 20 * 1024 * 1024:
            errors.append(f"{name}: exceeds the 20 MiB asset limit")
    for error in errors:
        print(error)
    print(f"Repository check: {count} files, {len(errors)} errors.")
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(main())
