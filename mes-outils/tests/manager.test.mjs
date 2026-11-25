import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { createManager } from "../extension/modules.js";
import { parseScript, registration } from "../extension/script.js";
import { PREVIEW_TTL_MS, RUN_AT_HELP } from "../extension/shared.js";
import { fakeApi } from "./support/fake-api.mjs";

function candidate(version = "1.0.0", sourceUrl = "https://cdn.example.test/outil.js") {
  const code = `// ==UserScript==\n// @name Test\n// @namespace tests\n// @version ${version}\n// @match https://example.test/*\n// @run-at document-idle\n// ==/UserScript==\nglobalThis.executed = ${JSON.stringify(version)};`;
  return { sourceUrl, code, meta: parseScript(code), digest: version + "-digest" };
}
function setup() {
  const browser = fakeApi();
  let time = 1_000_000;
  let current = candidate();
  let downloader = async () => structuredClone(current);
  const manager = createManager(browser.api, { download: (url) => downloader(url), now: () => time });
  async function install() {
    const preview = await manager.prepare(current.sourceUrl);
    return (await manager.install(preview.token)).modules[0];
  }
  return {
    ...browser, manager, install,
    setCandidate(value) { current = value; },
    setDownloader(value) { downloader = value; },
    advance(value) { time += value; },
  };
}

test("l’aperçu n’enregistre rien ; installation, autorisation exacte, pause et suppression", async () => {
  const env = setup();
  const preview = await env.manager.prepare(candidate().sourceUrl);
  assert.equal(env.scripts.size, 0);
  const item = (await env.manager.install(preview.token)).modules[0];
  const code = env.scripts.get(item.id).js[0].code;
  async function execute() {
    const context = vm.createContext({ chrome: { runtime: { sendMessage: (message) => env.manager.authorize(message.id, message.digest) } }, console });
    await vm.runInContext(code, context);
    return context.executed;
  }
  assert.equal(await execute(), "1.0.0");
  assert.equal(await env.manager.authorize(item.id, "autre-empreinte"), false);
  await env.manager.toggle(item.id, false);
  assert.equal(env.scripts.size, 0);
  assert.equal(await execute(), undefined, "une ancienne enveloppe ne s’exécute plus après la pause");
  await env.manager.toggle(item.id, true);
  assert.equal(env.scripts.size, 1);
  await env.manager.remove(item.id);
  assert.equal((await env.manager.state()).modules.length, 0);
  assert.equal(await execute(), undefined);
});

test("mise à jour en attente : l’ancienne version reste active jusqu’à l’approbation exacte", async () => {
  const env = setup();
  const item = await env.install();
  env.setCandidate(candidate("1.0.1"));
  assert.equal((await env.manager.check(item.id)).outcome, "pending");
  assert.match(env.scripts.get(item.id).js[0].code, /1\.0\.0-digest/);
  await assert.rejects(env.manager.approveUpdate(item.id, "autre-empreinte"), /a changé/);
  await env.manager.approveUpdate(item.id, "1.0.1-digest");
  assert.equal((await env.manager.state()).modules[0].installed.meta.version, "1.0.1");
  assert.equal(await env.manager.authorize(item.id, "1.0.0-digest"), false);
  assert.equal(await env.manager.authorize(item.id, "1.0.1-digest"), true);
});

test("un candidat plus récent invalide l’ancien bouton d’approbation", async () => {
  const env = setup();
  const item = await env.install();
  env.setCandidate(candidate("1.0.1"));
  await env.manager.check(item.id);
  env.setCandidate(candidate("1.0.2"));
  await env.manager.check(item.id);
  await assert.rejects(env.manager.approveUpdate(item.id, "1.0.1-digest"), /a changé/);
  assert.equal((await env.manager.state()).modules[0].pendingUpdate.meta.version, "1.0.2");
});

test("mise à jour d’un outil en pause sans permission userScripts : la pause est conservée", async () => {
  const env = setup();
  const item = await env.install();
  await env.manager.toggle(item.id, false);
  env.setCandidate(candidate("1.0.1"));
  await env.manager.check(item.id);
  env.control.userScriptsAllowed = false;
  await env.manager.approveUpdate(item.id, "1.0.1-digest");
  const state = (await env.manager.state()).modules[0];
  assert.equal(state.installed.enabled, false);
  assert.equal(state.installed.meta.version, "1.0.1");
  assert.equal(env.scripts.size, 0);
  await env.manager.remove(item.id);
  assert.equal((await env.manager.state()).modules.length, 0);
});

test("un nouveau domaine exige sa permission avant approbation", async () => {
  const env = setup();
  const item = await env.install();
  const next = candidate("1.0.1");
  next.meta.matches = ["https://new.example.test/*"];
  env.setCandidate(next);
  await env.manager.check(item.id);
  await assert.rejects(env.manager.approveUpdate(item.id, next.digest), /Autorisez l’accès/);
  assert.equal((await env.manager.state()).modules[0].installed.meta.version, "1.0.0");
  env.origins.add("https://new.example.test/*");
  await env.manager.approveUpdate(item.id, next.digest);
  assert.deepEqual(env.scripts.get(item.id).matches, next.meta.matches);
});

test("échec de stockage : restauration de l’enregistrement précédent", async () => {
  const env = setup();
  const item = await env.install();
  env.setCandidate(candidate("1.0.1"));
  await env.manager.check(item.id);
  env.control.failNextSave = true;
  await assert.rejects(env.manager.approveUpdate(item.id, "1.0.1-digest"), /Quota/);
  assert.match(env.scripts.get(item.id).js[0].code, /1\.0\.0-digest/);
  assert.equal((await env.manager.state()).modules[0].installed.meta.version, "1.0.0");
});

test("suppression pendant un téléchargement : aucune résurrection de l’outil", async () => {
  const env = setup();
  const item = await env.install();
  let finish, started;
  const downloading = new Promise((resolve) => { started = resolve; });
  env.setDownloader(() => { started(); return new Promise((resolve) => { finish = resolve; }); });
  const checking = env.manager.check(item.id);
  await downloading;
  await env.manager.remove(item.id);
  finish(candidate("1.0.1"));
  assert.equal((await checking).outcome, "empty");
  assert.equal((await env.manager.state()).modules.length, 0);
  assert.equal(env.scripts.size, 0);
});

test("un aperçu expiré n’est pas installé", async () => {
  const env = setup();
  const preview = await env.manager.prepare(candidate().sourceUrl);
  env.advance(PREVIEW_TTL_MS);
  await assert.rejects(env.manager.install(preview.token), /expiré/);
  assert.equal(env.scripts.size, 0);
});

test("une réponse réseau en erreur conserve la version installée", async () => {
  const env = setup();
  const item = await env.install();
  env.setDownloader(async () => { throw new Error("Serveur indisponible"); });
  const result = await env.manager.check(item.id);
  assert.equal(result.outcome, "error");
  assert.equal(result.state.lastError, "Serveur indisponible");
  assert.match(env.scripts.get(item.id).js[0].code, /1\.0\.0-digest/);
});

test("redémarrage et mise à jour de l’extension restaurent les outils approuvés", async () => {
  const env = setup();
  const item = await env.install();
  env.scripts.clear();
  const restarted = createManager(env.api, { now: () => 1_000_000 });
  await restarted.bootstrap();
  assert.equal(env.scripts.size, 1);
  assert.equal(await restarted.authorize(item.id, "1.0.0-digest"), true);
  assert.equal(env.api.alarms.alarm.periodInMinutes, 60);
});

test("révocation de userScripts : pause locale possible, restauration après réactivation", async () => {
  const env = setup();
  const item = await env.install();
  env.control.userScriptsAllowed = false;
  assert.equal((await env.manager.state()).userScriptsAllowed, false);
  await env.manager.toggle(item.id, false);
  env.control.userScriptsAllowed = true;
  await env.manager.synchronize();
  assert.equal(env.scripts.size, 0);
  await env.manager.toggle(item.id, true);
  assert.equal(env.scripts.size, 1);
});

test("anciens timings : injections retirées, autorisation refusée, autres outils restaurés", async () => {
  const env = setup();
  const item = await env.install();
  const data = (await env.api.storage.local.get("state")).state;
  data.modules[0].installed.meta.runAt = "document_start";
  const other = candidate();
  other.meta.name = "Autre outil";
  data.modules.push({ ...structuredClone(data.modules[0]), id: "module-other", installed: { ...other, enabled: true } });
  await env.api.storage.local.set({ state: data });
  assert.equal(await env.manager.authorize(item.id, "1.0.0-digest"), false);
  await env.manager.synchronize();
  assert.equal(env.scripts.has(item.id), false);
  assert.equal(env.scripts.has("module-other"), true);
  assert.equal((await env.manager.state()).modules[0].lastError, RUN_AT_HELP);
  const writes = env.control.writes;
  await env.manager.synchronize();
  assert.equal(env.control.writes, writes, "pas de boucle de changement de stockage");
  assert.throws(() => registration(data.modules[0].installed, item.id), /document-idle/);
});

test("un ancien aperçu incompatible ne supprime pas un outil valide déjà installé", async () => {
  const env = setup();
  const item = await env.install();
  const invalid = candidate("1.0.1");
  invalid.meta.runAt = "document_end";
  await env.api.storage.session.set({ pending: { token: "legacy-preview", candidate: invalid, expiresAt: 2_000_000 } });
  await assert.rejects(env.manager.install("legacy-preview"), /document-idle/);
  assert.equal(env.scripts.has(item.id), true);
  assert.match(env.scripts.get(item.id).js[0].code, /1\.0\.0-digest/);
});

test("un outil ancien bloqué peut être rétabli par une mise à jour compatible approuvée", async () => {
  const env = setup();
  const item = await env.install();
  const data = (await env.api.storage.local.get("state")).state;
  data.modules[0].installed.meta.runAt = "document_start";
  await env.api.storage.local.set({ state: data });
  await env.manager.synchronize();
  env.setCandidate(candidate("1.0.1"));
  await env.manager.check(item.id);
  assert.equal(env.scripts.has(item.id), false);
  await env.manager.approveUpdate(item.id, "1.0.1-digest");
  assert.equal(env.scripts.get(item.id).runAt, "document_idle");
  assert.equal((await env.manager.state()).modules[0].lastError, null);
});

test("rétrogradation et code modifié sans nouvelle version sont refusés", async () => {
  const env = setup();
  const item = await env.install();
  env.setCandidate(candidate("0.9.0"));
  assert.match((await env.manager.check(item.id)).state.lastError, /plus ancienne/);
  const changed = candidate();
  changed.digest = "modified-same-version";
  env.setCandidate(changed);
  assert.match((await env.manager.check(item.id)).state.lastError, /sans augmentation/);
  assert.equal((await env.manager.state()).modules[0].pendingUpdate, null);
  assert.equal(await env.manager.authorize(item.id, "1.0.0-digest"), true);
});
