// Optional integration check. Uses an existing Playwright Core installation and an isolated profile.
// Usage: node scripts/browser-smoke.mjs PATH_TO_PLAYWRIGHT_CORE chrome|edge PATH_TO_BROWSER
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const [, , playwrightPath, target = "chrome", executablePath] = process.argv;
if (!playwrightPath || !["chrome", "edge"].includes(target) || !executablePath) {
  throw new Error("Usage: node scripts/browser-smoke.mjs PATH_TO_PLAYWRIGHT_CORE chrome|edge PATH_TO_BROWSER");
}
const { chromium } = createRequire(import.meta.url)(resolve(playwrightPath));
const extension = resolve(`dist/${target}`);
const artifacts = resolve(`.artifacts/browser-checks/${target}-${Date.now()}`);
await mkdir(artifacts, { recursive: true });
const source = await readFile(new URL("../publication/demo/outil.js", import.meta.url), "utf8");
const nextSource = await readFile(new URL("../publication/demo/outil-v2.js", import.meta.url), "utf8");
const demoHtml = await readFile(new URL("../publication/demo/index.html", import.meta.url), "utf8");
const demoCss = await readFile(new URL("../publication/demo/style.css", import.meta.url), "utf8");
const context = await chromium.launchPersistentContext(resolve(artifacts, "profile"), {
  executablePath, headless: true, viewport: { width: 1280, height: 800 },
  ignoreDefaultArgs: ["--disable-extensions"],
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`, "--lang=en-US"],
});
const errors = [];
context.on("weberror", (error) => errors.push(String(error.error())));
const results = [];
try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const id = new URL(worker.url()).hostname;
  const settings = await context.newPage();
  await settings.goto(`${target}://extensions/?id=${id}`);
  const allow = target === "edge"
    ? settings.locator("standard-row").filter({ has: settings.getByText("Allow User Scripts", { exact: true }) }).locator("fluent-switch")
    : settings.locator("#allow-user-scripts cr-toggle");
  await allow.waitFor();
  if (!(await allow.evaluate((node) => node.checked))) await allow.click();
  results.push("User Scripts toggle enabled in browser settings");
  // Grant only the fixture origin in this isolated profile. Native host-permission prompts
  // remain a separate manual check; the extension's request calls are not replaced.
  await settings.evaluate(async (extensionId) => {
    await chrome.developerPrivate.addHostPermission(extensionId, "https://demo.example.test/*");
  }, id);
  await context.route("https://demo.example.test/**", async (route) => {
    const css = route.request().url().endsWith("style.css");
    await route.fulfill({ contentType: css ? "text/css" : "text/html", body: css ? demoCss : demoHtml });
  });
  // Simulate only the CDN response, keeping production parsing, hashing and manager code.
  await worker.evaluate((code) => {
    globalThis.__demoCode = code;
    globalThis.fetch = async (input) => {
      if (String(input) !== "https://demo.example.test/mes-outils/demo/outil.js") throw new Error("Unexpected fixture request");
      return new Response(globalThis.__demoCode, { status: 200 });
    };
  }, source);
  const options = await context.newPage();
  await options.goto(`chrome-extension://${id}/options.html`);
  await options.waitForFunction(() => document.getElementById("permission-help").hidden);
  await options.locator("#script-url").fill("https://demo.example.test/mes-outils/demo/outil.js");
  await worker.evaluate((code) => { globalThis.__demoCode = code; }, source.replace("@run-at document-idle", "@run-at document-start"));
  await options.locator("#prepare").click();
  await options.locator('#notice[data-error="true"]').filter({ hasText: "Seul @run-at document-idle" }).waitFor();
  assert.equal(await options.locator("#preview").isVisible(), false);
  results.push("Unsupported document-start rejected before installation");
  await worker.evaluate((code) => { globalThis.__demoCode = code; }, source);
  await options.waitForFunction(() => !document.body.hasAttribute("aria-busy"));
  await options.locator("#prepare").click();
  await options.locator("#preview").waitFor({ state: "visible" });
  await options.locator("#confirm-install").click();
  await options.locator(".module-card").waitFor();
  await options.waitForFunction(() => !document.body.hasAttribute("aria-busy"));
  await options.screenshot({ path: resolve(artifacts, "capture-gestion.png") });
  const demo = await context.newPage();
  await demo.goto("https://demo.example.test/mes-outils/demo/index.html");
  await demo.getByText("Mes outils fonctionne · version 1.0.0", { exact: true }).waitFor();
  results.push("Preview, confirmation and real userScripts injection passed");
  await worker.evaluate((code) => { globalThis.__demoCode = code; }, nextSource);
  await options.locator('[data-action="check"]').click();
  await options.getByRole("button", { name: "Installer la version 1.0.1 de Démonstration Mes outils", exact: true }).waitFor();
  await demo.reload();
  await demo.getByText("Mes outils fonctionne · version 1.0.0", { exact: true }).waitFor();
  await options.locator('[data-action="approveUpdate"]').click();
  await options.waitForFunction(() => !document.querySelector(".update-panel"));
  await demo.reload();
  await demo.getByText("Mes outils fonctionne · version 1.0.1", { exact: true }).waitFor();
  results.push("Downloaded update stayed pending; approval installed the exact version");
  await options.locator('[data-action="toggle"]').uncheck();
  await options.waitForFunction(() => !document.body.hasAttribute("aria-busy"));
  await demo.reload();
  assert.equal(await demo.locator("#mes-outils-demo").count(), 0);
  await options.locator('[data-action="toggle"]').check();
  await options.waitForFunction(() => !document.body.hasAttribute("aria-busy"));
  await demo.reload();
  await demo.locator("#mes-outils-demo").waitFor();
  await options.locator(".module-details summary").click();
  options.once("dialog", (dialog) => dialog.accept());
  await options.locator('[data-action="remove"]').click();
  await options.locator(".module-card").waitFor({ state: "detached" });
  await demo.reload();
  assert.equal(await demo.locator("#mes-outils-demo").count(), 0);
  results.push("Pause, reactivation and removal passed after reload");
  assert.deepEqual(errors, []);
  const result = { target, browser: context.browser()?.version(), results, errors, network: "simulated CDN and page", hostPermissions: "granted through browser test API; native prompt not verified" };
  await writeFile(resolve(artifacts, "result.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  for (const [index, page] of context.pages().entries()) {
    await page.screenshot({ path: resolve(artifacts, `failure-${index}.png`) }).catch(() => {});
  }
  console.error(JSON.stringify({ target, results, errors, artifacts }));
  throw error;
} finally {
  await context.close();
}
