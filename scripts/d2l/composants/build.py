"""Build the generic tool; an optional course catalog refreshes only the demo fixture."""
import argparse
import json
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DIST = ROOT / "dist"


def build(catalog_dir=None, domain="https://cforp.desire2learn.com"):
    address = urlparse(domain)
    if address.scheme != "https" or not address.hostname or address.netloc != address.hostname or address.path not in ("", "/") or address.query or address.fragment:
        raise ValueError("--domain must be an HTTPS origin without port or path")
    if catalog_dir:
        catalog = json.loads((Path(catalog_dir) / "catalogue.json").read_text(encoding="utf-8"))
        if catalog.get("version") != 1 or not isinstance(catalog.get("entries"), list):
            raise ValueError("Invalid demo catalog")
        fixture = ROOT / "tests/fixtures/catalogue.json"
        fixture.parent.mkdir(parents=True, exist_ok=True)
        fixture.write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    app = (ROOT / "src/outil.js").read_text(encoding="utf-8")
    marker = "/* CEL_CATALOG_SERVICE */"
    if app.count(marker) != 1:
        raise ValueError("Catalog service placeholder missing or duplicated")
    service = (ROOT / "src/catalogue.mjs").read_text(encoding="utf-8").replace("export ", "")
    bridge = (ROOT / "src/editor-adapter.js").read_text(encoding="utf-8")
    code = bridge + "\n" + app.replace(marker, service)
    header = f"""// ==UserScript==
// @name Composants CEL — prototype
// @namespace cel
// @version 0.4.3
// @description Insérer et modifier les composants du catalogue propre au cours D2L.
// @match https://{address.hostname}/*
// @grant none
// @run-at document-idle
// @inject-into page
// ==/UserScript==
"""
    DIST.mkdir(exist_ok=True)
    destination = DIST / "composants-cel.user.js"
    destination.write_text(header + code, encoding="utf-8")
    (DIST / "prototype-console.js").unlink(missing_ok=True)
    print(f"dist/{destination.name}: generic course catalog loader, {destination.stat().st_size} bytes, {address.hostname}")


if __name__ == "__main__":
    arguments = argparse.ArgumentParser(description=__doc__)
    arguments.add_argument("--catalog-dir", type=Path, help="Optional directory containing a course catalogue.json for the demo")
    arguments.add_argument("--domain", default="https://cforp.desire2learn.com")
    options = arguments.parse_args()
    build(options.catalog_dir, options.domain)
