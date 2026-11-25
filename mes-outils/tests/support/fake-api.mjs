// Deterministic browser API double; real permission dialogs require browser checks.
export function fakeApi(initialState) {
  const control = { userScriptsAllowed: true, failNextSave: false, writes: 0 };
  const origins = new Set(["https://cdn.example.test/*", "https://example.test/*"]);
  const scripts = new Map();
  const clone = (value) => structuredClone(value);
  function area(initial = {}, persistent = false) {
    let data = clone(initial);
    return {
      async get(key) { return clone({ [key]: data[key] }); },
      async set(values) {
        if (persistent && control.failNextSave) {
          control.failNextSave = false;
          throw new Error("Quota de stockage atteinte");
        }
        Object.assign(data, clone(values));
        if (persistent) control.writes++;
      },
      async remove(key) { delete data[key]; },
      async setAccessLevel() {},
    };
  }
  function requireAccess() {
    if (!control.userScriptsAllowed) throw new Error("Permission userScripts retirée");
  }
  const api = {
    storage: { local: area(initialState ? { state: initialState } : {}, true), session: area() },
    permissions: { async contains({ origins: requested = [] }) { return requested.every((item) => origins.has(item)); } },
    alarms: {
      async get() { return this.alarm; },
      async create(name, options) { this.alarm = { name, ...options }; },
    },
    userScripts: {
      async getScripts({ ids } = {}) {
        requireAccess();
        return clone([...scripts.values()].filter((item) => !ids || ids.includes(item.id)));
      },
      async configureWorld() { requireAccess(); },
      async register(entries) {
        requireAccess();
        for (const item of entries) {
          if (scripts.has(item.id)) throw new Error("Enregistrement dupliqué");
          scripts.set(item.id, clone(item));
        }
      },
      async update(entries) {
        requireAccess();
        for (const item of entries) {
          if (!scripts.has(item.id)) throw new Error("Enregistrement absent");
          scripts.set(item.id, clone(item));
        }
      },
      async unregister({ ids }) { requireAccess(); ids.forEach((id) => scripts.delete(id)); },
    },
  };
  return { api, control, scripts, origins };
}
