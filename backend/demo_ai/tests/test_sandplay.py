"""Work library tests: isolated SQLite, no real provider or user database."""

import json
import re
import sqlite3
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from demo_ai.config import Settings
from demo_ai.database import SCHEMA_V1, Database
from demo_ai.main import create_app
from demo_ai.memory_schema import SCHEMA_V2
from demo_ai.sandplay_models import FLYING_TYPES, SANDPLAY_TYPES

URL = "/api/demo/sandplay/projects"


def scene(theme="meadow", kind="tree"):
    return {
        "version": 6,
        "theme": theme,
        "tray": {"width": 18.5, "depth": 12.75},
        "objects": [
            {
                "type": kind,
                "x": 1.25,
                "y": 1.8 if kind in FLYING_TYPES else 0,
                "z": -2.5,
                "rotation": -1.1344640137963142,
                "scale": 1.35,
            }
        ],
    }


class SandplayTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "test.sqlite3"

    def client(self, address="127.0.0.1"):
        return TestClient(
            create_app(
                Settings(mode="mock"),
                database_path=self.path,
                start_memory_worker=False,
            ),
            base_url="http://127.0.0.1",
            client=(address, 12345),
        )

    def create(self, c, title="测试作品", value=None, identifier=None):
        body = {
            "id": identifier or str(uuid4()),
            "title": title,
            "scene": value or scene(),
        }
        response = c.post(URL, json=body)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_three_projects_survive_restart_with_exact_transform(self):
        with self.client() as c:
            projects = [
                self.create(c, title, scene(theme, kind))
                for title, theme, kind in [
                    ("溪流", "meadow", "river"),
                    ("荒漠", "sand", "cactus"),
                    ("天空", "meadow", "cloud"),
                ]
            ]
        with self.client() as c:
            self.assertEqual(len(c.get(URL).json()), 3)
            for row in projects:
                self.assertEqual(c.get(f"{URL}/{row['id']}").json(), row)
                self.assertTrue(row["updated_at"].endswith("Z"))

    def test_update_list_sort_summary_and_noop(self):
        with self.client() as c:
            first, second = self.create(c, "first"), self.create(c, "second")
            changed = scene("sand", "cloud")
            saved = c.put(
                f"{URL}/{first['id']}", json={"revision": 1, "scene": changed}
            ).json()
            self.assertEqual(saved["revision"], 2)
            rows = c.get(URL).json()
            self.assertEqual([r["id"] for r in rows], [first["id"], second["id"]])
            self.assertNotIn("scene", rows[0])
            self.assertEqual(c.get(URL + "?limit=1&offset=1").json(), [rows[1]])
            self.assertEqual(
                c.put(
                    f"{URL}/{first['id']}", json={"revision": 2, "scene": changed}
                ).json(),
                saved,
            )

    def test_create_and_update_lost_response_retries_are_idempotent(self):
        with self.client() as c:
            row = self.create(c)
            self.assertEqual(self.create(c, identifier=row["id"]), row)
            changed = scene("sand")
            url, body = f"{URL}/{row['id']}", {"revision": 1, "scene": changed}
            saved = c.put(url, json=body).json()
            self.assertEqual(c.put(url, json=body).json(), saved)
            self.assertEqual(len(c.get(URL).json()), 1)
            response = c.post(
                URL, json={"id": row["id"], "title": "different", "scene": changed}
            )
            self.assertEqual(response.status_code, 409)

    def test_revision_conflict_does_not_overwrite_or_rename_or_delete(self):
        with self.client() as c:
            row = self.create(c)
            url = f"{URL}/{row['id']}"
            fresh = c.put(url, json={"revision": 1, "scene": scene("sand")}).json()
            self.assertEqual(
                c.put(
                    url, json={"revision": 1, "scene": scene("meadow", "rock")}
                ).status_code,
                409,
            )
            self.assertEqual(
                c.patch(url, json={"revision": 1, "title": row["title"]}).status_code,
                409,
            )
            self.assertEqual(c.delete(url + "?revision=1").status_code, 409)
            self.assertEqual(c.get(url).json(), fresh)

    def test_concurrent_writers_exactly_one_wins(self):
        with self.client() as c, ThreadPoolExecutor() as pool:
            row = self.create(c)
            url = f"{URL}/{row['id']}"

            def write(kind):
                return c.put(
                    url, json={"revision": 1, "scene": scene("sand", kind)}
                ).status_code

            self.assertEqual(sorted(pool.map(write, ["cloud", "cactus"])), [200, 409])
            self.assertEqual(c.get(url).json()["revision"], 2)

    def test_rename_delete_only_target_with_parameterized_title(self):
        with self.client() as c:
            row, other = self.create(c), self.create(c, "keep")
            url = f"{URL}/{row['id']}"
            title = "'; DROP TABLE messages; --"
            self.assertEqual(
                c.patch(url, json={"revision": 1, "title": title}).json()["title"],
                title,
            )
            self.assertEqual(c.delete(url + "?revision=2").status_code, 204)
            self.assertEqual(c.get(url).status_code, 404)
            self.assertEqual(c.get(URL).json()[0]["id"], other["id"])

    def test_all_eighty_types_match_original_catalog(self):
        html = (
            Path(__file__).resolve().parents[3]
            / "assets/legacy/sandplay-v15/sandplay-v15.original.html"
        ).read_text(encoding="utf-8")
        definitions = re.search(r"const defs=\[(.*?)\n\];", html, re.DOTALL)[1]
        self.assertEqual(
            set(re.findall(r"\{id:'([^']+)'", definitions)), SANDPLAY_TYPES
        )
        with self.client() as c:
            for kind in SANDPLAY_TYPES:
                self.create(c, kind, scene(kind=kind))

    def test_invalid_scenes_and_nonfinite_values_are_rejected(self):
        with self.client() as c:
            invalid = []
            for field, value in [
                ("type", "__proto__"),
                ("x", 100),
                ("z", -100),
                ("y", 1),
                ("scale", 10),
                ("rotation", float("inf")),
                ("x", "1"),
                ("x", True),
                ("scale", float("nan")),
            ]:
                data = scene()
                data["objects"][0][field] = value
                invalid.append(data)
            for value in [
                {**scene(), "version": 4},
                {**scene(), "theme": "unknown"},
                {**scene(), "tray": {"width": 1, "depth": 9}},
                {**scene(), "objects": scene()["objects"] * 301},
                {**scene(), "arbitrary": "data"},
            ]:
                invalid.append(value)
            for value in invalid:
                raw = json.dumps(
                    {"id": str(uuid4()), "title": "invalid", "scene": value}
                )
                response = c.post(
                    URL, content=raw, headers={"content-type": "application/json"}
                )
                self.assertEqual(response.status_code, 422, raw)
                self.assertNotIn("input", response.text)
            self.assertEqual(c.get(URL).json(), [])

    def test_request_size_chunked_and_validation_limits(self):
        with self.client() as c:
            response = c.post(
                URL,
                content=(b" " * 20000 for _ in range(8)),
                headers={"content-type": "application/json"},
            )
            self.assertEqual(response.status_code, 413)
            for body in [
                {"id": str(uuid4()), "title": "a" * 81, "scene": scene()},
                {"id": str(uuid4()), "title": "  ", "scene": scene()},
            ]:
                self.assertEqual(c.post(URL, json=body).status_code, 422)
            self.assertEqual(c.get(URL + "?limit=1000").status_code, 422)
            self.assertEqual(c.get(URL + "/not-a-uuid").status_code, 422)
            self.assertEqual(c.get(URL + "/" + str(uuid4())).status_code, 404)

    def test_busy_unwritable_errors_do_not_claim_success(self):
        with self.client() as c:
            row = self.create(c)
            with closing(sqlite3.connect(self.path)) as db:
                db.execute("BEGIN IMMEDIATE")
                self.assertEqual(
                    c.put(
                        f"{URL}/{row['id']}",
                        json={"revision": 1, "scene": scene("sand")},
                    ).status_code,
                    503,
                )
                db.rollback()
            self.assertEqual(c.get(f"{URL}/{row['id']}").json(), row)
            with patch.object(
                c.app.state.repository.database,
                "_connect",
                side_effect=sqlite3.OperationalError("private path"),
            ):
                response = c.get(URL)
                self.assertEqual(response.status_code, 503)
                self.assertNotIn("private path", response.text)

    def test_security_guards_all_project_verbs(self):
        with self.client() as c:
            for method in ["GET", "POST", "PUT", "PATCH", "DELETE"]:
                response = c.request(
                    method, URL, headers={"origin": "https://attacker.invalid"}
                )
                self.assertEqual(response.status_code, 403)
            self.assertEqual(
                c.get(URL, headers={"host": "evil.invalid"}).status_code, 400
            )
            self.assertEqual(
                c.get(URL, headers={"sec-fetch-site": "cross-site"}).status_code, 403
            )
        with self.client("192.0.2.1") as c:
            self.assertEqual(c.get(URL).status_code, 403)

    def test_v2_migration_preserves_every_existing_row(self):
        # Build a real v2 schema including a completed chat, settings and memory.
        with closing(sqlite3.connect(self.path)) as db:
            for sql in SCHEMA_V1 + SCHEMA_V2:
                db.execute(sql)
            identifier, user, assistant = [str(uuid4()) for _ in range(3)]
            db.execute(
                "INSERT INTO conversations(id,title,created_at,updated_at) VALUES(?,?,?,?)",
                (identifier, "unchanged", "time", "time"),
            )
            for index, role, key in [(0, "user", user), (1, "assistant", assistant)]:
                db.execute(
                    "INSERT INTO messages(id,conversation_id,request_id,sequence,role,content,status,created_at) VALUES(?,?,?,?,?,?,'completed','time')",
                    (key, identifier, user, index, role, "unchanged bytes 原文"),
                )
            db.execute("PRAGMA user_version=2")
            db.commit()
            tables = [
                r[0]
                for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")
            ]
            before = {
                table: db.execute(f'SELECT * FROM "{table}"').fetchall()
                for table in tables
            }
        for _ in range(2):
            database = Database(self.path)
            try:
                database.initialize()
            finally:
                database.close()
        with closing(sqlite3.connect(self.path)) as db:
            after = {
                table: db.execute(f'SELECT * FROM "{table}"').fetchall()
                for table in tables
            }
            self.assertEqual(before, after)
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 3)
            self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
            self.assertIn(
                "sandplay_projects_recent",
                {r[1] for r in db.execute("PRAGMA index_list(sandplay_projects)")},
            )

    def test_sandplay_operations_never_touch_chat_memory_or_provider(self):
        with self.client() as c:
            with closing(sqlite3.connect(self.path)) as db:
                tables = [
                    r[0]
                    for r in db.execute(
                        "SELECT name FROM sqlite_master WHERE type='table' AND name!='sandplay_projects'"
                    )
                ]
                before = {
                    t: db.execute(f'SELECT * FROM "{t}"').fetchall() for t in tables
                }
            with patch.object(
                c.app.state.provider,
                "stream",
                side_effect=AssertionError("No provider calls"),
            ):
                row = self.create(c)
                c.put(
                    f"{URL}/{row['id']}", json={"revision": 1, "scene": scene("sand")}
                )
                c.delete(f"{URL}/{row['id']}?revision=2")
            with closing(sqlite3.connect(self.path)) as db:
                self.assertEqual(
                    before,
                    {t: db.execute(f'SELECT * FROM "{t}"').fetchall() for t in tables},
                )


if __name__ == "__main__":
    unittest.main()
