import { parse } from "./vendor/acorn.mjs";
import {
  targetPattern,
  MAX_BYTES,
  DOWNLOAD_TIMEOUT_MS,
  sourceAddress,
  RUN_AT_HELP,
  isSupportedTiming,
} from "./shared.js";

function versionParts(value) {
  if (!/^\d{1,9}(?:\.\d{1,9}){0,5}$/.test(value)) {
    throw new Error("La @version doit être numérique, par exemple 1.0.0.");
  }
  return value.split(".").map(Number);
}

export function compareVersions(a, b) {
  const left = versionParts(a),
    right = versionParts(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const difference = (left[i] || 0) - (right[i] || 0);
    if (difference) return Math.sign(difference);
  }
  return 0;
}

export function parseScript(code) {
  if (typeof code !== "string" || new TextEncoder().encode(code).length > MAX_BYTES) {
    throw new Error("L’outil dépasse la taille maximale de 1 Mo.");
  }
  const block = code.match(
    /^\uFEFF?\s*\/\/\s*==UserScript==\s*\r?\n([\s\S]*?)^\/\/\s*==\/UserScript==\s*$/m,
  );
  // The metadata must be at the start: an HTML page containing an example is not a script.
  if (!block || code.slice(0, block.index).trim()) {
    throw new Error(
      "Le format de l’outil est invalide : l’en-tête UserScript est absent ou incorrect. Utilisez le lien direct du fichier JavaScript (.js) contenant les métadonnées de l’outil.",
    );
  }
  const fields = new Map();
  for (const line of block[1].split(/\r?\n/)) {
    const item = line.match(/^\/\/\s*@([\w-]+)(?:\s+(.*))?$/);
    if (item) fields.set(item[1], [...(fields.get(item[1]) || []), (item[2] || "").trim()]);
  }
  const one = (key, required = false) => {
    const values = fields.get(key) || [];
    if (values.length > 1 || (required && !values[0]))
      throw new Error(`Une seule valeur @${key} est requise.`);
    return values[0] || "";
  };
  const name = one("name", true),
    version = one("version", true);
  versionParts(version);
  if (name.length > 150) throw new Error("Le nom de l’outil est trop long.");
  for (const key of [
    "require",
    "resource",
    "connect",
    "include",
    "exclude",
    "unwrap",
    "sandbox",
    "mes-outils-tinymce",
  ]) {
    if (fields.has(key))
      throw new Error(`@${key} n’est pas pris en charge par ce gestionnaire simplifié.`);
  }
  if ((fields.get("grant") || []).some((value) => value !== "none")) {
    throw new Error(
      "Seuls les outils @grant none sont pris en charge. Les API GM_* de Tampermonkey ne sont pas disponibles.",
    );
  }
  const matches = [...new Set((fields.get("match") || []).map(targetPattern))];
  if (!matches.length) throw new Error("Ajoutez au moins une règle @match HTTPS dans l’outil.");
  const runAt = one("run-at") || "document-idle";
  if (runAt !== "document-idle") throw new Error(RUN_AT_HELP);
  const injectInto = one("inject-into") || "content";
  if (!["content", "page"].includes(injectInto) || (fields.has("inject-into") && !one("inject-into")))
    throw new Error("@inject-into accepte uniquement content (isolé) ou page (contexte du site).");
  try {
    parse(code, { ecmaVersion: "latest", sourceType: "script" });
  } catch (error) {
    const position = error.loc ? ` (ligne ${error.loc.line}, colonne ${error.loc.column + 1})` : "";
    throw new Error(`Syntaxe JavaScript invalide${position}. L’outil n’a pas été installé.`);
  }
  return {
    name,
    version,
    namespace: one("namespace"),
    description: one("description"),
    matches,
    excludeMatches: [...new Set((fields.get("exclude-match") || []).map(targetPattern))],
    runAt: runAt.replace("-", "_"),
    allFrames: !fields.has("noframes"),
    injectInto,
  };
}

export function registration(script, id) {
  // Revalidate stored previews and tools created by earlier extension versions.
  if (!isSupportedTiming(script.meta)) throw new Error(RUN_AT_HELP);
  const page = script.meta.injectInto === "page";
  const message = JSON.stringify({ type: page ? "execute-page" : "authorize", id, digest: script.digest });
  const code = page
    ? `(globalThis.browser ?? globalThis.chrome).runtime.sendMessage(${message}).then(result => {
  if (result !== true) throw new Error(typeof result?.error === "string" ? result.error : "Exécution dans la page refusée.");
}).catch(console.error);`
    : `(globalThis.browser ?? globalThis.chrome).runtime.sendMessage(${message}).then(allowed => {
  if (allowed !== true) return;
  (() => {
${script.code}
})();
}).catch(console.error);`;
  return {
    id,
    js: [
      {
        code,
      },
    ],
    matches: script.meta.matches,
    excludeMatches: script.meta.excludeMatches,
    runAt: script.meta.runAt,
    allFrames: script.meta.allFrames,
    world: "USER_SCRIPT",
  };
}

async function scriptDigest(code) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function localScript(name, code) {
  if (typeof name !== "string" || name.length > 255 || !/^[^/\\\x00]+\.js$/i.test(name))
    throw new Error("Choisissez un fichier JavaScript .js.");
  const meta = parseScript(code);
  return { sourceKind: "local", sourceName: name, sourceUrl: null, code, meta, digest: await scriptDigest(code) };
}

export async function downloadScript(input, fetcher = fetch) {
  const { url } = sourceAddress(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetcher(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Le serveur a répondu HTTP ${response.status}.`);
    if (Number(response.headers.get("content-length")) > MAX_BYTES)
      throw new Error("L’outil dépasse 1 Mo.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let code = "",
      bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error("L’outil dépasse 1 Mo.");
        code += decoder.decode(value, { stream: true });
      }
      code += decoder.decode();
    } finally {
      await reader.cancel().catch(() => {});
    }
    const meta = parseScript(code);
    const digest = await scriptDigest(code);
    return { sourceUrl: url, code, meta, digest };
  } catch (error) {
    if (error.name === "AbortError")
      throw new Error("Le serveur ne répond pas après 15 secondes. Réessayez plus tard.");
    if (error instanceof TypeError)
      throw new Error(
        "Téléchargement impossible. Vérifiez l’adresse, l’accès au serveur et l’absence de redirection.",
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
