// Integration check: generic page execution + file import + TinyMCE 8.4.0.
// Optional args: path to playwright module, path to Chromium executable.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";

const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
const root = resolve(workspace, "scripts/d2l/composants");
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || resolve(workspace, "cq-tool/node_modules/playwright"));
const vendor = resolve(workspace, "mes-outils/.artifacts/tinymce-8.4.0/package");
const artifacts = resolve(workspace, "mes-outils/.artifacts/composants-prototype");
await mkdir(artifacts, { recursive: true });
const source = await readFile(resolve(root, "composants-cel.user.js"), "utf8");
const extension = resolve(workspace, "mes-outils/dist/chrome");
const context = await chromium.launchPersistentContext(resolve(artifacts, `profile-${Date.now()}`), {
  ...(process.argv[3] ? { executablePath: process.argv[3] } : {}),
  headless: true, viewport: { width: 1280, height: 1000 },
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--lang=en-US"],
});
const results = [];
const errors = [];
const consoleMessages = [];
context.on("weberror", (error) => errors.push(String(error.error())));
context.on("console", (message) => { if (["error", "warning"].includes(message.type())) consoleMessages.push(message.text()); });
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).hostname;
  const settings = await context.newPage();
  await settings.goto(`chrome://extensions/?id=${extensionId}`);
  const toggle = settings.locator("#allow-user-scripts cr-toggle");
  await toggle.waitFor();
  if (!(await toggle.evaluate((node) => node.checked))) await toggle.click();
  await settings.evaluate(async (id) => {
    await chrome.developerPrivate.addHostPermission(id, "https://cforp.desire2learn.com/*");
  }, extensionId);
  await context.route("https://cforp.desire2learn.com/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const base = path.startsWith("/tinymce/") ? vendor : root;
    const relative = path.startsWith("/tinymce/") ? path.slice("/tinymce/".length) : path === "/prototype/" ? "demo.html" : path.slice(1);
    const file = resolve(base, relative);
    if (!file.startsWith(base + "/") && !file.startsWith(base + "\\")) return route.abort();
    try {
      const types = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" };
      await route.fulfill({ contentType: types[extname(file)] || "application/octet-stream", body: await readFile(file), headers: {
        "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://picsum.photos; frame-src 'self'",
      } });
    } catch { await route.fulfill({ status: 404, body: "Fixture not found" }); }
  });
  await context.route("https://picsum.photos/**", (route) => route.fulfill({ contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#c8e0d5"/></svg>' }));
  // Only the tool download is simulated; production parsing, consent and injection run.
  await worker.evaluate((code) => {
    globalThis.fetch = async (input) => {
      if (String(input) !== "https://cforp.desire2learn.com/composants-cel.user.js") throw new Error("Unexpected fixture download");
      return new Response(code, { status: 200 });
    };
  }, source);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.locator("#script-url").fill("https://cforp.desire2learn.com/composants-cel.user.js");
  await options.locator("#prepare").click();
  await options.locator("#preview-page-context").waitFor({ state: "visible" });
  await options.locator("#confirm-install").click();
  await options.locator(".module-card").waitFor();
  results.push("Installation HTTPS avec aperçu du contexte de la page");

  const page = await context.newPage();
  await page.goto("https://cforp.desire2learn.com/prototype/?extension=1");
  await page.waitForFunction(() => tinymce.get().filter((editor) => editor.initialized).length === 1);
  await page.locator("[data-cel-components-toolbar]").waitFor({ timeout: 10000 });
  const toolbar = page.locator('[data-cel-editor-id="demo-editor"]');
  assert.equal(await toolbar.count(), 1);
  assert.equal(await page.locator("[data-cel-components-toolbar]").count(), 1);
  assert.equal(await page.evaluate(() => typeof window.__celComponentsPrototype?.stop), "function", "le script est exécuté dans le contexte de la page");
  results.push("Un seul éditeur et un seul menu, avec exécution MAIN et CSP restrictive");
  assert.equal(await toolbar.locator(".badge").textContent(), "Prototype · MED");
  const detection = await page.evaluate(async () => {
    const request = (op, data = {}) => new Promise((resolve) => {
      const id = crypto.randomUUID();
      const receive = (event) => {
        const response = JSON.parse(event.detail);
        if (response.id === id) { window.removeEventListener("mes-outils:tinymce:response", receive); resolve(response); }
      };
      window.addEventListener("mes-outils:tinymce:response", receive);
      window.dispatchEvent(new CustomEvent("mes-outils:tinymce:request", { detail: JSON.stringify({ id, op, ...data }) }));
    });
    // Neither the host page nor a copied component can identify an editor's page.
    Object.assign(document.body.dataset, { celTemplate: "handlebars", celTemplateVersion: "1", celCourseCode: "HOST" });
    const editor = tinymce.get("demo-editor");
    const originalContent = editor.getContent();
    editor.setContent('<div data-cel-template="handlebars" data-cel-template-version="1" data-cel-course-code="COPIED"><p>Composant copié</p></div>');
    const body = editor.getBody();
    body.removeAttribute("data-cel-template");
    const absent = await request("capture", { editorId: editor.id });
    body.dataset.celTemplate = "other"; body.dataset.celTemplateVersion = "1";
    const other = await request("capture", { editorId: editor.id });
    body.dataset.celTemplate = "handlebars";
    body.removeAttribute("data-cel-template-version");
    const unversioned = await request("capture", { editorId: editor.id });
    await request("release", { token: unversioned.result.token });
    body.dataset.celTemplateVersion = "2";
    const future = await request("capture", { editorId: editor.id });
    await request("release", { token: future.result.token });
    body.dataset.celTemplateVersion = "1"; body.dataset.celCourseCode = "PROBE";
    editor.focus(); editor.selection.select(body, true); editor.selection.collapse(false);
    const capture = await request("capture", { editorId: editor.id });
    const before = editor.getContent();
    body.dataset.celTemplate = "other";
    const changedTemplate = await request("insert", { token: capture.result.token, html: "<p>Insertion interdite</p>" });
    body.dataset.celTemplate = "handlebars"; body.dataset.celCourseCode = "OTHER";
    const changedCourse = await request("insert", { token: capture.result.token, html: "<p>Insertion interdite</p>" });
    body.dataset.celCourseCode = "PROBE";
    await request("release", { token: capture.result.token });
    return { absent, other, unversioned, future, changedTemplate, changedCourse, originalContent,
      unchanged: before === editor.getContent(), state: (await request("state")).result };
  });
  for (const name of ["absent", "other", "changedTemplate"]) {
    assert.equal(detection[name].ok, false, name);
    assert.match(detection[name].error, /template Handlebars/, name);
  }
  assert.equal(detection.unversioned.ok, true);
  assert.equal(detection.future.ok, true);
  assert.equal(detection.changedCourse.ok, false);
  assert.match(detection.changedCourse.error, /contenu a changé/);
  assert.equal(detection.unchanged, true);
  assert.equal(detection.state.compatible, true);
  assert.equal(detection.state.courseCode, "PROBE");
  const probeToolbar = toolbar;
  await probeToolbar.waitFor();
  assert.equal(await probeToolbar.locator(".badge").textContent(), "Prototype · MED");
  await page.evaluate(() => tinymce.get("demo-editor").getBody().dataset.celTemplate = "other");
  await probeToolbar.waitFor({ state: "detached" });
  await page.evaluate(() => tinymce.get("demo-editor").getBody().dataset.celTemplate = "handlebars");
  await probeToolbar.waitFor();
  await page.evaluate(() => {
    tinymce.get("demo-editor").getBody().removeAttribute("data-cel-template");
  });
  await probeToolbar.waitFor({ state: "detached" });
  await page.evaluate((html) => {
    const editor = tinymce.get("demo-editor");
    editor.setContent(html);
    editor.undoManager.reset();
    Object.assign(editor.getBody().dataset, { celTemplate: "handlebars", celTemplateVersion: "1", celCourseCode: "HFN1O" });
    for (const attribute of ["data-cel-template", "data-cel-template-version", "data-cel-course-code"]) document.body.removeAttribute(attribute);
  }, detection.originalContent);
  await toolbar.waitFor();
  results.push("Détection Handlebars sur le body de l’éditeur, signatures copiées ignorées, version non vérifiée, cote non affichée et mutations protégées");
  async function end(id = "demo-editor") {
    await page.evaluate((id) => { const editor = tinymce.get(id); editor.focus(); editor.selection.select(editor.getBody(), true); editor.selection.collapse(false); }, id);
  }
  async function insert(label, configure, target = toolbar) {
    await target.locator("summary").click();
    await target.getByRole("button", { name: label, exact: true }).click();
    await target.locator("dialog[open]").waitFor();
    if (configure) await configure(target);
    await target.getByRole("button", { name: "Insérer", exact: true }).click();
    await target.locator("dialog").waitFor({ state: "hidden" });
  }
  const content = () => page.evaluate(() => tinymce.get("demo-editor").getContent());
  await end();
  const beforeInsert = await content();
  await insert("Image plein écran", (bar) => bar.getByLabel("Activer le plein écran").selectOption("true"));
  assert.match(await content(), /data-prop-fullscreen="true"/);
  assert.match(await content(), /mceEditable/);
  await page.waitForFunction(() => document.activeElement === tinymce.get("demo-editor").iframeElement);
  await page.keyboard.press("ControlOrMeta+Z");
  assert.equal(await content(), beforeInsert);
  await page.keyboard.press("ControlOrMeta+Shift+Z");
  results.push("Insertion au curseur, attributs conservés, une seule annulation et rétablissement");

  await page.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    const slot = editor.getBody().querySelector('[data-component="fullimg"] [data-slot="da"]');
    editor.undoManager.transact(() => { slot.innerHTML = "<strong>© Contenu personnalisé à conserver</strong>"; });
    editor.focus(); editor.selection.select(slot, true); editor.selection.collapse(false);
  });
  await toolbar.getByRole("button", { name: "Options du composant…", exact: true }).click();
  const beforeEdit = await content();
  await toolbar.getByLabel("Activer le plein écran").selectOption("false");
  await toolbar.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await toolbar.locator("dialog").waitFor({ state: "hidden" });
  assert.match(await content(), /data-prop-fullscreen="false"/);
  assert.equal(await content(), beforeEdit.replace('data-prop-fullscreen="true"', 'data-prop-fullscreen="false"'));
  await page.waitForFunction(() => document.activeElement === tinymce.get("demo-editor").iframeElement);
  await page.keyboard.press("ControlOrMeta+Z");
  assert.equal(await content(), beforeEdit);
  results.push("Modification depuis un slot, contenu conservé, une seule annulation");

  await toolbar.getByRole("button", { name: "Options du composant…", exact: true }).click();
  await toolbar.getByLabel("Activer le plein écran").selectOption("");
  await toolbar.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await toolbar.locator("dialog").waitFor({ state: "hidden" });
  assert.doesNotMatch(await content(), /data-prop-fullscreen=/);
  results.push("Retour à la valeur par défaut par suppression de l’attribut");

  await end();
  await insert("Bouton et fenêtre modale");
  const modalPair = await page.evaluate(() => [...tinymce.get("demo-editor").getBody().querySelectorAll('[data-prop-modalid]')].map((node) => node.getAttribute("data-prop-modalid")));
  assert.equal(modalPair.length, 2);
  assert.equal(modalPair[0], modalPair[1]);
  assert.match(modalPair[0], /^[0-9a-f-]{36}$/);
  await end();
  await insert("Bouton et fenêtre modale");
  const allIds = await page.evaluate(() => [...tinymce.get("demo-editor").getBody().querySelectorAll('[data-component="modalbox"]')].map((node) => node.getAttribute("data-prop-modalid")));
  assert.equal(new Set(allIds).size, 2);
  results.push("Bouton et modale insérés ensemble, UUID partagé et unique par insertion");

  await end();
  await insert("Colonnes 1/2 – 1/2");
  assert.match(await content(), /data-component="grid"/);

  await page.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    editor.focus(); editor.selection.select(editor.getBody().querySelector('[data-slot="column1"]'), true); editor.selection.collapse(false);
  });
  await insert("Lecteur JWPlayer");
  await page.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    const nested = editor.getBody().querySelector('[data-component="grid"] [data-component="jwplayer"]');
    nested.setAttribute("data-prop-extra", "conserver");
    editor.focus(); editor.selection.select(nested.querySelector('[data-slot="copyrights"]'), true); editor.selection.collapse(false);
  });
  await toolbar.getByRole("button", { name: "Options du composant…", exact: true }).click();
  assert.deepEqual(await toolbar.getByLabel("Composant à modifier").locator("option").allTextContents(), ["jwplayer", "grid"]);
  await toolbar.getByLabel("Masquer la description").selectOption("true");
  await toolbar.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await toolbar.locator("dialog").waitFor({ state: "hidden" });
  const nestedProps = await page.evaluate(() => {
    const node = tinymce.get("demo-editor").getBody().querySelector('[data-component="grid"] [data-component="jwplayer"]');
    return [node.getAttribute("data-prop-hidedescription"), node.getAttribute("data-prop-extra")];
  });
  assert.deepEqual(nestedProps, ["true", "conserver"]);
  results.push("Composants imbriqués : choix du composant et props non exposées conservées");

  await end();
  await toolbar.locator("summary").click();
  await toolbar.getByRole("button", { name: "Activité Storyline", exact: true }).click();
  const beforeCancel = await content();
  await toolbar.getByRole("button", { name: "Annuler", exact: true }).click();
  assert.equal(await content(), beforeCancel);
  results.push("Annulation du formulaire sans mutation du document");

  // Exercise the bridge's stale-selection and structural guards without altering its implementation.
  const guards = await page.evaluate(async () => {
    const request = (op, data = {}) => new Promise((resolve) => {
      const id = crypto.randomUUID();
      const receive = (event) => {
        const response = JSON.parse(event.detail);
        if (response.id === id) { window.removeEventListener("mes-outils:tinymce:response", receive); resolve(response); }
      };
      window.addEventListener("mes-outils:tinymce:response", receive);
      window.dispatchEvent(new CustomEvent("mes-outils:tinymce:request", { detail: JSON.stringify({ id, op, ...data }) }));
    });
    const editor = tinymce.get("demo-editor");
    editor.focus(); editor.selection.select(editor.getBody().querySelector('[data-slot="column1"]'), true);
    const capture = await request("capture", { editorId: editor.id });
    const structure = await request("update", { token: capture.result.token, index: 0, props: { "data-prop-type": "triple" } });
    editor.insertContent("<p>Modification concurrente</p>");
    const stale = await request("insert", { token: capture.result.token, html: "<p>Ne doit pas apparaître</p>" });
    const forbidden = await request("update", { token: capture.result.token, index: 0, props: { onclick: "alert(1)" } });
    const inlineEditor = tinymce.get("demo-editor");
    inlineEditor.focus(); inlineEditor.selection.select(inlineEditor.getBody().querySelector('[data-component="fullimg"] [data-slot="da"]'), true); inlineEditor.selection.collapse(false);
    const inlineCapture = await request("capture", { editorId: inlineEditor.id });
    const inlineBlock = await request("insert", { token: inlineCapture.result.token, html: '<div data-component="tableau">Bloc interdit ici</div>' });
    return { structure, stale, forbidden, inlineBlock };
  });
  assert.match(guards.structure.error, /nombre de colonnes/);
  assert.match(guards.stale.error, /contenu a changé/);
  assert.match(guards.forbidden.error, /Option de composant invalide/);
  assert.match(guards.inlineBlock.error, /hors de cette zone de texte/);
  assert.doesNotMatch(await content(), /Bloc interdit ici/);
  results.push("Changement structurel, sélection périmée, attribut hors props et bloc dans un slot inline refusés");

  await page.evaluate(() => tinymce.get("demo-editor").execCommand("mceFullScreen"));
  await toolbar.waitFor({ state: "hidden" });
  await page.evaluate(() => tinymce.get("demo-editor").execCommand("mceFullScreen"));
  await toolbar.waitFor({ state: "visible" });
  await page.evaluate(() => tinymce.get("demo-editor").mode.set("readonly"));
  await toolbar.waitFor({ state: "hidden" });
  await page.evaluate(() => tinymce.get("demo-editor").mode.set("design"));
  await toolbar.waitFor({ state: "visible" });
  results.push("Menu masqué en lecture seule et en plein écran, restauré au retour");

  // Check every author snippet through the same insertion UI and TinyMCE parser.
  const beforeCatalog = await content();
  const catalogToolbar = toolbar;
  await catalogToolbar.waitFor();
  const catalogEntries = [
    ["Espace insécable", "nbsp"], ["Document Office", "artefact"], ["Document PDF", "artefact"],
    ["Boîte", "boite-sans-creator"], ["Forum", "forum"], ["Image plein écran", "fullimg"],
    ["Activité H5P", "h5p"], ["Intégration iframe", "ifram"], ["Lecteur JWPlayer", "jwplayer"],
    ["Carte de ressource", "medialink"], ["Image et texte", "mediaimage"], ["Vidéo et texte", "mediaimage"],
    ["Bouton et fenêtre modale", "modalbox"], ["Colonnes 1/3 – 2/3", "grid"], ["Colonnes 2/3 – 1/3", "grid"],
    ["Colonnes 1/2 – 1/2", "grid"], ["Trois colonnes", "grid"], ["Activité Storyline", "storyline"], ["Tableau", "tableau"],
  ];
  const snapshot = JSON.parse(await readFile(resolve(root, "catalog.generated.json"), "utf8")).components;
  for (const [label, name] of catalogEntries) {
    await page.evaluate(() => { const editor = tinymce.get("demo-editor"); editor.setContent("<p>Test du catalogue</p>"); editor.undoManager.reset(); });
    await end();
    await insert(label, undefined, catalogToolbar);
    const serialized = await content();
    assert.match(serialized, new RegExp(`data-component="${name}"`), label);
    const snippet = Object.values(snapshot).find((entry) => entry.name === name).html;
    const slots = [...snippet.matchAll(/data-slot="([^"]+)"/g)].map((match) => match[1]);
    for (const slot of slots) {
      // PDF and mediaimage variants have distinct slot sets.
      if ((label === "Document PDF" && ["gsuitelink", "o365link"].includes(slot)) || (label === "Vidéo et texte" && slot === "image")) continue;
      assert.match(serialized, new RegExp(`data-slot="${slot}"`), `${label}: slot ${slot}`);
    }
  }
  results.push("Les 19 choix du catalogue traversent le parseur TinyMCE avec leurs slots");
  await page.evaluate(() => tinymce.get("demo-editor").remove());
  await catalogToolbar.waitFor({ state: "detached" });
  await page.evaluate(async () => {
    await tinymce.init({ target: document.getElementById("demo-editor"), license_key: "gpl", menubar: false, promotion: false, height: 430 });
    Object.assign(tinymce.get("demo-editor").getBody().dataset, { celTemplate: "handlebars", celTemplateVersion: "1", celCourseCode: "HFN1O" });
  });
  await catalogToolbar.waitFor();
  assert.equal(await catalogToolbar.count(), 1);
  await page.evaluate((html) => tinymce.get("demo-editor").setContent(html), beforeCatalog);
  results.push("Éditeur supprimé puis recréé avec le même identifiant sans doublon");

  await end();
  await toolbar.locator("summary").click();
  await page.screenshot({ path: resolve(artifacts, "prototype.png"), fullPage: true });

  // Replace the remote fixture with an explicitly imported local copy.
  await options.locator(".module-details summary").click();
  options.once("dialog", (dialog) => dialog.accept());
  await options.getByRole("button", { name: "Désinstaller", exact: true }).click();
  await options.locator(".module-card").waitFor({ state: "detached" });
  assert.equal(await options.locator("#script-file").isVisible(), false);
  await options.getByText("Options avancées", { exact: true }).click();
  await options.locator("#script-file").setInputFiles(resolve(root, "composants-cel.user.js"));
  await options.locator("#prepare-local").click();
  await options.locator("#preview-page-context").waitFor({ state: "visible" });
  assert.match(await options.locator("#preview-source").textContent(), /Fichier local/);
  await options.screenshot({ path: resolve(artifacts, "import-local.png"), fullPage: true });
  await options.locator("#confirm-install").click();
  await options.locator(".module-card").waitFor();
  assert.equal(await options.locator('[data-action="check"]').count(), 0);
  const localPage = await context.newPage();
  await localPage.goto("https://cforp.desire2learn.com/prototype/?extension=1");
  await localPage.locator("[data-cel-components-toolbar]").waitFor();
  assert.equal(await localPage.evaluate(() => typeof window.__celComponentsPrototype?.stop), "function");
  // Explicit local replacement accepts unchanged @version and keeps the same card.
  await options.locator("#script-file").setInputFiles({ name: "composants-modifies.js", mimeType: "text/javascript",
    buffer: Buffer.from(source + "\nwindow.__localRevision = 2;\n") });
  await options.locator("#prepare-local").click();
  await options.locator("#replacement-note").waitFor({ state: "visible" });
  await options.locator("#confirm-install").click();
  await options.locator("#preview").waitFor({ state: "hidden" });
  assert.equal(await options.locator(".module-card").count(), 1);
  await localPage.reload();
  await localPage.waitForFunction(() => window.__localRevision === 2);
  results.push("Import avancé d’un fichier local et réimportation à version identique sans doublon");

  await options.locator('[data-action="toggle"]').uncheck();
  await options.waitForFunction(() => !document.body.hasAttribute("aria-busy"));
  const standalone = await context.newPage();
  await standalone.goto("https://cforp.desire2learn.com/prototype/?extension=1");
  await standalone.waitForFunction(() => tinymce.get().filter((editor) => editor.initialized).length === 1);
  assert.equal(await standalone.locator("[data-cel-components-toolbar]").count(), 0);
  await standalone.addScriptTag({ url: "https://cforp.desire2learn.com/prototype-console.js" });
  await standalone.locator("[data-cel-components-toolbar]").waitFor();
  await standalone.addScriptTag({ url: "https://cforp.desire2learn.com/prototype-console.js" });
  assert.equal(await standalone.locator("[data-cel-components-toolbar]").count(), 1);
  const standaloneToolbar = standalone.locator('[data-cel-editor-id="demo-editor"]');
  await standalone.evaluate(() => { const editor = tinymce.get("demo-editor"); editor.focus(); editor.selection.select(editor.getBody(), true); editor.selection.collapse(false); });
  await standaloneToolbar.locator("summary").click();
  await standaloneToolbar.getByRole("button", { name: "Image et texte", exact: true }).click();
  await standaloneToolbar.getByLabel("Position du média").selectOption("right");
  await standaloneToolbar.getByLabel("Largeur du média").selectOption("1/2");
  await standalone.screenshot({ path: resolve(artifacts, "options.png"), fullPage: true });
  await standaloneToolbar.getByRole("button", { name: "Insérer", exact: true }).click();
  await standaloneToolbar.locator("dialog").waitFor({ state: "hidden" });
  assert.match(await standalone.evaluate(() => tinymce.get("demo-editor").getContent()), /data-prop-media-position="right"/);
  await standalone.evaluate(() => window.__celComponentsPrototype.stop());
  assert.equal(await standalone.locator("[data-cel-components-toolbar]").count(), 0);
  results.push("Mode autonome : insertion avec props, double lancement sans doublon et retrait du prototype");
  assert.deepEqual(errors, []);
  await writeFile(resolve(artifacts, "results.json"), JSON.stringify({ tinymce: "8.4.0", results, errors }, null, 2));
  console.log(results.map((result) => `OK · ${result}`).join("\n"));
} catch (error) {
  console.error("Browser errors:", errors);
  console.error("Console:", consoleMessages);
  for (const page of context.pages()) if (page.url().includes("/prototype/")) {
    await page.screenshot({ path: resolve(artifacts, "failure.png"), fullPage: true }).catch(() => {});
  }
  throw error;
} finally { await context.close(); }
