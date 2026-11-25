import { api } from "./browser-api.js";
import { sourceAddress, targetOrigins } from "./shared.js";
import { $, send, renderStatus, setupActions, notice, watchStatus } from "./ui.js";

let pendingToken = null;
let pendingMeta = null;
const run = setupActions();
$("extension-version").textContent = `v${api.runtime.getManifest().version}`;

function clearPreview() {
  pendingToken = null;
  pendingMeta = null;
  $("preview").hidden = true;
}
$("script-url").addEventListener("input", clearPreview);
$("cancel-install").addEventListener("click", () => {
  clearPreview();
  notice("");
  $("script-url").focus();
});

$("install-form").addEventListener("submit", (event) => {
  event.preventDefault();
  let address;
  try {
    address = sourceAddress($("script-url").value.trim());
  } catch (error) {
    notice(error.message, true);
    return;
  }
  // Request directly in the click/submit gesture, before any asynchronous work.
  const permission = api.permissions.request({ origins: [address.permission] });
  run(async () => {
    clearPreview();
    if (!(await permission)) throw new Error("L’accès au serveur n’a pas été autorisé.");
    notice("Téléchargement de l’aperçu…");
    const candidate = await send("prepare", { url: address.url });
    pendingToken = candidate.token;
    pendingMeta = candidate.meta;
    $("preview-name").textContent = candidate.meta.name;
    $("preview-description").textContent = candidate.meta.description;
    $("preview-version").textContent = candidate.meta.version;
    $("preview-source").textContent = candidate.sourceUrl;
    $("preview-matches").textContent = candidate.meta.matches.join("\n");
    $("preview").hidden = false;
    $("replacement-note").hidden = !candidate.replaces;
    notice("");
    $("preview-name").focus();
  });
});
$("confirm-install").addEventListener("click", () => {
  if (!pendingToken || !pendingMeta) return;
  const permission = api.permissions.request({ origins: targetOrigins(pendingMeta) });
  return run(async () => {
    if (!(await permission)) throw new Error("L’accès aux sites de l’outil n’a pas été autorisé.");
    if (!pendingToken) throw new Error("Examinez d’abord un outil.");
    renderStatus(await send("install", { token: pendingToken }));
    clearPreview();
    $("script-url").value = "";
    notice(
      "Outil installé. Enregistrez votre travail puis actualisez les pages concernées pour l’utiliser.",
    );
  }).then((installed) => {
    if (installed) $("install-heading").focus();
  });
});
watchStatus({ refreshOnFocus: true });
