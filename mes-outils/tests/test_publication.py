"""Test the hosting preparation without touching source files or public servers."""
from contextlib import redirect_stdout
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path
import io
import shutil
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = spec_from_file_location("prepare_publication", ROOT / "scripts" / "prepare-publication.py")
publication = module_from_spec(spec)
spec.loader.exec_module(publication)


class PublicationTests(unittest.TestCase):
    def test_valid_https_folder(self):
        self.assertEqual(publication.hosting_base("https://DEMO.EXAMPLE.TEST/mes-outils"), "https://demo.example.test/mes-outils/")
        self.assertEqual(publication.hosting_base("https://demo.example.test/"), "https://demo.example.test/")

    def test_reject_unsafe_or_non_matchable_urls(self):
        for value in ["http://demo.example.test/", "https://user:secret@demo.example.test/",
                      "https://demo.example.test:8443/", "https://*.example.test/",
                      "https://demo.example.test/?token=x", "https://demo.example.test/#fragment",
                      "https://demo.example.test/a\nb/", "https://demo.example.test/é/",
                      "https://demo.example.test/a\\b/", "not-an-address"]:
            with self.subTest(value=value), self.assertRaises((ValueError, UnicodeError)):
                publication.hosting_base(value)

    def test_prepare_policy_demo_and_instructions_from_one_source(self):
        with tempfile.TemporaryDirectory(prefix="mes-outils-publication-") as folder:
            root = Path(folder)
            (root / "extension").mkdir()
            shutil.copyfile(ROOT / "extension" / "privacy.html", root / "extension" / "privacy.html")
            shutil.copytree(ROOT / "publication" / "demo", root / "publication" / "demo")
            shutil.copyfile(ROOT / "publication" / "INSTRUCTIONS-EXAMEN.md", root / "publication" / "INSTRUCTIONS-EXAMEN.md")
            original_root = publication.ROOT
            source = (root / "publication" / "demo" / "outil.js").read_bytes()
            try:
                publication.ROOT = root
                with redirect_stdout(io.StringIO()):
                    publication.prepare("https://review.example.test/dossier/")
            finally:
                publication.ROOT = original_root
            output = root / "dist" / "publication"
            self.assertEqual((output / "site" / "privacy.html").read_bytes(), (root / "extension" / "privacy.html").read_bytes())
            self.assertEqual((root / "publication" / "demo" / "outil.js").read_bytes(), source)
            for name in ["outil.js", "outil-v2.js"]:
                script = (output / "site" / "demo" / name).read_text(encoding="utf-8")
                self.assertIn("// @match https://review.example.test/dossier/demo/*", script)
                self.assertNotIn("demo.example.test", script)
            instructions = (output / "INSTRUCTIONS-EXAMEN.md").read_text(encoding="utf-8")
            self.assertNotIn("{{BASE_URL}}", instructions)
            self.assertIn("https://review.example.test/dossier/demo/index.html", instructions)
            self.assertFalse((output / "site" / "INSTRUCTIONS-EXAMEN.md").exists())
            for name in ["index.html", "style.css", "outil.js", "outil-v2.js"]:
                self.assertTrue((output / "site" / "demo" / name).is_file())


if __name__ == "__main__":
    unittest.main()
