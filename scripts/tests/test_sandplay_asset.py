"""Preserve the supplied V15 document and all factories through integration."""

import hashlib
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "assets/legacy/sandplay-v15"


class SandplayAssetTests(unittest.TestCase):
    def test_reference_checksum_and_runtime_copy_are_lossless(self):
        source = (REFERENCE / "sandplay-v15.original.html").read_bytes()
        metadata = json.loads((REFERENCE / "manifest.json").read_text(encoding="utf-8"))
        self.assertEqual(hashlib.sha256(source).hexdigest(), metadata["sha256"])
        self.assertEqual(len(source), metadata["bytes"])
        runtime = (ROOT / "frontend/public/legacy/sandplay-v15.html").read_bytes()
        seam = (
            b'<link rel="stylesheet" href="./sandplay-host.css">\n'
            b'<script src="./sandplay-host.js"></script>\n'
        )
        self.assertEqual(runtime.count(seam), 1)
        runtime = runtime.replace(seam, b"", 1)
        self.assertEqual(runtime.count(b"// MIND_ISLAND_BRIDGE_START"), 1)
        self.assertEqual(runtime.count(b"// MIND_ISLAND_BRIDGE_END"), 1)
        runtime = re.sub(
            rb"\n// MIND_ISLAND_BRIDGE_START.*?// MIND_ISLAND_BRIDGE_END\n",
            b"",
            runtime,
            flags=re.DOTALL,
        )
        self.assertEqual(runtime, source)

    def test_all_eighty_factories_and_nine_categories_are_retained(self):
        source = (REFERENCE / "sandplay-v15.original.html").read_text(encoding="utf-8")
        definitions = re.search(r"const defs=\[(.*?)\n\];", source, re.DOTALL)[1]
        identifiers = re.findall(r"\{id:'([^']+)'", definitions)
        categories = set(re.findall(r"cat:'([^']+)'", definitions))
        factories = source.split("function makeModel(id){", 1)[1].split(
            "let objects=", 1
        )[0]
        cases = set(re.findall(r"case\s*'([^']+)'\s*:", factories))
        self.assertEqual(len(identifiers), 80)
        self.assertEqual(len(set(identifiers)), 80)
        self.assertEqual(len(categories), 9)
        self.assertTrue(set(identifiers) <= cases)
        self.assertIn("case'river':", factories)


if __name__ == "__main__":
    unittest.main()
