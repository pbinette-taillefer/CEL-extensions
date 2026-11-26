import { api } from "./browser-api.js";
import { sourceAddress, targetOrigins, MAX_BYTES, sourceLabel, executionLabel } from "./shared.js";
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
$("script-file").addEventListener("change", clearPreview);
function showPreview(candidate) {
  pendingToken = candidate.token;
  pendingMeta = candidate.meta;
  $("preview-name").textContent = candidate.meta.name;
  $("preview-description").textContent = candidate.meta.description;
  $("preview-version").textContent = candidate.meta.version;
  $("preview-source").textContent = sourceLabel(candidate);
  $("preview-matches").textContent = candidate.meta.matches.join("\n");
  $("preview-world").textContent = executionLabel(candidate.meta);
  $("preview-page-context").hidden = candidate.meta.injectInto !== "page";
  $("preview-updates").textContent = candidate.sourceKind === "local"
    ? "Fichier local : les mises à jour se font en réimportant le fichier. Le fichier d’origine n’est pas surveillé."
    : "Les nouvelles versions sont recherchées à cette adresse et attendent votre approbation.";
  $("preview").hidden = false;
  $("replacement-note").hidden = !candidate.replaces;
  notice("");
  $("preview-name").focus();
}
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
    showPreview(candidate);
  });
});
$("local-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const file = $("script-file").files[0];
  if (!file) return;
  run(async () => {
    clearPreview();
    if (file.size > MAX_BYTES) throw new Error("L’outil dépasse la taille maximale de 1 Mo.");
    let code;
    try { code = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
    catch { throw new Error("Le fichier JavaScript doit être encodé en UTF-8."); }
    showPreview(await send("prepareLocal", { name: file.name, code }));
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
    $("script-file").value = "";
    notice(
      "Outil installé. Enregistrez votre travail puis actualisez les pages concernées pour l’utiliser.",
    );
  }).then((installed) => {
    if (installed) $("install-heading").focus();
  });
});
watchStatus({ refreshOnFocus: true });
