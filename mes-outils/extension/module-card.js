import { isModuleBlocked } from "./shared.js";

const formatDate = (value) =>
  value
    ? new Intl.DateTimeFormat("fr-CA", { dateStyle: "medium", timeStyle: "short" }).format(value)
    : "Pas encore";

function moduleStatus(blocked, enabled) {
  if (blocked) return { label: "Action requise", state: "warning" };
  if (enabled) return { label: "Activé", state: "active" };
  return { label: "En pause", state: "paused" };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function action(label, type, id, className = "text-button") {
  const button = element("button", className, label);
  button.type = "button";
  button.dataset.action = type;
  button.dataset.id = id;
  return button;
}
function updatePanel(item, deferred) {
  const current = item.installed;
  const pending = item.pendingUpdate;
  const panel = element("details", "update-panel");
  panel.dataset.digest = pending.digest;
  panel.open = !deferred;
  panel.append(
    element("summary", "update-summary", "Mise à jour disponible · " + pending.meta.version),
  );
  panel.append(
    element("p", "update-version", `Version ${current.meta.version} → ${pending.meta.version}`),
  );
  const info = element("dl", "stats update-meta");
  const scope = (meta) => [
    ["Pages autorisées", meta.matches.join("\n")],
    ["Pages exclues", meta.excludeMatches.join("\n") || "Aucune"],
    ["Cadres", meta.allFrames ? "Pages et cadres correspondants" : "Page principale uniquement"],
    ["Moment d’exécution", meta.runAt.replace("_", "-")],
  ];
  const before = scope(current.meta);
  const after = scope(pending.meta);
  const changed = after.filter(([, value], index) => value !== before[index][1]);
  panel.append(
    element(
      "p",
      "update-note",
      changed.length
        ? "Les règles d’exécution changent. Examinez les détails avant d’installer."
        : "Les pages autorisées et les règles d’exécution restent identiques.",
    ),
  );
  const fields = [
    ["Source", pending.sourceUrl],
    ...after.map(([name, value], index) => [
      name,
      value === before[index][1]
        ? value
        : `Actuellement :\n${before[index][1]}\nAprès installation :\n${value}`,
    ]),
  ];
  for (const [name, value] of fields) {
    const group = element("div");
    group.append(element("dt", "", name), element("dd", "", value));
    info.append(group);
  }
  panel.append(
    info,
    element(
      "p",
      "update-note",
      current.enabled
        ? "La version actuelle reste active jusqu’à votre validation. Après installation, enregistrez votre travail puis actualisez les pages concernées."
        : "L’outil restera en pause après l’installation de cette version.",
    ),
  );
  const actions = element("div", "actions");
  const approve = action("Installer cette version", "approveUpdate", item.id, "primary");
  approve.dataset.digest = pending.digest;
  approve.setAttribute(
    "aria-label",
    `Installer la version ${pending.meta.version} de ${current.meta.name}`,
  );
  const later = action("Plus tard", "deferUpdate", item.id);
  later.dataset.digest = pending.digest;
  actions.append(approve, later);
  panel.append(actions);
  return panel;
}

export function createModuleCard(item, { updateDeferred = false } = {}) {
  const module = item.installed;
  const card = element("section", "card module-card");
  card.dataset.moduleId = item.id;
  const blocked = isModuleBlocked(item);
  const status = moduleStatus(blocked, module.enabled);
  const badge = element("span", "badge", status.label);
  badge.dataset.state = status.state;
  const row = element("div", "script-row");
  const title = element("div");
  const meta = element("div", "tool-meta");
  meta.append(element("span", "section-label", "Version " + module.meta.version), badge);
  title.append(element("h2", "", module.meta.name), meta);
  const label = element("label", "switch");
  const toggle = element("input");
  toggle.type = "checkbox";
  toggle.checked = module.enabled;
  toggle.dataset.action = "toggle";
  toggle.dataset.id = item.id;
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", "Activer " + module.meta.name);
  label.append(toggle, element("span", "switch-track"));
  const controls = element("div", "tool-controls");
  controls.append(label);
  row.append(title, controls);
  card.append(row);
  if (item.lastError) {
    const error = element("p", "error-text", item.lastError);
    error.setAttribute("role", "alert");
    card.append(error);
  }
  if (!item.sourceAllowed)
    card.append(action("Autoriser le serveur", "restore", item.id, "secondary"));
  if (item.pendingUpdate) card.append(updatePanel(item, updateDeferred));
  const details = element("details", "module-details");
  const summary = element("summary", "tool-menu-toggle", "⋯");
  summary.setAttribute("aria-label", "Détails de " + module.meta.name);
  summary.title = "Afficher ou masquer les détails";
  details.append(summary);
  const check = action("", "check", item.id, "text-button icon-button");
  check.setAttribute("aria-label", "Vérifier les mises à jour");
  check.title = "Vérifier les mises à jour";
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", "24");
  icon.setAttribute("height", "24");
  icon.setAttribute("fill", "currentColor");
  icon.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute(
    "d",
    "M17.65 6.35A7.95 7.95 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z",
  );
  icon.append(path);
  check.append(icon);
  controls.append(check);
  const info = element("div", "tool-info");
  const stats = element("dl", "stats");
  for (const [name, value] of [
    ["Dernière vérification", formatDate(item.lastChecked)],
    ["Dernière installation", formatDate(module.updatedAt)],
    ["Source", module.sourceUrl],
  ]) {
    const group = element("div");
    group.append(element("dt", "", name), element("dd", "", value));
    stats.append(group);
  }
  info.append(stats, action("Désinstaller", "remove", item.id, "text-button danger"));
  details.append(info);
  card.append(details);
  return card;
}
