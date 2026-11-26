import { isSupportedTiming, targetPattern } from "./shared.js";

function matchesURL(pattern, address) {
  targetPattern(pattern);
  const start = pattern.indexOf("/", "https://".length);
  if (address.origin !== pattern.slice(0, start)) return false;
  const path = pattern.slice(start).split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${path}$`).test(address.pathname + address.search);
}

// Called under the manager's mutation queue: pause/update cannot interleave authorization
// and injection. The caller never supplies code; only the exact installed copy runs.
export async function executePageScript(api, installed, message, sender) {
  if (sender.id !== api.runtime.id || !Number.isInteger(sender.tab?.id) ||
      !Number.isInteger(sender.frameId) || typeof sender.documentId !== "string" ||
      !sender.documentId || typeof sender.url !== "string") return false;
  if (!installed?.enabled || installed.digest !== message.digest ||
      !isSupportedTiming(installed.meta) || installed.meta.injectInto !== "page") return false;
  const address = new URL(sender.url);
  if (address.protocol !== "https:" ||
      !installed.meta.matches.some((pattern) => matchesURL(pattern, address)) ||
      installed.meta.excludeMatches.some((pattern) => matchesURL(pattern, address)) ||
      (!installed.meta.allFrames && sender.frameId !== 0)) return false;
  if (typeof api.userScripts.execute !== "function")
    throw new Error("Ce navigateur ne propose pas userScripts.execute, nécessaire au contexte de la page.");
  const results = await api.userScripts.execute({
    target: { tabId: sender.tab.id, documentIds: [sender.documentId] },
    world: "MAIN", js: [{ code: `(() => {\n${installed.code}\n})();` }],
  });
  const failure = results.find((result) => result.error);
  if (failure) throw new Error(`Erreur de l’outil dans la page : ${String(failure.error).slice(0, 500)}`);
  return true;
}
