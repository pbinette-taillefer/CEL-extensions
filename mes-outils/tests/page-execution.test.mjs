import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { parseScript, registration } from "../extension/script.js";
import { executePageScript } from "../extension/page-execution.js";
import { createManager } from "../extension/modules.js";
import { fakeApi } from "./support/fake-api.mjs";

const code = `// ==UserScript==
// @name Accès à la page
// @version 1.0.0
// @match https://example.test/d2l/*
// @exclude-match https://example.test/d2l/private/*
// @inject-into page
// @noframes
// ==/UserScript==
globalThis.result = globalThis.siteObject.value;`;

test("contexte isolé par défaut, opt-in page/content et valeurs inconnues refusées", () => {
  assert.equal(parseScript(code).injectInto, "page");
  assert.equal(parseScript(code.replace("// @inject-into page\n", "")).injectInto, "content");
  assert.equal(parseScript(code.replace("@inject-into page", "@inject-into content")).injectInto, "content");
  for (const value of ["", "auto", "MAIN"]) assert.throws(() => parseScript(code.replace("@inject-into page", `@inject-into ${value}`)), /inject-into/);
  assert.throws(() => parseScript(code.replace("@noframes", "@inject-into page")), /Une seule valeur/);
});

test("le lanceur isolé transmet uniquement l’identité et l’empreinte de l’outil", async () => {
  const wrapped = registration({ code, meta: parseScript(code), digest: "hash" }, "module-test");
  assert.equal(wrapped.world, "USER_SCRIPT");
  assert.doesNotMatch(wrapped.js[0].code, /siteObject/);
  let message;
  const context = vm.createContext({ console, chrome: { runtime: { async sendMessage(value) { message = value; return true; } } } });
  await vm.runInContext(wrapped.js[0].code, context);
  assert.equal(JSON.stringify(message), JSON.stringify({ type: "execute-page", id: "module-test", digest: "hash" }));
  assert.equal(context.result, undefined);
});

function setup() {
  const calls = [];
  const installed = { code, meta: parseScript(code), digest: "hash", enabled: true };
  const api = { runtime: { id: "extension" }, userScripts: { async execute(options) { calls.push(options); return [{}]; } } };
  const sender = { id: "extension", tab: { id: 7 }, frameId: 0, documentId: "document-123", url: "https://example.test/d2l/edit?x=1" };
  const message = { id: "module-test", digest: "hash", code: "globalThis.hijacked = true" };
  return { api, installed, sender, message, calls };
}

test("seule la copie installée s’exécute dans MAIN et dans le document émetteur exact", async () => {
  const env = setup();
  assert.equal(await executePageScript(env.api, env.installed, env.message, env.sender), true);
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.calls[0].target, { tabId: 7, documentIds: ["document-123"] });
  assert.equal(env.calls[0].world, "MAIN");
  const page = vm.createContext({ siteObject: { value: 42 } });
  vm.runInContext(env.calls[0].js[0].code, page);
  assert.equal(page.result, 42);
  assert.equal(page.hijacked, undefined);
});

test("activation, empreinte, mode, timing, URL, exclusions et cadre contrôlés", async () => {
  for (const change of [
    (env) => { env.sender.id = "other"; }, (env) => { env.sender.tab = undefined; },
    (env) => { env.sender.documentId = undefined; }, (env) => { env.installed.enabled = false; },
    (env) => { env.message.digest = "old"; }, (env) => { env.installed.meta.injectInto = "content"; },
    (env) => { env.installed.meta.runAt = "document_start"; },
    (env) => { env.sender.url = "https://other.test/d2l/edit"; },
    (env) => { env.sender.url = "https://example.test/elsewhere"; },
    (env) => { env.sender.url = "https://example.test/d2l/private/edit"; },
    (env) => { env.sender.frameId = 1; },
  ]) {
    const env = setup(); change(env);
    assert.equal(await executePageScript(env.api, env.installed, env.message, env.sender), false);
    assert.equal(env.calls.length, 0);
  }
});

test("API absente et erreur d’exécution rapportées", async () => {
  const env = setup();
  env.api.userScripts.execute = undefined;
  await assert.rejects(executePageScript(env.api, env.installed, env.message, env.sender), /userScripts.execute/);
  env.api.userScripts.execute = async () => [{ error: "Test error" }];
  await assert.rejects(executePageScript(env.api, env.installed, env.message, env.sender), /Test error/);
});

test("une pause ne peut s’intercaler entre l’autorisation et l’injection", async () => {
  const env = fakeApi();
  env.api.runtime = { id: "extension" };
  let finish, started;
  const began = new Promise((resolve) => { started = resolve; });
  env.api.userScripts.execute = async () => { started(); return new Promise((resolve) => { finish = resolve; }); };
  const manager = createManager(env.api, { download: async () => ({ code, meta: parseScript(code), digest: "hash", sourceUrl: "https://cdn.example.test/tool.js" }) });
  const preview = await manager.prepare("https://cdn.example.test/tool.js");
  const item = (await manager.install(preview.token)).modules[0];
  const sender = setup().sender;
  const running = manager.executePage({ id: item.id, digest: "hash" }, sender);
  await began;
  let paused = false;
  const pause = manager.toggle(item.id, false).then(() => { paused = true; });
  await Promise.resolve();
  assert.equal(paused, false);
  finish([{}]);
  await running; await pause;
  assert.equal(await manager.executePage({ id: item.id, digest: "hash" }, sender), false);
});
