import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { parseScript, downloadScript } from "../extension/script.js";
import { MAX_BYTES } from "../extension/shared.js";

const source = await readFile(new URL("../publication/demo/outil.js", import.meta.url), "utf8");

test("document-idle explicite ou par défaut ; timings précoces refusés", () => {
  assert.equal(parseScript(source).runAt, "document_idle");
  assert.equal(parseScript(source.replace("// @run-at document-idle\n", "")).runAt, "document_idle");
  for (const timing of ["document-start", "document-end", "invalid"]) {
    assert.throws(() => parseScript(source.replace("@run-at document-idle", `@run-at ${timing}`)), /Seul @run-at document-idle/);
  }
});

test("métadonnées dangereuses, syntaxe invalide et domaine générique refusés", () => {
  assert.throws(() => parseScript(source.replace("@grant none", "@grant GM_xmlhttpRequest")), /@grant none/);
  assert.throws(() => parseScript(source.replace("@grant none", "@require https://cdn.example.test/lib.js")), /@require/);
  assert.throws(() => parseScript(source.replace("demo.example.test", "*.example.test")), /domaine HTTPS explicite/);
  assert.throws(() => parseScript(source + "\nconst = ;"), /Syntaxe JavaScript invalide/);
});

test("téléchargement sans cookies, redirection ni Referer et empreinte exacte", async () => {
  let options;
  const file = await downloadScript("https://cdn.example.test/outil.js", async (_url, init) => {
    options = init;
    return new Response(source);
  });
  assert.equal(options.credentials, "omit");
  assert.equal(options.redirect, "error");
  assert.equal(options.referrerPolicy, "no-referrer");
  const digest = Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))).toString("hex");
  assert.equal(file.digest, digest);
  assert.equal(file.code, source);
});

test("taille maximale contrôlée même sans Content-Length", async () => {
  const response = new Response(new Uint8Array(MAX_BYTES + 1));
  await assert.rejects(downloadScript("https://cdn.example.test/outil.js", async () => response), /dépasse 1 Mo/);
});

test("erreurs HTTP, UTF-8 invalide et redirection refusée exposées sans installation", async () => {
  await assert.rejects(downloadScript("https://cdn.example.test/x.js", async () => new Response("", { status: 404 })), /HTTP 404/);
  await assert.rejects(downloadScript("https://cdn.example.test/x.js", async () => new Response(new Uint8Array([0xff]))), /Téléchargement impossible/);
  await assert.rejects(downloadScript("https://cdn.example.test/x.js", async () => { throw new TypeError("redirect"); }), /Téléchargement impossible/);
  await assert.rejects(downloadScript("http://cdn.example.test/x.js"), /HTTPS/);
});

test("les deux scripts de démonstration affichent leur version et évitent les doublons", async () => {
  for (const [file, version] of [["outil.js", "1.0.0"], ["outil-v2.js", "1.0.1"]]) {
    const code = await readFile(new URL(`../publication/demo/${file}`, import.meta.url), "utf8");
    assert.equal(parseScript(code).version, version);
    const nodes = [];
    const document = {
      getElementById: (id) => nodes.find((item) => item.id === id),
      createElement: () => ({ style: {}, setAttribute() {} }),
      body: { prepend: (item) => nodes.unshift(item) },
    };
    const context = vm.createContext({ document });
    vm.runInContext(code, context);
    vm.runInContext(code, context);
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0].textContent, `Mes outils fonctionne · version ${version}`);
  }
});
