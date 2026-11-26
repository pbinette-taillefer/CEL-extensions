import { api } from "./browser-api.js";
import { createManager } from "./modules.js";
import { UPDATE_ALARM, isModuleBlocked } from "./shared.js";

const manager = createManager(api);
async function badge() {
  const state = await manager.state();
  const problem = state.modules.some((item) => item.lastError || isModuleBlocked(item));
  const updates = state.modules.filter((item) => item.pendingUpdate).length;
  await api.action.setBadgeText({ text: problem ? "!" : updates ? String(updates) : "" });
  await api.action.setBadgeBackgroundColor({ color: "#b45309" });
}
async function initialize() {
  listenForUserScripts();
  await manager.bootstrap();
  await badge();
}

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const allowedPages = ["options.html", "popup.html"].map((path) => api.runtime.getURL(path));
  if (sender.id !== api.runtime.id || !allowedPages.includes(sender.url)) return false;
  const operations = {
    status: async () => {
      await manager.synchronize();
      return manager.state();
    },
    prepare: () => manager.prepare(message.url),
    prepareLocal: () => manager.prepareLocal(message.name, message.code),
    install: () => manager.install(message.token),
    check: () => manager.check(message.id),
    approveUpdate: () => manager.approveUpdate(message.id, message.digest),
    toggle: () => manager.toggle(message.id, message.enabled),
    remove: () => manager.remove(message.id),
  };
  if (!Object.hasOwn(operations, message?.type)) return false;
  (async () => {
    const result = await operations[message.type]();
    await badge();
    return result;
  })().then(
    (result) => sendResponse({ ok: true, result }),
    (error) => sendResponse({ ok: false, error: error.message }),
  );
  return true;
});
async function checkUpdates() {
  await manager.synchronize();
  await manager.check();
  await badge();
}
api.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) checkUpdates().catch(console.error);
});
api.runtime.onInstalled.addListener((details) => {
  initialize().catch(console.error);
  if (details.reason === "install") api.runtime.openOptionsPage();
});
api.runtime.onStartup.addListener(() => initialize().catch(console.error));
api.permissions.onAdded.addListener(() => initialize().catch(console.error));
api.permissions.onRemoved.addListener((permissions) => {
  if (permissions.permissions.includes("userScripts")) userScriptEvent = null;
  initialize().catch(console.error);
});

// Only isolated launchers can use this channel; page code receives no extension APIs.
function authorizeUserScript(message, sender, sendResponse) {
  if (sender.id !== api.runtime.id) return false;
  if (message?.type === "execute-page") {
    manager.executePage(message, sender).then(sendResponse,
      (error) => sendResponse({ error: error.message }));
  } else if (message?.type === "authorize") {
    manager.authorize(message.id, message.digest).then(sendResponse, () => sendResponse(false));
  } else return false;
  return true;
}

let userScriptEvent = null;
function listenForUserScripts() {
  // In Firefox this event is absent until the optional permission is granted.
  const event = api.runtime.onUserScriptMessage;
  if (!event || event === userScriptEvent) return;
  event.addListener(authorizeUserScript);
  userScriptEvent = event;
}

// Repair registrations and check overdue updates whenever the background wakes.
initialize().catch(console.error);
