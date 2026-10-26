"""Small regression suite for the publication boundary; no credentials/network."""

import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location(
    "repository_check", Path(__file__).resolve().parents[1] / "check_repository.py"
)
CHECK = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECK)


class RepositoryCheckTests(unittest.TestCase):
    def test_worktree_scan_skips_tracked_files_deleted_from_disk(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "kept.txt").write_text("public content", encoding="utf-8")

            def git_output(*arguments):
                if "--deleted" in arguments:
                    return b"removed.txt\0"
                return b"kept.txt\0removed.txt\0"

            with (
                patch.object(CHECK, "ROOT", root),
                patch.object(CHECK, "git", side_effect=git_output),
                patch.object(CHECK, "local_secrets", return_value=[]),
                patch("sys.argv", ["check_repository.py"]),
                patch("sys.stdout", new_callable=io.StringIO) as output,
            ):
                self.assertFalse(CHECK.main())
                self.assertIn("1 files, 0 errors", output.getvalue())

    def test_private_paths_are_rejected_even_with_an_example_filename(self):
        for name in [
            ".env",
            "frontend/.env",
            "backend/demo_ai/.env.local",
            "backend/demo_ai/data/private.txt",
            "output/snapshots/old.zip",
            "history.sqlite3-wal",
            "memory.owner.lock",
            "node_modules/.env.example",
            "backend/app/frontend/index.html",
            ".playwright-cli/page.yml",
        ]:
            with self.subTest(path=name):
                self.assertTrue(CHECK.forbidden(Path(name)))

    def test_public_examples_sources_and_assets_are_allowed(self):
        for name in [
            ".env.example",
            "backend/demo_ai/.env.example",
            "frontend/.env.demo",
            "frontend/public/models/companion_cat.glb",
            "assets/blender/cat.blend",
            "backend/demo_ai/database.py",
            "docs/screenshots/preview.png",
        ]:
            with self.subTest(path=name):
                self.assertFalse(CHECK.forbidden(Path(name)))

    def test_token_patterns_use_synthetic_values(self):
        for prefix in ["sk-", "ghp_", "github_pat_"]:
            self.assertIsNotNone(CHECK.TOKEN.search((prefix + "x" * 40).encode()))
        self.assertIsNone(CHECK.TOKEN.search(b"settings.api_key / AI_API_KEY="))

    def test_local_secret_values_are_only_read_as_a_deny_list(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            value = "synthetic-" + "z" * 24
            (root / ".env").write_text(
                "SECRET_KEY=" + value + "\nPOSTGRES_PASSWORD=changethis\n",
                encoding="utf-8",
            )
            with patch.object(CHECK, "ROOT", root):
                self.assertEqual(CHECK.local_secrets(), [value.encode()])


if __name__ == "__main__":
    unittest.main()
