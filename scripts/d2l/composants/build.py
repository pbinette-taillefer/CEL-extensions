"""Build one installable tool; optionally refresh snippets from the author catalog."""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent


class CatalogParser(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=False)
        self.source = source
        self.lines = source.splitlines(keepends=True)
        self.offsets = [0]
        for line in self.lines:
            self.offsets.append(self.offsets[-1] + len(line))
        self.active = None
        self.components = {}

    def source_position(self):
        line, column = self.getpos()
        return self.offsets[line - 1] + column

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if self.active:
            if tag == self.active["tag"]:
                self.active["depth"] += 1
        elif "data-copy-source" in attrs:
            if "data-copy-contents" in attrs:
                raise ValueError("data-copy-contents is not supported by this catalog importer")
            self.active = {"key": attrs["data-copy-source"], "name": attrs["data-component"],
                           "tag": tag, "depth": 1, "start": self.source_position()}

    def handle_endtag(self, tag):
        active = self.active
        if not active or tag != active["tag"]:
            return
        active["depth"] -= 1
        if not active["depth"]:
            end = self.source.index(">", self.source_position()) + 1
            snippet = self.source[active["start"]:end]
            snippet = re.sub(r'\s+data-copy-source="[^"]*"', "", snippet, count=1)
            if active["key"] in self.components:
                raise ValueError("Duplicate catalog key")
            self.components[active["key"]] = {"name": active["name"], "html": snippet}
            self.active = None


def build(catalog_dir=None, domain="https://cforp.desire2learn.com"):
    address = urlparse(domain)
    if address.scheme != "https" or not address.hostname or address.netloc != address.hostname or address.path not in ("", "/") or address.query or address.fragment:
        raise ValueError("--domain must be an HTTPS origin without port or path")
    snapshot = ROOT / "catalog.generated.json"
    if catalog_dir:
        source = (Path(catalog_dir) / "components.html").read_text(encoding="utf-8")
        parser = CatalogParser(source)
        parser.feed(source)
        if parser.active or len(parser.components) != 20:
            raise ValueError("Expected 20 complete snippets; review catalog changes before importing")
        snapshot.write_text(json.dumps({"source": "cel-components-library/catalog/components.html",
                                       "sha256": hashlib.sha256(source.encode()).hexdigest(),
                                       "components": parser.components}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    catalog = json.loads(snapshot.read_text(encoding="utf-8"))["components"]
    app = (ROOT / "src" / "outil.js").read_text(encoding="utf-8")
    marker = "/* CEL_CATALOG */ null"
    if app.count(marker) != 1:
        raise ValueError("Catalog placeholder missing or duplicated")
    bridge = (ROOT / "src/editor-adapter.js").read_text(encoding="utf-8")
    code = bridge + "\n" + app.replace(marker, json.dumps(catalog, ensure_ascii=False))
    header = f"""// ==UserScript==
// @name Composants CEL — prototype
// @namespace cel
// @version 0.2.0
// @description Insérer les composants MED et modifier leurs options dans le WYSIWYG D2L.
// @match https://{address.hostname}/*
// @grant none
// @run-at document-idle
// @inject-into page
// ==/UserScript==
"""
    destination = ROOT / "composants-cel.user.js"
    destination.write_text(header + code, encoding="utf-8")
    (ROOT / "prototype-console.js").write_text(
        "// Prototype temporaire : exécuter dans un Snippet DevTools sur une page D2L avec éditeur.\n"
        + code, encoding="utf-8")
    print(f"{destination.name}: {len(catalog)} snippets, {destination.stat().st_size} bytes, {address.hostname}")


if __name__ == "__main__":
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--catalog-dir", type=Path)
    arguments.add_argument("--domain", default="https://cforp.desire2learn.com")
    options = arguments.parse_args()
    build(options.catalog_dir, options.domain)
