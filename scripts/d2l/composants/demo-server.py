"""Serve the local demo with an existing TinyMCE package, without a CDN or API key."""
import argparse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, unquote

ROOT = Path(__file__).resolve().parent
WORKSPACE = ROOT.parents[2]
options = argparse.ArgumentParser(description=__doc__)
options.add_argument("--tinymce-dir", type=Path, default=WORKSPACE / "mes-outils/.artifacts/tinymce-8.4.0/package")
options.add_argument("--port", type=int, default=4175)
args = options.parse_args()
vendor = args.tinymce_dir.resolve()
if not (vendor / "tinymce.min.js").is_file():
    raise SystemExit("TinyMCE absent : fournissez --tinymce-dir avec le dossier du paquet TinyMCE 8.4.0.")


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = unquote(urlparse(path).path)
        if path == "/editor/catalogue.json":
            return str(ROOT / "tests/fixtures/catalogue.json")
        if path == "/editor.css":
            return str(ROOT / "tests/fixtures/editor.css")
        base = vendor if path.startswith("/tinymce/") else ROOT
        relative = path.removeprefix("/tinymce/") if base == vendor else path.lstrip("/") or "demo.html"
        target = (base / relative).resolve()
        return str(target if target.is_relative_to(base) else base / "__not_found__")


print(f"Démo locale : http://127.0.0.1:{args.port}", flush=True)
ThreadingHTTPServer(("127.0.0.1", args.port), Handler).serve_forever()
