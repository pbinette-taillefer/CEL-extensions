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
const source = await readFile(resolve(root, "dist/composants-cel.user.js"), "utf8");
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
    const relative = path.startsWith("/tinymce/") ? path.slice("/tinymce/".length) : path === "/prototype/" ? "demo.html"
      : path === "/editor/catalogue.json" ? "tests/fixtures/catalogue.json"
      : path === "/editor.css" ? "tests/fixtures/editor.css" : path.slice(1);
    const file = resolve(base, relative);
    if (!file.startsWith(base + "/") && !file.startsWith(base + "\\")) return route.abort();
    try {
      const types = { ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".html": "text/html", ".svg": "image/svg+xml" };
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
  await page.goto("https://cforp.desire2learn.com/prototype/");
  await page.waitForFunction(() => tinymce.get().filter((editor) => editor.initialized).length === 1);
  await page.locator("[data-cel-components-toolbar]").waitFor({ timeout: 10000 });
  const toolbar = page.locator('[data-cel-editor-id="demo-editor"]');
  assert.equal(await toolbar.count(), 1);
  assert.equal(await page.locator("[data-cel-components-toolbar]").count(), 1);
  assert.equal(await page.evaluate(() => typeof window.__celComponentsPrototype?.stop), "function", "le script est exécuté dans le contexte de la page");
  results.push("Un seul éditeur et un seul menu, avec exécution MAIN et CSP restrictive");
  const delayedPage = await context.newPage();
  await delayedPage.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector("[data-cel-components-toolbar]") || !window.__celEditorReadyAt) return;
      window.__celToolbarDelay = performance.now() - window.__celEditorReadyAt;
      observer.disconnect();
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await delayedPage.goto("https://cforp.desire2learn.com/prototype/?delayed-editor=1");
  await delayedPage.waitForFunction(() => typeof window.__celToolbarDelay === "number");
  const toolbarDelay = await delayedPage.evaluate(() => window.__celToolbarDelay);
  assert.ok(toolbarDelay < 500, `barre affichée ${Math.round(toolbarDelay)} ms après l’initialisation de TinyMCE`);
  await delayedPage.close();
  results.push(`Initialisation différée de TinyMCE : barre affichée en ${Math.round(toolbarDelay)} ms`);
  const sourceDocumentPage = await context.newPage();
  await sourceDocumentPage.goto("https://cforp.desire2learn.com/prototype/?source-document=1");
  await sourceDocumentPage.waitForFunction(() => tinymce.get("demo-editor")?.initialized);
  assert.equal(await sourceDocumentPage.evaluate(() => tinymce.get("demo-editor").getBody().hasAttribute("data-cel-template")), false,
    "TinyMCE ne reporte pas les attributs du body source sur son body interne");
  await sourceDocumentPage.locator("[data-cel-components-toolbar]").waitFor({ timeout: 10000 });
  const sourceToolbar = sourceDocumentPage.locator("[data-cel-components-toolbar]");
  await sourceToolbar.locator("summary").click();
  await sourceToolbar.getByRole("button", { name: "Image plein écran", exact: true }).click();
  await sourceToolbar.getByRole("button", { name: "Insérer", exact: true }).click();
  await sourceToolbar.locator("dialog").waitFor({ state: "hidden" });
  assert.match(await sourceDocumentPage.evaluate(() => tinymce.get("demo-editor").getContent()), /data-component="fullimg"/);
  await sourceDocumentPage.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    editor.getElement().value = '<div data-cel-template="handlebars">Composant copié</div>';
  });
  await sourceToolbar.waitFor({ state: "detached" });
  await sourceDocumentPage.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    editor.getElement().value = '<!doctype html><html><body data-cel-template="other"><p>Autre template</p></body></html>';
  });
  const sourceState = await sourceDocumentPage.evaluate(() => new Promise((resolve) => {
    const id = crypto.randomUUID();
    const receive = (event) => {
      const response = JSON.parse(event.detail);
      if (response.id === id) { window.removeEventListener("mes-outils:tinymce:response", receive); resolve(response.result); }
    };
    window.addEventListener("mes-outils:tinymce:response", receive);
    window.dispatchEvent(new CustomEvent("mes-outils:tinymce:request", { detail: JSON.stringify({ id, op: "state" }) }));
  }));
  assert.equal(sourceState.compatible, false, "un autre template dans le document source est refusé");
  await sourceDocumentPage.close();
  results.push("Document HTML complet : signature du body source reconnue sans ajout artificiel au body TinyMCE");
  assert.equal(await toolbar.locator(".badge").count(), 0);
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
  assert.equal(await probeToolbar.locator(".badge").count(), 0);
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
  const fixtureCatalog = JSON.parse(await readFile(resolve(root, "tests/fixtures/catalogue.json"), "utf8"));
  async function insert(label, configure, target = toolbar) {
    await target.locator("summary").click();
    await target.getByRole("button", { name: label, exact: true }).click();
    const entry = fixtureCatalog.entries.find((entry) => entry.label === label);
    const definition = fixtureCatalog.components.find((item) => item.name === entry?.name && item.type === entry?.type);
    if (!definition?.fields.length) {
      assert.equal(configure, undefined);
      await target.locator(".status").filter({ hasText: "Composant inséré." }).waitFor();
      assert.equal(await target.locator("dialog[open]").count(), 0);
      return;
    }
    await target.locator("dialog[open]").waitFor();
    if (configure) await configure(target);
    await target.getByRole("button", { name: "Insérer", exact: true }).click();
    await target.locator("dialog").waitFor({ state: "hidden" });
  }
  const content = () => page.evaluate(() => tinymce.get("demo-editor").getContent());
  const optionsButton = toolbar.getByRole("button", { name: "Options du composant…", exact: true });
  await optionsButton.locator(":scope:disabled").waitFor();
  await page.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    editor.setContent('<div data-component="fullimg" data-component-type="med" class="mceNonEditable"><span data-slot="da" class="mceEditable">Description</span></div><p>Après</p>');
    editor.focus();
    editor.selection.select(editor.getBody().querySelector('[data-slot="da"]'), true);
    editor.selection.collapse(false);
    editor.nodeChanged();
  });
  await optionsButton.locator(":scope:enabled").waitFor();
  await optionsButton.click();
  await toolbar.getByRole("button", { name: "Fermer", exact: true }).click();
  await end();
  await optionsButton.locator(":scope:disabled").waitFor();
  await page.evaluate(() => tinymce.get("demo-editor").setContent('<p>Placez le curseur ici pour insérer un composant.</p>'));
  results.push("Options désactivé hors composant, activé dans un slot et désactivé en quittant le composant; repère CEL retiré");
  await end();
  await toolbar.locator("summary").focus();
  await page.keyboard.press("Enter");
  const search = toolbar.getByRole("searchbox", { name: "Rechercher un composant" });
  await search.fill("ECRAN");
  assert.deepEqual(await toolbar.locator(".menu-list button[data-entry]:visible").allTextContents(), ["Image plein écran"]);
  await search.fill("introuvable");
  await toolbar.getByText("Aucun composant trouvé.", { exact: true }).waitFor();
  await search.fill("image");
  await search.press("ArrowDown");
  assert.equal(await toolbar.locator(".menu-list button:visible").first().evaluate((node) => node === node.getRootNode().activeElement), true);
  await page.keyboard.press("Escape");
  await toolbar.locator('summary[aria-expanded="false"]').waitFor();
  assert.equal(await toolbar.locator("summary").getAttribute("aria-expanded"), "false");
  assert.equal(await toolbar.locator("summary").evaluate((node) => node === node.getRootNode().activeElement), true);
  await toolbar.locator("summary").click();
  assert.equal(await search.inputValue(), "");
  await page.screenshot({ path: resolve(artifacts, "menu.png"), fullPage: true });
  await page.locator("h1").click();
  await toolbar.locator("details:not([open])").waitFor();
  await page.setViewportSize({ width: 320, height: 740 });
  await toolbar.locator("summary").click();
  const bounds = await toolbar.locator(".menu").boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 320, "menu contenu dans une fenêtre de 320 px");
  await page.screenshot({ path: resolve(artifacts, "menu-mobile.png"), fullPage: true });
  await toolbar.getByRole("button", { name: "Image plein écran", exact: true }).click();
  const dialogBounds = await toolbar.locator("dialog").boundingBox();
  assert.ok(dialogBounds.x >= 0 && dialogBounds.x + dialogBounds.width <= 320);
  await page.screenshot({ path: resolve(artifacts, "dialog-mobile.png"), fullPage: true });
  await toolbar.getByRole("button", { name: "Fermer", exact: true }).click();
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.screenshot({ path: resolve(artifacts, "toolbar.png"), fullPage: true });
  results.push("Interface compacte : recherche sans accents, état vide, navigation au clavier, Échap, clic extérieur et affichage à 320 px");
  const favoritePage = await context.newPage();
  await favoritePage.goto("https://cforp.desire2learn.com/prototype/");
  const favoriteToolbar = favoritePage.locator('[data-cel-editor-id="demo-editor"]');
  const shortcuts = favoriteToolbar.getByRole("group", { name: "Composants favoris", exact: true });
  await favoriteToolbar.locator("summary").click();
  const beforePin = await favoritePage.evaluate(() => tinymce.get("demo-editor").getContent());
  await favoriteToolbar.getByRole("button", { name: "Ajouter aux favoris : Boîte", exact: true }).click();
  await shortcuts.getByRole("button", { name: "Boîte", exact: true }).waitFor();
  assert.equal(await favoriteToolbar.getByRole("button", { name: "Retirer des favoris : Boîte", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await favoritePage.evaluate(() => tinymce.get("demo-editor").getContent()), beforePin);
  await favoriteToolbar.getByRole("searchbox").fill("plein ecran");
  await favoriteToolbar.getByRole("button", { name: "Ajouter aux favoris : Image plein écran", exact: true }).click();
  await favoritePage.reload();
  await shortcuts.getByRole("button", { name: "Boîte", exact: true }).waitFor();
  await shortcuts.getByRole("button", { name: "Image plein écran", exact: true }).waitFor();
  await favoritePage.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    editor.focus(); editor.selection.select(editor.getBody(), true); editor.selection.collapse(false);
  });
  await shortcuts.getByRole("button", { name: "Boîte", exact: true }).click();
  await favoriteToolbar.locator(".status").filter({ hasText: "Composant inséré." }).waitFor();
  assert.equal(await favoriteToolbar.locator("dialog[open]").count(), 0);
  assert.match(await favoritePage.evaluate(() => tinymce.get("demo-editor").getContent()), /data-component="boite-sans-creator"/);
  await favoritePage.waitForFunction(() => document.activeElement === tinymce.get("demo-editor").iframeElement);
  await favoritePage.keyboard.press("ControlOrMeta+Z");
  assert.equal(await favoritePage.evaluate(() => tinymce.get("demo-editor").getContent()), beforePin);
  await shortcuts.getByRole("button", { name: "Image plein écran", exact: true }).click();
  await favoriteToolbar.locator("dialog[open]").waitFor();
  await favoriteToolbar.getByRole("button", { name: "Annuler", exact: true }).click();
  await favoritePage.waitForFunction(() => {
    const root = document.querySelector('[data-cel-components-toolbar]').shadowRoot;
    return !!root.activeElement?.closest(".favorites");
  });
  await favoritePage.setViewportSize({ width: 320, height: 740 });
  const favoriteBounds = await shortcuts.boundingBox();
  assert.ok(favoriteBounds.x >= 0 && favoriteBounds.x + favoriteBounds.width <= 320);
  await favoritePage.screenshot({ path: resolve(artifacts, "favorites-mobile.png"), fullPage: true });
  await favoritePage.setViewportSize({ width: 1280, height: 1000 });
  await favoritePage.screenshot({ path: resolve(artifacts, "favorites.png"), fullPage: true });
  await favoriteToolbar.locator("summary").click();
  await favoriteToolbar.getByRole("button", { name: "Retirer des favoris : Boîte", exact: true }).focus();
  await favoritePage.keyboard.press("Space");
  await shortcuts.getByRole("button", { name: "Boîte", exact: true }).waitFor({ state: "detached" });
  await favoriteToolbar.getByRole("button", { name: "Retirer des favoris : Image plein écran", exact: true }).click();
  await shortcuts.waitFor({ state: "hidden" });
  await favoritePage.reload();
  await favoriteToolbar.locator("summary").waitFor();
  await shortcuts.waitFor({ state: "hidden" });
  await favoritePage.close();
  results.push("Favoris : ajout et retrait sans mutation, persistance, raccourcis directs et configurables, Ctrl+Z, focus clavier et affichage à 320 px");
  const selectionPage = await context.newPage();
  await selectionPage.goto("https://cforp.desire2learn.com/prototype/");
  const selectionToolbar = selectionPage.locator('[data-cel-editor-id="demo-editor"]');
  await selectionToolbar.locator("summary").waitFor();
  for (const scenario of ["texte", "plusieurs paragraphes à rebours", "composant entier"]) {
    const original = await selectionPage.evaluate((scenario) => {
      const editor = tinymce.get("demo-editor");
      editor.setContent(scenario === "texte" ? '<p>Avant <strong>Texte sélectionné</strong> après</p>'
        : scenario === "composant entier" ? '<p>Avant</p><div data-component="grid" data-component-type="med" class="mceNonEditable"><div data-slot="column1" class="mceEditable"><p>Contenu existant</p></div></div><p>Après</p>'
        : '<p>Avant <strong>Premier texte</strong></p><p><em>Deuxième texte</em> après</p>');
      editor.undoManager.reset();
      editor.focus();
      const body = editor.getBody();
      if (scenario === "composant entier") editor.selection.select(body.querySelector('[data-component="grid"]'));
      else {
        const start = body.querySelector("strong").firstChild;
        const finish = scenario === "texte" ? start : body.querySelector("em").firstChild;
        editor.getWin().getSelection().setBaseAndExtent(finish, finish.length, start, 0);
      }
      const html = editor.getContent();
      const savedBody = new DOMParser().parseFromString(html, "text/html").body;
      return { html, text: savedBody.textContent,
        component: savedBody.querySelector('[data-component="grid"]')?.outerHTML };
    }, scenario);
    await selectionToolbar.locator("summary").click();
    const selectionSearch = selectionToolbar.getByRole("searchbox");
    await selectionSearch.fill("plein ecran");
    await selectionSearch.press("Enter");
    await selectionToolbar.getByRole("button", { name: "Insérer", exact: true }).click();
    await selectionToolbar.locator("dialog").waitFor({ state: "hidden" });
    const inserted = await selectionPage.evaluate(() => {
      const editor = tinymce.get("demo-editor");
      const body = new DOMParser().parseFromString(editor.getContent(), "text/html").body;
      const component = body.querySelector('[data-component="fullimg"]');
      const prefix = body.ownerDocument.createRange();
      prefix.selectNodeContents(body);
      prefix.setEndBefore(component);
      const before = prefix.toString();
      component.remove();
      return { before, text: body.textContent,
        component: body.querySelector('[data-component="grid"]')?.outerHTML };
    });
    const normalizeSpace = (text) => text.replace(/\s+/g, " ").trim();
    assert.equal(normalizeSpace(inserted.text), normalizeSpace(original.text), `${scenario} : contenu sélectionné conservé`);
    assert.equal(normalizeSpace(inserted.before), "Avant", `${scenario} : insertion au début de la sélection`);
    assert.equal(inserted.component, original.component, `${scenario} : composant existant intact`);
    await selectionPage.waitForFunction(() => document.activeElement === tinymce.get("demo-editor").iframeElement);
    await selectionPage.keyboard.press("ControlOrMeta+Z");
    assert.equal(await selectionPage.evaluate(() => tinymce.get("demo-editor").getContent()), original.html, `${scenario} : annulation en une étape`);
    await selectionPage.keyboard.press("ControlOrMeta+Shift+Z");
    assert.equal(await selectionPage.evaluate(() => !!tinymce.get("demo-editor").getBody().querySelector('[data-component="fullimg"]')), true);
  }
  const beforeDirect = await selectionPage.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    editor.setContent('<p>Avant <strong>Texte sélectionné</strong> après</p>');
    editor.undoManager.reset();
    editor.focus();
    editor.selection.select(editor.getBody().querySelector("strong"), true);
    return editor.getContent();
  });
  await insert("Boîte", undefined, selectionToolbar);
  assert.match(await selectionPage.evaluate(() => tinymce.get("demo-editor").getContent()), /data-component="boite-sans-creator"/);
  assert.equal(await selectionPage.evaluate(() => tinymce.get("demo-editor").getBody().lastElementChild.querySelector("strong")?.textContent), "Texte sélectionné");
  await selectionPage.waitForFunction(() => document.activeElement === tinymce.get("demo-editor").iframeElement);
  await selectionPage.keyboard.press("ControlOrMeta+Z");
  assert.equal(await selectionPage.evaluate(() => tinymce.get("demo-editor").getContent()), beforeDirect);
  await insert("Boîte", undefined, selectionToolbar);
  await selectionPage.close();
  results.push("Composant sans options : insertion directe sans fenêtre, sélection conservée, Ctrl+Z et nouvelle insertion");
  results.push("Insertion avant la sélection : texte, plusieurs paragraphes à rebours et composant entier conservés, annulation et rétablissement");
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
  assert.deepEqual(await toolbar.getByLabel("Composant à modifier").locator("option").allTextContents(), ["Lecteur JWPlayer", "Colonnes 1/3 – 2/3"]);
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
  const snapshot = JSON.parse(await readFile(resolve(root, "tests/fixtures/catalogue.json"), "utf8")).entries;
  for (const [label, name] of catalogEntries) {
    await page.evaluate(() => { const editor = tinymce.get("demo-editor"); editor.setContent("<p>Test du catalogue</p>"); editor.undoManager.reset(); });
    await end();
    await insert(label, undefined, catalogToolbar);
    const serialized = await content();
    assert.match(serialized, new RegExp(`data-component="${name}"`), label);
    const snippet = snapshot.find((entry) => entry.label === label).html;
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
  await options.locator("#script-file").setInputFiles(resolve(root, "dist/composants-cel.user.js"));
  await options.locator("#prepare-local").click();
  await options.locator("#preview-page-context").waitFor({ state: "visible" });
  assert.match(await options.locator("#preview-source").textContent(), /Fichier local/);
  await options.screenshot({ path: resolve(artifacts, "import-local.png"), fullPage: true });
  await options.locator("#confirm-install").click();
  await options.locator(".module-card").waitFor();
  assert.equal(await options.locator('[data-action="check"]').count(), 0);
  const localPage = await context.newPage();
  await localPage.goto("https://cforp.desire2learn.com/prototype/");
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

  const coursePage = await context.newPage();
  await coursePage.goto("https://cforp.desire2learn.com/prototype/");
  await coursePage.locator("[data-cel-components-toolbar]").waitFor();
  assert.equal(await coursePage.evaluate(() => window.__localRevision), 2, "la copie installée est exécutée par Mes outils");
  const mediaToolbar = coursePage.locator('[data-cel-editor-id="demo-editor"]');
  await coursePage.evaluate(() => { const editor = tinymce.get("demo-editor"); editor.focus(); editor.selection.select(editor.getBody(), true); editor.selection.collapse(false); });
  await mediaToolbar.locator("summary").click();
  await mediaToolbar.getByRole("button", { name: "Image et texte", exact: true }).click();
  await mediaToolbar.getByLabel("Position du média").selectOption("right");
  await mediaToolbar.getByLabel("Largeur du média").selectOption("1/2");
  await coursePage.screenshot({ path: resolve(artifacts, "options.png"), fullPage: true });
  await mediaToolbar.getByRole("button", { name: "Insérer", exact: true }).click();
  await mediaToolbar.locator("dialog").waitFor({ state: "hidden" });
  assert.match(await coursePage.evaluate(() => tinymce.get("demo-editor").getContent()), /data-prop-media-position="right"/);
  results.push("Insertion des médias avec options depuis la copie locale installée dans Mes outils");
  // La même copie du script doit suivre le cours, y compris sur une navigation sans rechargement.
  const courseCatalog = structuredClone(JSON.parse(await readFile(resolve(root, "tests/fixtures/catalogue.json"), "utf8")));
  courseCatalog.entries = courseCatalog.entries.filter((entry) => entry.id !== "med-fullimg");
  courseCatalog.components.push({ type: "site", name: "course-note", label: "Note du cours", fields: [
    { attribute: "data-prop-tone", label: "Ton du cours", type: "select", options: [["info", "Information"], ["warning", "Attention"]] },
  ] });
  courseCatalog.entries.push({ id: "site-course-note", label: "Note du cours", type: "site", name: "course-note",
    html: '<div data-component="course-note" class="mceNonEditable"><div data-slot="default" class="mceEditable"><p>Texte du cours</p></div></div>' });
  const fetchedCatalogs = [];
  let missingCatalog = false;
  await context.route("**/d2l/api/lp/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({ json: path.endsWith("/versions/") ? { LatestVersion: "1.60" }
      : { Path: `/content/enforced/${path.endsWith("/123") ? "123-alpha" : "456-beta"}/` } });
  });
  await context.route("**/content/enforced/*/editor/catalogue.json", async (route) => {
    fetchedCatalogs.push(route.request().url());
    await route.fulfill(missingCatalog ? { status: 404, body: "Missing catalog" }
      : { json: route.request().url().includes("123-alpha") ? courseCatalog : { ...courseCatalog, entries: [] } });
  });
  await mediaToolbar.locator("summary").click();
  await mediaToolbar.getByRole("button", { name: "Ajouter aux favoris : Image plein écran", exact: true }).click();
  await mediaToolbar.locator(".favorites").getByRole("button", { name: "Image plein écran", exact: true }).waitFor();
  await coursePage.evaluate(() => history.pushState({}, "", "/d2l/le/content/123/EditFile"));
  const courseToolbar = coursePage.locator('[data-cel-editor-id="demo-editor"]');
  await courseToolbar.waitFor();
  await coursePage.waitForFunction(() => document.querySelector('[data-cel-components-toolbar]')?.shadowRoot.textContent.includes("Note du cours"));
  await courseToolbar.locator("summary").click();
  await courseToolbar.getByRole("button", { name: "Note du cours", exact: true }).waitFor();
  assert.equal(await courseToolbar.getByRole("button", { name: "Image plein écran", exact: true }).count(), 0);
  await courseToolbar.getByRole("button", { name: "Note du cours", exact: true }).click();
  await courseToolbar.getByLabel("Ton du cours").selectOption("warning");
  await courseToolbar.getByRole("button", { name: "Insérer", exact: true }).click();
  await courseToolbar.locator("dialog").waitFor({ state: "hidden" });
  assert.match(await coursePage.evaluate(() => tinymce.get("demo-editor").getContent()), /data-prop-tone="warning"/);
  await coursePage.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    editor.selection.select(editor.getBody().querySelector('[data-component="course-note"] p'), true);
    editor.selection.collapse(false);
  });
  await courseToolbar.getByRole("button", { name: "Options du composant…", exact: true }).click();
  await courseToolbar.getByLabel("Ton du cours").selectOption("info");
  await courseToolbar.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await courseToolbar.locator("dialog").waitFor({ state: "hidden" });
  assert.match(await coursePage.evaluate(() => tinymce.get("demo-editor").getContent()), /data-prop-tone="info"/);
  results.push("Catalogue du cours par API D2L : choix retiré, nouveau composant site et options propres au cours");
  await coursePage.evaluate(() => {
    const editor = tinymce.get("demo-editor");
    editor.setContent('<div data-component="fullimg" data-component-type="med" class="mceNonEditable"><span data-slot="image" class="mceEditable">Image existante</span></div>');
    editor.selection.select(editor.getBody().querySelector('[data-slot="image"]'), true);
    editor.selection.collapse(false);
  });
  await courseToolbar.getByRole("button", { name: "Options du composant…", exact: true }).click();
  await courseToolbar.getByLabel("Activer le plein écran").selectOption("true");
  await courseToolbar.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await courseToolbar.locator("dialog").waitFor({ state: "hidden" });
  assert.match(await coursePage.evaluate(() => tinymce.get("demo-editor").getContent()), /Image existante/);
  results.push("Composant retiré du menu : options et contenu des anciennes instances conservés");
  await coursePage.evaluate(() => history.pushState({}, "", "/d2l/le/lessons/456/topics/999"));
  await courseToolbar.locator("summary").waitFor();
  await coursePage.waitForFunction(() => document.querySelector('[data-cel-components-toolbar]')?.shadowRoot.textContent.includes("Aucun composant proposé"));
  assert.equal(await courseToolbar.getByRole("button", { name: "Note du cours", exact: true }).count(), 0);
  assert.ok(fetchedCatalogs.some((url) => url.includes("123-alpha")) && fetchedCatalogs.some((url) => url.includes("456-beta")));
  results.push("Changement de cours sans rechargement : catalogue vide respecté et aucun mélange de cours");
  missingCatalog = true;
  await coursePage.goto("https://cforp.desire2learn.com/prototype/?ou=456");
  await coursePage.waitForFunction(() => document.querySelector('[data-cel-components-toolbar]')?.shadowRoot.textContent.includes("Chargement impossible (404)"));
  await courseToolbar.locator("summary").click();
  missingCatalog = false;
  await courseToolbar.getByRole("button", { name: "Réessayer le chargement", exact: true }).click();
  await coursePage.waitForFunction(() => document.querySelector('[data-cel-components-toolbar]')?.shadowRoot.textContent.includes("Aucun composant proposé"));
  results.push("Catalogue absent : erreur visible, aucune liste de secours et nouvelle tentative possible");
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
