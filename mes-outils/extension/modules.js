import { createSingleManager, readPendingInstallation } from "./manager.js";
import { downloadScript, registration } from "./script.js";
import { executePageScript } from "./page-execution.js";
import {
  SCRIPT_ID,
  HOUR,
  UPDATE_ALARM,
  UPDATE_INTERVAL_MINUTES,
  isSupportedTiming,
  isLocal,
  sameSource,
} from "./shared.js";

function matchesRegistration(actual, expected) {
  if (!actual) return false;
  return (
    JSON.stringify(actual.js) === JSON.stringify(expected.js) &&
    JSON.stringify(actual.matches) === JSON.stringify(expected.matches) &&
    JSON.stringify(actual.excludeMatches || []) === JSON.stringify(expected.excludeMatches) &&
    actual.runAt === expected.runAt &&
    actual.allFrames === expected.allFrames &&
    actual.world === expected.world
  );
}

// Only storage and registration changes are serialized, never downloads.
export function createManager(api, { download = downloadScript, now = Date.now } = {}) {
  let queue = Promise.resolve();
  // Queued operations must not call mutate again: re-entering this queue deadlocks.
  function mutate(operation) {
    const result = queue.then(operation);
    queue = result.catch(() => {});
    return result;
  }
  async function read() {
    const { state } = await api.storage.local.get("state");
    if (state?.schema === 2) return state;
    const migrated = { schema: 2, modules: state?.installed ? [{ id: SCRIPT_ID, ...state }] : [] };
    await api.storage.local.set({ state: migrated });
    return migrated;
  }
  function manager(id) {
    // Present one entry as a storage area so the single-tool manager never needs
    // to know the collection format or overwrite another tool's state.
    const local = {
      get: async () => {
        const entry = (await read()).modules.find((item) => item.id === id);
        return {
          state: entry
            ? {
                installed: entry.installed,
                pendingUpdate: entry.pendingUpdate,
                lastChecked: entry.lastChecked,
                lastError: entry.lastError,
              }
            : undefined,
        };
      },
      set: async ({ state }) => {
        const data = await read();
        const index = data.modules.findIndex((item) => item.id === id);
        if (!state.installed) data.modules = data.modules.filter((item) => item.id !== id);
        else if (index < 0) data.modules.push({ id, ...state });
        else data.modules[index] = { id, ...state };
        await api.storage.local.set({ state: data });
      },
    };
    return createSingleManager(api, { download, now, scriptId: id, mutate, storage: local });
  }
  async function requireModule(id) {
    if (typeof id !== "string" || !(await read()).modules.some((item) => item.id === id)) {
      throw new Error("Cet outil n’est plus installé.");
    }
    return manager(id);
  }
  async function state() {
    const data = await read();
    const modules = [];
    for (const item of data.modules)
      modules.push({ id: item.id, ...(await manager(item.id).state(item)) });
    let userScriptsAllowed = true;
    try {
      await api.userScripts.getScripts();
    } catch {
      userScriptsAllowed = false;
    }
    return {
      modules,
      userScriptsAllowed,
      targetAllowed: modules.every((item) => item.targetAllowed),
    };
  }
  async function prepare(url) {
    const candidate = await manager("preview").prepare(url);
    const existing = (await read()).modules.find(
      (item) => sameSource(item.installed, candidate),
    );
    return { ...candidate, replaces: existing?.installed.meta.name || null };
  }
  async function prepareLocal(name, code) {
    const candidate = await manager("preview").prepareLocal(name, code);
    const existing = (await read()).modules.find((item) => sameSource(item.installed, candidate));
    return { ...candidate, replaces: existing?.installed.meta.name || null };
  }
  async function install(token) {
    const candidate = await readPendingInstallation(api, token, now);
    const data = await read();
    const existing = data.modules.find((item) => sameSource(item.installed, candidate));
    const duplicate = data.modules.find(
      (item) =>
        item.id !== existing?.id &&
        item.installed.meta.name === candidate.meta.name &&
        item.installed.meta.namespace === candidate.meta.namespace,
    );
    if (duplicate)
      throw new Error(
        "Cet outil est déjà installé depuis une autre source. Désinstallez-le avant de changer sa source.",
      );
    await manager(existing?.id || "module-" + crypto.randomUUID()).install(token);
    return state();
  }
  async function check(id) {
    if (id !== undefined) return (await requireModule(id)).check();
    const results = [];
    for (const item of (await read()).modules.filter((entry) => !isLocal(entry.installed)))
      results.push({ id: item.id, ...(await manager(item.id).check()) });
    return results;
  }
  async function reconcile() {
    let scripts;
    try {
      scripts = await api.userScripts.getScripts();
      await api.userScripts.configureWorld({ messaging: true });
    } catch {
      return;
    }
    const data = await read();
    const enabledModules = data.modules.filter((item) => item.installed.enabled);
    const active = new Set(enabledModules.map((item) => item.id));
    const stale = scripts.filter(
      (item) => (item.id === SCRIPT_ID || item.id.startsWith("module-")) && !active.has(item.id),
    );
    if (stale.length) await api.userScripts.unregister({ ids: stale.map((item) => item.id) });
    for (const item of enabledModules) {
      const existing = scripts.find((script) => script.id === item.id);
      if (!isSupportedTiming(item.installed.meta)) {
        // Remove old early injections and expose a recoverable compatibility error.
        if (existing) await api.userScripts.unregister({ ids: [item.id] });
        await manager(item.id).restore();
        continue;
      }
      const expected = registration(item.installed, item.id);
      if (!matchesRegistration(existing, expected)) {
        await manager(item.id).restore();
      }
    }
  }
  async function bootstrap() {
    await mutate(async () => {
      // Firefox does not implement this method. No content script is shipped.
      await api.storage.local.setAccessLevel?.({ accessLevel: "TRUSTED_CONTEXTS" });
      const alarm = await api.alarms.get(UPDATE_ALARM);
      if (!alarm || alarm.periodInMinutes !== UPDATE_INTERVAL_MINUTES) {
        await api.alarms.create(UPDATE_ALARM, { periodInMinutes: UPDATE_INTERVAL_MINUTES });
      }
      await read();
      await reconcile();
    });
    for (const item of (await read()).modules.filter((entry) => !isLocal(entry.installed))) {
      if (!item.lastChecked || now() - item.lastChecked >= HOUR) await manager(item.id).check();
    }
  }
  async function authorize(id, digest) {
    return mutate(async () => {
      const item = (await read()).modules.find((item) => item.id === id);
      return Boolean(
        item?.installed.enabled &&
        isSupportedTiming(item.installed.meta) &&
        item.installed.digest === digest
      );
    });
  }
  async function executePage(message, sender) {
    return mutate(async () => {
      const item = (await read()).modules.find((entry) => entry.id === message.id);
      return executePageScript(api, item?.installed, message, sender);
    });
  }
  async function toggle(id, enabled) {
    const tool = await requireModule(id);
    await tool.toggle(enabled);
    return state();
  }
  async function remove(id) {
    const tool = await requireModule(id);
    await tool.remove();
    return state();
  }
  async function approveUpdate(id, digest) {
    const tool = await requireModule(id);
    await tool.approveUpdate(digest);
    return state();
  }
  return {
    state,
    prepare,
    prepareLocal,
    check,
    bootstrap,
    authorize,
    executePage,
    synchronize: () => mutate(reconcile),
    install: (token) => mutate(() => install(token)),
    approveUpdate: (id, digest) => mutate(() => approveUpdate(id, digest)),
    toggle: (id, enabled) => mutate(() => toggle(id, enabled)),
    remove: (id) => mutate(() => remove(id)),
  };
}
