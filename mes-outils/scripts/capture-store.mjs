// Capture the real extension UI in a separate profile, using demonstration tools.
// Usage: node scripts/capture-store.mjs PATH_TO_PLAYWRIGHT_CORE PATH_TO_CHROMIUM
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const [, , playwrightPath, executablePath] = process.argv;
if (!playwrightPath || !executablePath) throw new Error("Usage: node scripts/capture-store.mjs PATH_TO_PLAYWRIGHT_CORE PATH_TO_CHROMIUM");
const { chromium } = createRequire(import.meta.url)(resolve(playwrightPath));
const output = resolve("publication/visuels");
await mkdir(output, { recursive: true });
const extension = resolve("dist/chrome");
const context = await chromium.launchPersistentContext(resolve(`.artifacts/store-captures/profile-${Date.now()}`), {
  executablePath, headless: true, viewport: { width: 1280, height: 800 }, locale: "fr-CA",
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--lang=fr"],
});
const errors = [];
context.on("weberror", (error) => errors.push(String(error.error())));
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const extensionId = new URL(worker.url()).hostname;
  const settings = await context.newPage();
  await settings.goto(`chrome://extensions/?id=${extensionId}`);
  const allow = settings.locator("#allow-user-scripts cr-toggle");
  await allow.waitFor();
  if (!(await allow.evaluate((node) => node.checked))) await allow.click();
  await settings.evaluate(async (id) => {
    for (const origin of ["https://demo.example.test/*", "https://cforp.desire2learn.com/*"])
      await chrome.developerPrivate.addHostPermission(id, origin);
  }, extensionId);
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options.html`);
  await page.waitForFunction(() => document.getElementById("permission-help").hidden);
  const tool = resolve("../scripts/d2l/composants/composants-cel.user.js");
  await page.locator("#advanced-options summary").click();
  await page.locator("#script-file").setInputFiles(tool);
  await page.locator("#prepare-local").click();
  await page.locator("#preview").waitFor({ state: "visible" });
  // The advanced selector before confirmation is a genuine user-facing UI state.
  await page.locator("#cancel-install").click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, "capture-import-local-0.2.0.png"), type: "png" });
  await page.locator("#prepare-local").click();
  await page.locator("#preview").waitFor({ state: "visible" });
  await page.locator("#advanced-options summary").click();
  // Show the preview at the same scroll position a user can reach normally.
  await page.locator("#preview-name").scrollIntoViewIfNeeded();
  await page.locator("#confirm-install").scrollIntoViewIfNeeded();
  await page.screenshot({ path: resolve(output, "capture-apercu-0.2.0.png"), type: "png" });
  await page.locator("#confirm-install").click();
  await page.locator(".module-card").waitFor();
  const demoCode = await readFile("publication/demo/outil.js", "utf8");
  await worker.evaluate((code) => {
    globalThis.fetch = async (url) => {
      if (String(url) !== "https://demo.example.test/mes-outils/demo/outil.js") throw new Error("Unexpected demonstration URL");
      return new Response(code, { status: 200 });
    };
  }, demoCode);
  await page.locator("#script-url").fill("https://demo.example.test/mes-outils/demo/outil.js");
  await page.locator("#prepare").click();
  await page.locator("#preview").waitFor({ state: "visible" });
  await page.locator("#confirm-install").click();
  await page.locator(".module-card").nth(1).waitFor();
  await page.reload();
  await page.locator(".module-card").nth(1).waitFor();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: resolve(output, "capture-gestion-0.2.0.png"), type: "png" });
  assert.deepEqual(errors, []);
  console.log("Trois captures de l’interface réelle 0.2.0 créées en 1280 × 800 : " + output);
} finally { await context.close(); }
