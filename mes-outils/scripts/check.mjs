import { readFile, readdir, access } from "node:fs/promises";
import { parse } from "../extension/vendor/acorn.mjs";
import assert from "node:assert/strict";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("extension/manifest.json", root), "utf8"));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.host_permissions, []);
assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"]);
assert.ok(!manifest.permissions.includes("debugger"));
const firefox = JSON.parse(await readFile(new URL("manifests/firefox.json", root), "utf8"));
assert.deepEqual(firefox.optional_permissions, ["userScripts"]);
assert.ok(!firefox.permissions.includes("userScripts"));
assert.ok(!firefox.background.service_worker);
assert.equal(firefox.background.type, "module");
for (const path of firefox.background.scripts) await access(new URL(`extension/${path}`, root));
await access(new URL("extension/privacy.html", root));
assert.equal(manifest.version, JSON.parse(await readFile(new URL("package.json", root), "utf8")).version);
for (const path of [
  manifest.background.service_worker,
  manifest.action.default_popup,
  manifest.options_ui.page,
  ...Object.values(manifest.icons),
]) {
  await access(new URL(`extension/${path}`, root));
}
for (const name of await readdir(new URL("extension/", root))) {
  if (name.endsWith(".js")) {
    const moduleUrl = new URL(`extension/${name}`, root);
    const module = parse(await readFile(moduleUrl, "utf8"), {
      ecmaVersion: "latest",
      sourceType: "module",
    });
    for (const declaration of module.body) {
      if (declaration.type === "ImportDeclaration" && declaration.source.value.startsWith(".")) {
        await access(new URL(declaration.source.value, moduleUrl));
      }
    }
  }
  if (name.endsWith(".html")) {
    const html = await readFile(new URL(`extension/${name}`, root), "utf8");
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, new Set(ids).size, `Identifiants HTML dupliqués dans ${name}`);
    assert.ok(!/\son\w+=/i.test(html), `Gestionnaire inline interdit dans ${name}`);
    for (const [, path] of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
      if (!path.includes(":")) await access(new URL(`extension/${path}`, root));
    }
  }
}
console.log(
  "Manifest, ressources et imports locaux, identifiants HTML et syntaxe JavaScript : OK.",
);
