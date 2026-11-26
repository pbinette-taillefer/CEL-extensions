import test from "node:test";
import assert from "node:assert/strict";
import { createManager } from "../extension/modules.js";
import { localScript } from "../extension/script.js";
import { fakeApi } from "./support/fake-api.mjs";

function source(name = "Local", version = "1.0.0", suffix = "") {
  return `// ==UserScript==\n// @name ${name}\n// @namespace test\n// @version ${version}\n// @match https://example.test/*\n// ==/UserScript==\nglobalThis.localValue = 1;${suffix}`;
}
function setup() {
  const env = fakeApi();
  let downloads = 0;
  const manager = createManager(env.api, { download: async () => { downloads++; throw new Error("Un fichier local ne se télécharge pas"); } });
  return { ...env, manager, downloads: () => downloads };
}
async function install(env, name = "outil.js", code = source()) {
  const preview = await env.manager.prepareLocal(name, code);
  return (await env.manager.install(preview.token)).modules.find((item) => item.installed.meta.name === "Local");
}

test("fichier local analysé et empreinté, extension .js et métadonnées obligatoires", async () => {
  const script = await localScript("outil.js", source());
  assert.equal(script.sourceKind, "local");
  assert.equal(script.sourceUrl, null);
  assert.equal(script.sourceName, "outil.js");
  assert.equal(script.digest.length, 64);
  assert.equal(script.digest, (await localScript("renomme.js", source())).digest);
  await assert.rejects(localScript("outil.txt", source()), /fichier JavaScript/);
  await assert.rejects(localScript("../outil.js", source()), /fichier JavaScript/);
  await assert.rejects(localScript("outil.js", "alert(1)"), /en-tête/);
  await assert.rejects(localScript("outil.js", source() + "\nconst = ;"), /Syntaxe/);
  await assert.rejects(localScript("outil.js", " ".repeat(1024 * 1024 + 1)), /1 Mo/);
});

test("aperçu sans injection, confirmation avec permission de cible uniquement", async () => {
  const env = setup();
  env.origins.delete("https://cdn.example.test/*");
  const preview = await env.manager.prepareLocal("outil.js", source());
  assert.equal(env.scripts.size, 0);
  const item = (await env.manager.install(preview.token)).modules[0];
  assert.equal(item.installed.sourceKind, "local");
  assert.equal(item.sourceAllowed, true);
  assert.equal(env.scripts.size, 1);
  assert.equal(env.downloads(), 0);
});

test("les sites d’un fichier local doivent aussi être autorisés", async () => {
  const env = setup(); env.origins.clear();
  const preview = await env.manager.prepareLocal("outil.js", source());
  await assert.rejects(env.manager.install(preview.token), /Autorisez l’accès aux sites/);
  assert.equal(env.scripts.size, 0);
});

test("réimportation manuelle à version identique : même outil, nouveau code, pause conservée", async () => {
  const env = setup();
  const first = await install(env);
  await env.manager.toggle(first.id, false);
  const preview = await env.manager.prepareLocal("nouveau-nom.js", source("Local", "1.0.0", "\nglobalThis.localValue = 2;"));
  assert.equal(preview.replaces, "Local");
  const modules = (await env.manager.install(preview.token)).modules;
  assert.equal(modules.length, 1);
  assert.equal(modules[0].id, first.id);
  assert.equal(modules[0].installed.enabled, false);
  assert.equal(modules[0].installed.sourceName, "nouveau-nom.js");
  await env.manager.toggle(first.id, true);
  assert.match(env.scripts.get(first.id).js[0].code, /localValue = 2/);
});

test("les outils locaux ne sont jamais vérifiés sur le réseau et survivent au redémarrage", async () => {
  const env = setup(); const item = await install(env);
  assert.equal((await env.manager.check(item.id)).outcome, "local");
  assert.deepEqual(await env.manager.check(), []);
  env.scripts.clear();
  await env.manager.bootstrap();
  assert.equal(env.scripts.size, 1);
  assert.equal(env.downloads(), 0);
  await env.manager.remove(item.id);
  assert.equal((await env.manager.state()).modules.length, 0);
});

test("deux fichiers locaux distincts ne se remplacent pas et l’échec de stockage restaure le précédent", async () => {
  const env = setup(); const first = await install(env);
  const second = await env.manager.prepareLocal("autre.js", source("Autre"));
  await env.manager.install(second.token);
  assert.equal((await env.manager.state()).modules.length, 2);
  const preview = await env.manager.prepareLocal("outil.js", source("Local", "1.0.0", "\nglobalThis.localValue = 3;"));
  env.control.failNextSave = true;
  await assert.rejects(env.manager.install(preview.token), /Quota/);
  assert.doesNotMatch(env.scripts.get(first.id).js[0].code, /localValue = 3/);
});
