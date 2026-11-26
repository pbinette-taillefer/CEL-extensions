import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { validateCatalog, fieldsFor, courseCatalogUrl, courseContext, fetchCatalogJson } from "../src/catalogue.mjs";
import { parseScript } from "../../../../mes-outils/extension/script.js";

const fixture = JSON.parse(await readFile(new URL("fixtures/catalogue.json", import.meta.url), "utf8"));

test("script générique sans fragments embarqués, identité conservée pour la mise à jour", async () => {
  assert.deepEqual(await readdir(new URL("../dist/", import.meta.url)), ["composants-cel.user.js"]);
  const source = await readFile(new URL("../dist/composants-cel.user.js", import.meta.url), "utf8");
  const meta = parseScript(source);
  assert.equal(meta.name, "Composants CEL — prototype");
  assert.equal(meta.namespace, "cel");
  assert.equal(meta.version, "0.4.3");
  assert.ok(!source.includes("med-fullimg"));
});

test("catalogue actuel et liste vide acceptés, définitions conservées sans insertion", () => {
  assert.equal(validateCatalog(fixture).entries.length, 19);
  assert.equal(validateCatalog({ ...fixture, entries: [] }).components.length, fixture.components.length);
});

test("catalogues incompatibles, cibles inconnues, doublons et attributs invalides refusés", () => {
  for (const change of [
    { version: 2 },
    { entries: [...fixture.entries, fixture.entries[0]] },
    { entries: [{ ...fixture.entries[0], name: "missing" }] },
    { entries: [{ ...fixture.entries[0], uniqueAttributes: ["onclick"] }] },
    { components: [{ type: "site", name: "test", fields: [{ attribute: "onclick", type: "text", label: "Test" }] }] },
  ]) assert.throws(() => validateCatalog({ ...fixture, ...change }));
});

test("options structurelles : trois colonnes et PDF restent dans leur groupe", () => {
  const grid = fixture.components.find((item) => item.name === "grid");
  const triple = fieldsFor(grid, { "data-prop-type": "triple" }, true)[0];
  assert.deepEqual(triple.options.map((option) => option[0]), ["triple"]);
  assert.equal(triple.allowDefault, false);
  const normal = fieldsFor(grid, {}, true)[0];
  assert.equal(normal.allowDefault, true);
  assert.equal(normal.options.length, 3);
  assert.equal(fieldsFor(grid, {}, false)[0].options.length, 3, "le fragment à deux colonnes conserve ses slots dès l’insertion");
  const pdf = fixture.components.find((item) => item.name === "artefact");
  assert.deepEqual(fieldsFor(pdf, { "data-prop-type": "pdf" }, true)[0].options, ["pdf"]);
});

test("cours D2L classique, leçons et édition par ou reconnus", () => {
  for (const url of [
    "https://d2l.example/d2l/le/content/123/EditFile?type=topic",
    "https://d2l.example/d2l/le/lessons/123/topics/456",
    "https://d2l.example/d2l/lp/manageFiles/main.d2l?ou=123",
  ]) assert.equal(courseContext([url]).orgUnitId, "123");
  assert.equal(courseContext(["about:blank", "https://d2l.example/"]), null);
});

test("chaque cours charge son propre Path par l’API, sans attribut ni identifiant codé en dur", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push(String(url));
    assert.equal(options.cache, "no-store");
    return Response.json(String(url).endsWith("/versions/") ? { LatestVersion: "1.60" }
      : { Path: `/content/enforced/${String(url).endsWith("123") ? "123-cours-a" : "987-cours-b"}/` });
  });
  const first = await courseCatalogUrl(["https://d2l.example/d2l/le/content/123/Edit"]);
  const second = await courseCatalogUrl(["https://d2l.example/d2l/le/content/987/Edit"]);
  assert.equal(first, "https://d2l.example/content/enforced/123-cours-a/editor/catalogue.json");
  assert.equal(second, "https://d2l.example/content/enforced/987-cours-b/editor/catalogue.json");
  assert.equal(requests.length, 4);
});

test("aperçu local et fichiers enforced, absence de contexte et erreurs réseau", async (t) => {
  assert.equal(await courseCatalogUrl(["http://localhost:4175/editor.css"]), "http://localhost:4175/editor/catalogue.json");
  assert.equal(await courseCatalogUrl(["https://d2l.example/content/enforced/123-test/pages/deep/page.html"]),
    "https://d2l.example/content/enforced/123-test/editor/catalogue.json");
  await assert.rejects(courseCatalogUrl(["https://d2l.example/"]), /Impossible de trouver/);
  t.mock.method(globalThis, "fetch", async () => new Response("missing", { status: 404 }));
  await assert.rejects(fetchCatalogJson("https://d2l.example/editor/catalogue.json"), /404/);
});
