"""Prepare and verify a separate local package for each browser."""
from copy import deepcopy
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import argparse
import json

root = Path(__file__).resolve().parent.parent
extension = root / "extension"
base = json.loads((extension / "manifest.json").read_text(encoding="utf-8"))
package = json.loads((root / "package.json").read_text(encoding="utf-8"))
if base["version"] != package["version"]:
    raise SystemExit("Package and manifest versions differ")

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("target", nargs="?", choices=["all", "chrome", "edge", "firefox"], default="all")
target = parser.parse_args().target
targets = ["chrome", "edge", "firefox"] if target == "all" else [target]
files = sorted(path for path in extension.rglob("*") if path.is_file())

for target in targets:
    manifest = deepcopy(base)
    if target == "firefox":
        manifest.pop("minimum_chrome_version", None)
        manifest.update(json.loads((root / "manifests/firefox.json").read_text(encoding="utf-8")))
    if target == "edge":
        # Partner Center detects listing languages through localized manifest messages.
        manifest.update({
            "default_locale": "fr",
            "name": "__MSG_extensionName__",
            "description": "__MSG_extensionDescription__",
        })
    background = manifest["background"]
    assert background["type"] == "module"
    entries = background.get("scripts", [background.get("service_worker")])
    assert entries and all(entry and (extension / entry).is_file() for entry in entries)
    assert manifest["host_permissions"] == []
    assert manifest["optional_host_permissions"] == ["https://*/*"]
    if target == "firefox":
        assert "service_worker" not in background
        assert "userScripts" not in manifest["permissions"]
        assert "userScripts" in manifest["optional_permissions"]
    else:
        assert "userScripts" in manifest["permissions"]

    # Expanded folders can be loaded locally without modifying the source.
    folder = root / "dist" / target
    folder.mkdir(parents=True, exist_ok=True)
    payload = {path.relative_to(extension).as_posix(): path.read_bytes() for path in files}
    if target == "edge":
        # Keep the shared French text as the only maintained source of these messages.
        messages = {
            "extensionName": {"message": base["name"]},
            "extensionDescription": {"message": base["description"]},
        }
        locale_path = f"_locales/{manifest['default_locale']}/messages.json"
        payload[locale_path] = (json.dumps(messages, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
        for field in ["name", "description"]:
            key = manifest[field].removeprefix("__MSG_").removesuffix("__")
            assert messages[key]["message"] == base[field]
    payload["manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    # Remove obsolete generated files within the verified build directory only.
    workspace = root.resolve()
    if not folder.resolve().is_relative_to(workspace / "dist"):
        raise SystemExit("Build directory is outside dist")
    for stale in folder.rglob("*"):
        if stale.is_file() and stale.relative_to(folder).as_posix() not in payload:
            stale.unlink()
    for name, content in payload.items():
        destination = folder / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(content)

    output = root / "dist" / f"Mes-outils-{target.capitalize()}.zip"
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        for name, content in payload.items():
            archive.writestr(name, content)
    with ZipFile(output) as archive:
        assert "manifest.json" in archive.namelist()
        assert set(archive.namelist()) == set(payload)
        for name, content in payload.items():
            assert archive.read(name) == content, f"Archive mismatch: {name}"
        if target == "edge":
            archived_manifest = json.loads(archive.read("manifest.json"))
            archived_messages = json.loads(archive.read(locale_path))
            assert archived_manifest["default_locale"] == "fr"
            for field in ["name", "description"]:
                key = archived_manifest[field][6:-2]
                assert archived_messages[key]["message"] == base[field]
    print(f"{output.name}: version {manifest['version']}, {len(payload)} files verified")

# Generated hosting copy; extension/privacy.html remains the only maintained source.
public_policy = root / "dist" / "publication" / "site" / "privacy.html"
public_policy.parent.mkdir(parents=True, exist_ok=True)
public_policy.write_bytes((extension / "privacy.html").read_bytes())
print("Politique à héberger : dist/publication/site/privacy.html")
