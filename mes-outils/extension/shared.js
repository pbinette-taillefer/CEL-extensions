// Shared by the service worker and extension pages; keep this module free of DOM
// access and parser imports so the interface can load it without Acorn.
export const SCRIPT_ID = "mes-outils"; // Registration used by the legacy single-tool storage format.
export const UPDATE_ALARM = "hourly-update";
export const UPDATE_INTERVAL_MINUTES = 60;
export const HOUR = UPDATE_INTERVAL_MINUTES * 60 * 1000;
export const MAX_BYTES = 1024 * 1024;
export const DOWNLOAD_TIMEOUT_MS = 15_000;
export const PREVIEW_TTL_MS = 15 * 60 * 1000;
export const RUN_AT_HELP =
  "Seul @run-at document-idle est pris en charge : l’outil s’exécute après le chargement du DOM et la vérification de son autorisation. Demandez à son auteur une version compatible.";

export function isSupportedTiming(meta) {
  return meta?.runAt === "document_idle";
}

export const isLocal = (script) => script?.sourceKind === "local";
export const executionLabel = (meta) => meta?.injectInto === "page" ? "Contexte de la page" : "Isolé";
export const sourceLabel = (script) => isLocal(script) ? `Fichier local · ${script.sourceName}` : script.sourceUrl;
export function sameSource(left, right) {
  if (isLocal(left) !== isLocal(right)) return false;
  return isLocal(left)
    ? left.meta.name === right.meta.name && left.meta.namespace === right.meta.namespace
    : left.sourceUrl === right.sourceUrl;
}

// Only explicit HTTPS hosts are accepted. Permission grants cover the host;
// the script's match patterns still limit execution to the declared paths.
export function targetPattern(value) {
  const match = value.match(/^https:\/\/([^/]+)(\/[^\s#]*)$/);
  const host = match?.[1];
  if (!host || host.includes("*") || host.includes("@") || host.includes(":")) {
    throw new Error(
      "Les règles @match et @exclude-match doivent viser un domaine HTTPS explicite, sans joker ni port.",
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Domaine HTTPS invalide dans les règles de l’outil.");
  }
  if (url.hostname !== host || url.username || url.password || url.port) {
    throw new Error("Domaine HTTPS invalide dans les règles de l’outil.");
  }
  return value;
}

export function targetOrigins(meta) {
  return [
    ...new Set(meta.matches.map((pattern) => {
      targetPattern(pattern);
      return `${new URL(pattern).origin}/*`;
    })),
  ];
}

export function sourceAddress(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Entrez une adresse HTTPS complète pour l’outil.");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Utilisez une adresse HTTPS sans identifiants ni fragment (#).");
  }
  return { url: url.href, permission: `${url.origin}/*` };
}

export function isModuleBlocked(item) {
  return (
    !item.userScriptsAllowed ||
    !item.targetAllowed ||
    !item.sourceAllowed ||
    (item.installed.enabled && !item.registered)
  );
}
