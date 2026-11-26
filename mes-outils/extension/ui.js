import { api, enableUserScripts, optionalUserScripts } from "./browser-api.js";
import { targetOrigins, sourceAddress } from "./shared.js";
import { createModuleCard } from "./module-card.js";

export const $ = (id) => document.getElementById(id);
let busy = false;
let currentState;
const checking = new Set();
export async function send(type, data = {}) {
  const response = await api.runtime.sendMessage({ type, ...data });
  if (!response?.ok) throw new Error(response?.error || "L’extension ne répond pas.");
  return response.result;
}
export function renderStatus(state) {
  currentState = state;
  const hasModules = state.modules.length > 0;
  document.body.dataset.installed = String(hasModules);
  const list = $("installed-panel");
  const open = new Set(
    [...list.querySelectorAll(".module-details[open]")].map(
      (node) => node.closest("[data-module-id]").dataset.moduleId,
    ),
  );
  const previousUpdates = new Map(
    [...list.querySelectorAll(".update-panel")].map((panel) => [
      panel.closest("[data-module-id]").dataset.moduleId,
      { digest: panel.dataset.digest, open: panel.open },
    ]),
  );
  const focused = document.activeElement;
  const focusId = focused?.dataset.id,
    focusAction = focused?.dataset.action;
  // Rebuilding cards must preserve expanded details and keyboard focus.
  list.replaceChildren(
    ...state.modules.map((item) => {
      const previousUpdate = previousUpdates.get(item.id);
      const card = createModuleCard(item, {
        updateDeferred:
          previousUpdate?.digest === item.pendingUpdate?.digest && !previousUpdate?.open,
      });
      card.querySelector(".module-details").open = open.has(item.id);
      return card;
    }),
  );
  list.hidden = !hasModules;
  if ($("empty-panel")) $("empty-panel").hidden = hasModules;
  $("permission-help").hidden = state.userScriptsAllowed;
  $("target-help").hidden = state.targetAllowed;
  if ($("configure"))
    $("configure").textContent = hasModules ? "Gérer mes outils" : "Ajouter un outil";
  const status = $("status");
  if (status) {
    const count = state.modules.length;
    status.textContent = hasModules ? `${count} ${count > 1 ? "outils" : "outil"}` : "À configurer";
  }
  setBusy(busy);
  if (focusId && focusAction)
    [...list.querySelectorAll("[data-action]")]
      .find((node) => node.dataset.id === focusId && node.dataset.action === focusAction)
      ?.focus();
}
function setBusy(value) {
  if (value) document.body.setAttribute("aria-busy", "true");
  else document.body.removeAttribute("aria-busy");
  for (const node of document.querySelectorAll("button, input")) {
    node.disabled = value || (node.dataset.action === "check" && checking.has(node.dataset.id));
  }
}
export async function refreshStatus() {
  try {
    renderStatus(await send("status"));
  } catch (error) {
    notice(error.message, true);
  }
}

export function watchStatus({ refreshOnFocus = false } = {}) {
  if (refreshOnFocus) window.addEventListener("focus", refreshStatus);
  api.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.state) refreshStatus();
  });
  refreshStatus();
}

// Downloads can run alongside pause/removal. Only exclusive actions lock the form.
async function runAction(operation, { exclusive = true } = {}) {
  if (busy) return false;
  if (exclusive) {
    busy = true;
    setBusy(true);
  }
  try {
    await operation();
    return true;
  } catch (error) {
    notice(error.message, true);
    return false;
  } finally {
    if (exclusive) busy = false;
    setBusy(busy);
    await refreshStatus();
  }
}

function handleToggle(event) {
  const control = event.target;
  if (control.dataset.action !== "toggle") return;
  const enabled = control.checked;
  const item = currentState?.modules.find((item) => item.id === control.dataset.id);
  if (!item) return;
  const permission = enabled
    ? api.permissions.request({ origins: targetOrigins(item.installed.meta) })
    : Promise.resolve(true);
  runAction(async () => {
    if (!(await permission)) throw new Error("L’accès aux sites de l’outil n’a pas été autorisé.");
    await send("toggle", { id: control.dataset.id, enabled });
    notice(
      enabled
        ? "Outil activé. Actualisez les pages concernées après avoir enregistré."
        : "Outil en pause. Actualisez les pages concernées après avoir enregistré.",
    );
  });
}

async function removeModule(item) {
  const id = item.id;
  const confirmation = `Désinstaller « ${item.installed.meta.name} » ?`;
  if (!confirm(confirmation)) return;
  const removed = await runAction(async () => {
    await send("remove", { id });
    notice("Outil désinstallé. Enregistrez votre travail puis actualisez les pages concernées.");
  });
  if (removed) {
    const next =
      $("installed-panel").querySelector("input") || $("install-heading") || $("configure");
    next?.focus();
  }
}

function showCheckResult(result) {
  switch (result.outcome) {
    case "local":
      notice("Outil local : réimportez le fichier pour installer une nouvelle version.");
      break;
    case "error":
      notice(result.state.lastError, true);
      break;
    case "empty":
    case "superseded":
      notice("La configuration a changé pendant la vérification.");
      break;
    case "pending":
      notice("Une mise à jour attend votre validation. La version installée est conservée.");
      break;
    default:
      notice("Votre outil est à jour.");
  }
}

async function checkModule(id) {
  if (checking.has(id)) return;
  checking.add(id);
  setBusy(busy);
  try {
    await runAction(
      async () => {
        notice("Vérification en cours…");
        const result = await send("check", { id });
        showCheckResult(result);
      },
      { exclusive: false },
    );
  } finally {
    checking.delete(id);
    setBusy(busy);
  }
}

function restoreSource(item) {
  // Keep permission requests within the original user gesture.
  const permission = api.permissions.request({
    origins: [sourceAddress(item.installed.sourceUrl).permission],
  });
  runAction(async () => {
    if (!(await permission)) throw new Error("Accès au serveur refusé.");
    notice("Accès au serveur rétabli.");
  });
}

export function setupActions() {
  const panel = $("installed-panel");
  panel.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const details = event.target.closest(".module-details");
    if (details?.open) {
      details.open = false;
      details.querySelector("summary").focus();
      event.preventDefault();
    }
  });
  panel.addEventListener("change", handleToggle);
  panel.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || busy) return;
    const item = currentState?.modules.find((item) => item.id === button.dataset.id);
    if (!item) return;
    switch (button.dataset.action) {
      case "approveUpdate": {
        const permission = api.permissions.request({
          origins: targetOrigins(item.pendingUpdate.meta),
        });
        return runAction(async () => {
          if (!(await permission)) throw new Error("L’accès aux sites de l’outil n’a pas été autorisé.");
          // Use the digest on the clicked button, never a newer candidate from a status refresh.
          renderStatus(await send("approveUpdate", { id: item.id, digest: button.dataset.digest }));
          notice(
            item.installed.enabled
              ? "Mise à jour installée. Enregistrez votre travail puis actualisez les pages concernées."
              : "Mise à jour installée. L’outil reste en pause.",
          );
          $("installed-panel").querySelector(`[data-module-id="${item.id}"] input`)?.focus();
        });
      }
      case "deferUpdate": {
        const panel = button.closest(".update-panel");
        panel.open = false;
        panel.querySelector("summary").focus();
        return;
      }
      case "remove":
        return removeModule(item);
      case "check":
        return checkModule(item.id);
      case "restore":
        return restoreSource(item);
    }
  });
  for (const button of document.querySelectorAll("[data-extension-details]"))
    button.addEventListener("click", () => {
      const permission = enableUserScripts();
      runAction(async () => {
        if (optionalUserScripts && !(await permission))
          throw new Error("L’autorisation des scripts utilisateur a été refusée.");
        await permission;
        notice(optionalUserScripts
          ? "Scripts utilisateur autorisés."
          : "Activez « Autoriser les scripts utilisateur » dans les détails de l’extension, puis revenez ici.");
      });
    });
  for (const button of document.querySelectorAll("[data-restore-target]"))
    button.addEventListener("click", () => {
      const origins = [
        ...new Set((currentState?.modules || [])
          .filter((item) => !item.targetAllowed)
          .flatMap((item) => targetOrigins(item.installed.meta))),
      ];
      if (!origins.length) return;
      const permission = api.permissions.request({ origins });
      runAction(async () => {
        if (!(await permission)) throw new Error("Accès aux sites refusé.");
        notice("Accès aux sites rétabli.");
      });
    });
  return runAction;
}
export function notice(message, error = false) {
  $("notice").textContent = message;
  $("notice").dataset.error = String(error);
  $("notice").hidden = !message;
}
