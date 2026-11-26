// Smoke check of the built template catalog: shared JSON, preview, options and clipboard.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const workspace = fileURLToPath(new URL("../../../../", import.meta.url));
const templateRoot = process.argv[2] || path.resolve(workspace, "../cel-template-handlebar/dist");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(workspace, "cq-tool/node_modules/playwright"));
const server = createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
  const reference = relative.startsWith("reference/") && process.argv[4];
  const base = reference ? process.argv[4] : templateRoot;
  const file = path.resolve(base, reference ? relative.slice("reference/".length) : relative);
  if (!file.startsWith(path.resolve(base) + path.sep)) { response.writeHead(400).end(); return; }
  try {
    // Certains hébergeurs D2L servent les .mjs comme fichiers binaires.
    const types = { ".js": "text/javascript", ".html": "text/html", ".css": "text/css", ".json": "application/json" };
    response.writeHead(200, { "content-type": types[path.extname(file)] || "application/octet-stream" });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end("Not found"); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ ...(process.argv[3] ? { executablePath: process.argv[3] } : {}), headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 960 }, permissions: ["clipboard-read", "clipboard-write"] });
  await context.route("**/*", async (route) => {
    if (route.request().url().startsWith(origin) || route.request().url().startsWith("about:")) return route.continue();
    // No external account or third-party network is used by this check.
    return route.fulfill({ body: "", contentType: "text/javascript" });
  });
  const page = await context.newPage();
  const errors = [];
  const moduleRequests = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url().startsWith(origin) && request.resourceType() === "script") moduleRequests.push(request.url());
  });
  await page.goto(`${origin}/template/components.html`);
  await page.getByRole("heading", { name: "Composants MED", exact: true }).waitFor({ state: "visible", timeout: 5000 });
  await page.locator("html[data-components-mounted]").waitFor({ timeout: 15000 });
  assert.equal(await page.locator("[data-catalog-entries] > section").count(), 15);
  assert.equal(await page.locator("[data-catalog-nav] a").count(), 15);
  assert.equal(await page.locator("[data-copy-component]").count(), 20);
  assert.equal(await page.locator("#med-grid article").count(), 4);
  assert.equal(await page.locator("#med-mediaimage article").count(), 2);
  assert.equal(await page.locator('a[href="#catalogue-top"]').count(), 15);
  assert.ok((await page.locator("#med-fullimg").getAttribute("class")).includes("rounded-3xl"));
  const artifacts = path.join(workspace, "mes-outils/.artifacts/composants-prototype");
  await mkdir(artifacts, { recursive: true });
  await page.screenshot({ path: path.join(artifacts, "catalogue-restored.png"), fullPage: false });
  if (process.argv[4]) {
    const baseline = await context.newPage();
    await baseline.goto(`${origin}/reference/components.html`);
    await baseline.locator("html[data-components-mounted]").waitFor({ timeout: 15000 });
    await baseline.screenshot({ path: path.join(artifacts, "catalogue-before.png"), fullPage: false });
    const layout = () => ["header", "nav", ...[...document.querySelectorAll("main > div > section")].map((node) => `#${node.id}`)].map((selector) => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      return { selector, x: rect.x, y: rect.y, width: rect.width, height: rect.height, className: node.className };
    });
    assert.deepEqual(await page.evaluate(layout), await baseline.evaluate(layout), "géométrie et classes identiques à l’ancien catalogue");
    await baseline.close();
  }
  await page.locator('#med-artefact a[href="#med-artefact-pdf"]').click();
  await page.waitForFunction(() => location.hash === "#med-artefact-pdf");
  const copy = async (key) => {
    const button = page.locator(`[data-copy-component="${key}"]`);
    await button.click();
    await page.waitForFunction((key) => {
      const button = document.querySelector(`[data-copy-component="${key}"]`);
      return button.textContent.includes("Copié") || button.dataset.copyComplete === "true";
    }, key);
    return page.evaluate(() => navigator.clipboard.readText());
  };
  const image = page.locator("#med-fullimg");
  const imageHtml = await copy("med-fullimg");
  assert.match(imageHtml, /data-component="fullimg"/);
  assert.ok(!imageHtml.includes("data-copy-source"));
  await page.locator("[data-copy-text]").click();
  await page.waitForFunction(() => document.querySelector("[data-copy-text]").textContent.includes("Copié"));
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "\u00a0");

  const modal = page.locator("#med-modal");
  const firstId = await modal.locator("[data-modal-id]").textContent();
  assert.ok(firstId);
  for (const key of ["med-modalbtn", "med-modalbox"]) {
    const html = await copy(key);
    assert.match(html, new RegExp(`data-prop-modalid="${firstId}"`));
    assert.match(html, new RegExp(`data-component="${key.slice(4)}"`));
    assert.equal(await page.locator(`[data-copy-component="${key}"]`).getAttribute("data-copy-complete"), "true");
  }
  assert.match(await copy("med-modalbtn"), new RegExp(`data-prop-modalid="${firstId}"`), "une recopie conserve l’UUID partagé");
  await modal.getByRole("button", { name: "Générer un nouvel UUID", exact: true }).click();
  const nextId = await modal.locator("[data-modal-id]").textContent();
  assert.notEqual(nextId, firstId);
  assert.equal(await modal.locator("[commandfor]").getAttribute("commandfor"), nextId);
  assert.equal(await modal.locator("dialog").getAttribute("id"), nextId);
  assert.equal(await page.locator('[data-copy-component="med-modalbtn"]').getAttribute("data-copy-complete"), null);
  await modal.locator("[commandfor]").click();
  await modal.locator("dialog[open]").waitFor({ state: "visible" });
  await page.keyboard.press("Escape");
  await modal.locator("dialog").waitFor({ state: "hidden" });
  for (const key of ["med-modalbtn", "med-modalbox"]) {
    assert.match(await copy(key), new RegExp(`data-prop-modalid="${nextId}"`));
  }
  await modal.getByRole("link", { name: "Retour en haut" }).click();
  await page.waitForFunction(() => scrollY < 10);

  const media = page.locator("#med-mediaimage");
  await media.getByLabel("Position du média").selectOption("right");
  await media.getByLabel("Largeur du média").selectOption("1/2");
  for (const key of ["med-mediaimage-image", "med-mediaimage-video"]) {
    const html = await copy(key);
    assert.match(html, /data-prop-media-position="right"/);
    assert.match(html, /data-prop-media-size="1\/2"/);
  }
  assert.equal(await media.locator(".d2l-cplus-layout-half").count(), 2);
  const mediaColumn = await media.locator("article").first().locator(".d2l-cplus-layout-column").last().locator("[data-fullimg-image]").count();
  assert.equal(mediaColumn, 1, "le média est déplacé à droite dans l’aperçu");
  for (const type of ["left", "right", "equal", "triple"]) {
    const html = await copy(`med-grid-${type}`);
    assert.match(html, new RegExp(`data-prop-type="${type}"`));
    assert.equal([...html.matchAll(/data-slot="column\d"/g)].length, type === "triple" ? 3 : 2);
  }
  await page.setViewportSize({ width: 320, height: 900 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "catalogue sans débordement à 320 px");
  await page.setViewportSize({ width: 1280, height: 960 });

  const catalog = JSON.parse(await readFile(path.join(templateRoot, "editor/catalogue.json"), "utf8"));
  const custom = { ...catalog.entries.find((entry) => entry.id === "med-fullimg"), id: "course-image", label: "Image propre au cours" };
  delete custom.catalogue;
  catalog.entries = catalog.entries.filter((entry) => !["med-fullimg", "med-h5p", "med-grid-left", "med-mediaimage-image"].includes(entry.id));
  catalog.entries.push(custom);
  let missing = false;
  await page.route("**/editor/catalogue.json", (route) => route.fulfill(missing ? { status: 404, body: "Missing" } : { json: catalog }));
  await page.reload();
  await page.getByRole("heading", { name: "Image propre au cours", exact: true }).waitFor({ state: "visible", timeout: 5000 });
  assert.equal(await page.locator("#med-fullimg, #med-h5p").count(), 0);
  assert.equal(await page.locator("#med-grid article").count(), 3);
  assert.equal(await page.locator("#med-mediaimage article").count(), 1);
  assert.equal(await page.locator('[data-copy-component="med-mediaimage-image"]').count(), 0);
  assert.match(await copy("course-image"), /data-component="fullimg"/);
  missing = true;
  await page.reload();
  await page.getByRole("alert").waitFor({ state: "visible", timeout: 5000 });
  assert.match(await page.getByRole("alert").textContent(), /404/);
  assert.deepEqual(errors, []);
  assert.ok(moduleRequests.some((url) => new URL(url).pathname.endsWith("/catalogue-model.js")));
  assert.ok(moduleRequests.every((url) => !new URL(url).pathname.endsWith(".mjs")), "aucun module .mjs demandé au serveur D2L");
  console.log("OK · Design historique, 15 sections, 20 copies, UUID explicite et partagé, ouverture de modale, copie Creator+, médias synchronisés, 4 grilles, liens et retours en haut, JSON personnalisé et MIME D2L.");
} finally { await browser.close(); server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
