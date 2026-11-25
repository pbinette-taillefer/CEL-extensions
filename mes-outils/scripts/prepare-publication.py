"""Prepare static files for HTTPS hosting; never upload or publish anything."""
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import argparse
import shutil

ROOT = Path(__file__).resolve().parent.parent
DEMO_MATCH = "https://demo.example.test/mes-outils/demo/*"


def hosting_base(value):
    url = urlsplit(value)
    if (url.scheme != "https" or not url.hostname or url.username or url.password
            or url.port or url.query or url.fragment or "*" in value or ":" in url.netloc
            or any(char.isspace() for char in value) or "\\" in value):
        raise ValueError("Utilisez une URL HTTPS de dossier, sans identifiants, port, requête ni fragment.")
    # Script metadata is one line; URL-encode non-ASCII characters before passing the URL.
    value.encode("ascii")
    return urlunsplit(("https", url.netloc.lower(), url.path.rstrip("/") + "/", "", ""))


def prepare(base_url):
    base = hosting_base(base_url)
    output = ROOT / "dist" / "publication"
    site = output / "site"
    demo = site / "demo"
    demo.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / "extension" / "privacy.html", site / "privacy.html")
    for name in ["index.html", "style.css"]:
        shutil.copyfile(ROOT / "publication" / "demo" / name, demo / name)
    for name in ["outil.js", "outil-v2.js"]:
        content = (ROOT / "publication" / "demo" / name).read_text(encoding="utf-8")
        assert content.count(DEMO_MATCH) == 1
        (demo / name).write_text(content.replace(DEMO_MATCH, base + "demo/*"), encoding="utf-8")
    instructions = (ROOT / "publication" / "INSTRUCTIONS-EXAMEN.md").read_text(encoding="utf-8")
    instructions = instructions.replace("{{BASE_URL}}", base)
    (output / "INSTRUCTIONS-EXAMEN.md").write_text(instructions, encoding="utf-8")
    (output / "URLS.txt").write_text(
        f"Politique : {base}privacy.html\nPage de test : {base}demo/index.html\n"
        f"Script à installer : {base}demo/outil.js\n"
        "Téléverser uniquement le contenu de site/ dans le dossier HTTPS choisi.\n"
        "Vérifier les URL réelles avant soumission ; cette commande ne teste pas le serveur.\n",
        encoding="utf-8",
    )
    print(f"Fichiers préparés dans {output}; aucun téléversement effectué.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", required=True, help="URL HTTPS du dossier qui accueillera privacy.html et demo/")
    args = parser.parse_args()
    try:
        prepare(args.base_url)
    except (ValueError, UnicodeError) as error:
        parser.error(str(error))
