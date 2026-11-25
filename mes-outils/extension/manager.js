import { registration, compareVersions, downloadScript } from "./script.js";
import {
  SCRIPT_ID,
  targetOrigins,
  PREVIEW_TTL_MS,
  sourceAddress,
  RUN_AT_HELP,
  isSupportedTiming,
} from "./shared.js";

const EMPTY = { installed: null, pendingUpdate: null, lastChecked: null, lastError: null };
const PERMISSION_HELP =
  "Autorisez les scripts utilisateur depuis la configuration de l’extension, puis réessayez.";

export async function readPendingInstallation(api, token, now) {
  const { pending } = await api.storage.session.get("pending");
  if (!pending || pending.token !== token || pending.expiresAt <= now()) {
    throw new Error("L’aperçu a expiré. Cliquez de nouveau sur « Examiner ».");
  }
  return pending.candidate;
}

function validateUpdate(candidate, current) {
  if (
    candidate.meta.name !== current.meta.name ||
    candidate.meta.namespace !== current.meta.namespace
  ) {
    throw new Error(
      "Le nom ou l’espace de noms de l’outil a changé. Examinez et confirmez cette installation manuellement.",
    );
  }
  const comparison = compareVersions(candidate.meta.version, current.meta.version);
  if (comparison < 0)
    throw new Error(
      "Le serveur propose une version plus ancienne. La version installée est conservée.",
    );
  if (comparison === 0 && candidate.digest !== current.digest) {
    throw new Error(
      "Le code a changé sans augmentation de @version. La version installée est conservée.",
    );
  }
  return comparison;
}

// The multi-tool manager serializes writes; downloads run outside that queue.
export function createSingleManager(
  api,
  {
    download = downloadScript,
    now = Date.now,
    scriptId = SCRIPT_ID,
    mutate = (operation) => operation(),
    storage = api.storage.local,
  } = {},
) {
  const read = async () => (await storage.get("state")).state || { ...EMPTY };
  const save = (state) => storage.set({ state });
  async function available() {
    try {
      await api.userScripts.getScripts();
      return true;
    } catch {
      return false;
    }
  }
  async function apply(installed) {
    if (!(await available())) throw new Error(PERMISSION_HELP);
    await api.userScripts.configureWorld({ messaging: true });
    const existing = await api.userScripts.getScripts({ ids: [scriptId] });
    if (!installed?.enabled) {
      if (existing.length) await api.userScripts.unregister({ ids: [scriptId] });
    } else {
      if (!isSupportedTiming(installed.meta)) {
        throw new Error(RUN_AT_HELP);
      }
      if (!(await api.permissions.contains({ origins: targetOrigins(installed.meta) }))) {
        throw new Error("Autorisez l’accès aux sites de l’outil dans l’extension pour exécuter l’outil.");
      }
      if (existing.length) await api.userScripts.update([registration(installed, scriptId)]);
      else await api.userScripts.register([registration(installed, scriptId)]);
    }
  }
  async function commit(next, previous) {
    await apply(next.installed);
    try {
      await save(next);
    } catch (error) {
      await apply(previous.installed);
      throw error;
    }
  }
  async function hasSource(url) {
    return api.permissions.contains({ origins: [sourceAddress(url).permission] });
  }
  async function state(snapshot) {
    const data = snapshot || (await read());
    const userScriptsAllowed = await available();
    const registered = userScriptsAllowed
      ? (await api.userScripts.getScripts({ ids: [scriptId] })).length > 0
      : false;
    const installed = data.installed;
    return {
      installed: installed && {
        meta: installed.meta,
        sourceUrl: installed.sourceUrl,
        enabled: installed.enabled,
        installedAt: installed.installedAt,
        updatedAt: installed.updatedAt,
      },
      pendingUpdate: data.pendingUpdate
        ? {
            meta: data.pendingUpdate.candidate.meta,
            sourceUrl: data.pendingUpdate.candidate.sourceUrl,
            digest: data.pendingUpdate.candidate.digest,
            detectedAt: data.pendingUpdate.detectedAt,
          }
        : null,
      lastChecked: data.lastChecked,
      lastError: data.lastError,
      userScriptsAllowed,
      registered,
      targetAllowed: installed
        ? await api.permissions.contains({ origins: targetOrigins(installed.meta) })
        : true,
      sourceAllowed: installed ? await hasSource(installed.sourceUrl) : true,
    };
  }
  async function prepare(url) {
    if (!(await hasSource(url)))
      throw new Error("Autorisez l’accès au serveur de l’outil, puis réessayez.");
    const candidate = await download(url);
    const token = crypto.randomUUID();
    await api.storage.session.set({
      pending: { token, candidate, expiresAt: now() + PREVIEW_TTL_MS },
    });
    return { token, meta: candidate.meta, sourceUrl: candidate.sourceUrl };
  }
  async function install(token) {
    const candidate = await readPendingInstallation(api, token, now);
    if (!(await hasSource(candidate.sourceUrl)))
      throw new Error("L’accès au serveur de l’outil a été retiré.");
    const previous = await read();
    const timestamp = now();
    await commit(
      {
        installed: { ...candidate, enabled: true, installedAt: timestamp, updatedAt: timestamp },
        pendingUpdate: null,
        lastChecked: timestamp,
        lastError: null,
      },
      previous,
    );
    await api.storage.session.remove("pending");
    return state();
  }
  async function check() {
    const previous = await read();
    if (!previous.installed) return { outcome: "empty", state: await state() };
    let candidate, failure;
    try {
      if (!(await hasSource(previous.installed.sourceUrl)))
        throw new Error(
          "L’accès au serveur a été retiré. Autorisez-le depuis la page de configuration.",
        );
      candidate = await download(previous.installed.sourceUrl);
    } catch (error) {
      failure = error;
    }
    return mutate(async () => {
      // A pause, removal or reinstallation may have completed during the download.
      // Always merge into the latest state, never the pre-download snapshot.
      const latest = await read();
      if (!latest.installed) return { outcome: "empty", state: await state() };
      if (
        latest.installed.digest !== previous.installed.digest ||
        latest.installed.sourceUrl !== previous.installed.sourceUrl
      ) {
        return { outcome: "superseded", state: await state() };
      }
      const timestamp = now();
      try {
        if (failure) throw failure;
        if (!(await hasSource(latest.installed.sourceUrl)))
          throw new Error("L’accès au serveur de l’outil a été retiré.");
        const current = latest.installed;
        const comparison = validateUpdate(candidate, current);
        if (comparison === 0) {
          // Restore registration after an extension update or a permission change.
          if (current.enabled) await apply(current);
          await save({ ...latest, lastChecked: timestamp, lastError: null });
          return { outcome: latest.pendingUpdate ? "pending" : "current", state: await state() };
        }
        // Never register downloaded code until the user approves this exact digest.
        // A late response must not replace a newer pending version or change its code silently.
        if (latest.pendingUpdate) validateUpdate(candidate, latest.pendingUpdate.candidate);
        const pendingUpdate = {
          candidate,
          baseDigest: current.digest,
          detectedAt:
            latest.pendingUpdate?.candidate.digest === candidate.digest
              ? latest.pendingUpdate.detectedAt
              : timestamp,
        };
        await save({ ...latest, pendingUpdate, lastChecked: timestamp, lastError: null });
        return { outcome: "pending", state: await state() };
      } catch (error) {
        await save({ ...latest, lastChecked: timestamp, lastError: error.message });
        return { outcome: "error", state: await state() };
      }
    });
  }
  async function approveUpdate(digest) {
    const previous = await read();
    const pending = previous.pendingUpdate;
    if (
      !previous.installed ||
      !pending ||
      typeof digest !== "string" ||
      pending.candidate.digest !== digest
    ) {
      throw new Error(
        "Cette mise à jour a changé ou n’est plus disponible. Examinez la version proposée.",
      );
    }
    const candidate = pending.candidate;
    if (
      pending.baseDigest !== previous.installed.digest ||
      candidate.sourceUrl !== previous.installed.sourceUrl ||
      validateUpdate(candidate, previous.installed) <= 0
    ) {
      throw new Error("L’outil installé a changé. Vérifiez de nouveau ses mises à jour.");
    }
    if (!(await hasSource(candidate.sourceUrl)))
      throw new Error("L’accès au serveur de l’outil a été retiré.");
    const next = {
      ...previous,
      installed: { ...previous.installed, ...candidate, updatedAt: now() },
      pendingUpdate: null,
      lastError: null,
    };
    // Approval of a paused tool must preserve the pause, even without userScripts access.
    if (!next.installed.enabled && !(await available())) await save(next);
    else await commit(next, previous);
    return state();
  }
  async function toggle(enabled) {
    if (typeof enabled !== "boolean") throw new Error("État d’activation invalide.");
    const previous = await read();
    if (!previous.installed) throw new Error("Installez d’abord un outil.");
    // A revoked userScripts permission already stops injections; still allow a local pause.
    const next = { ...previous, installed: { ...previous.installed, enabled } };
    if (!enabled && !(await available())) await save(next);
    else await commit(next, previous);
    return state();
  }
  async function remove() {
    const previous = await read();
    if (await available()) await commit({ ...EMPTY }, previous);
    else await save({ ...EMPTY });
    return state();
  }
  async function restore() {
    const stored = await read();
    try {
      await apply(stored.installed);
    } catch (error) {
      if (stored.lastError !== error.message) await save({ ...stored, lastError: error.message });
    }
  }
  return { state, prepare, install, check, approveUpdate, toggle, remove, restore };
}
