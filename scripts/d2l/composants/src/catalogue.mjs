function isIdentifier(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value);
}
const attribute = /^data-prop-[a-z][a-z0-9-]{0,80}$/;

export function validateCatalog(catalog) {
  if (catalog?.version !== 1 || !Array.isArray(catalog.entries) || !Array.isArray(catalog.components))
    throw new Error("Catalogue de composants invalide ou version non prise en charge.");
  const keys = new Set();
  for (const component of catalog.components) {
    const key = `${component.type}:${component.name}`;
    if (!isIdentifier(component.type) || !isIdentifier(component.name) || keys.has(key))
      throw new Error("Définition de composant invalide ou dupliquée.");
    keys.add(key);
    if (!Array.isArray(component.fields)) throw new Error(`Options invalides : ${key}.`);
    for (const field of component.fields) {
      if (!attribute.test(field.attribute) || typeof field.label !== "string" ||
          !["select", "text"].includes(field.type) ||
          (field.type === "select" && (!Array.isArray(field.options) || !field.options.every((option) =>
            typeof option === "string" || (Array.isArray(option) && option.length === 2 && option.every((value) => typeof value === "string"))))) ||
          (field.editGroups !== undefined && (!Array.isArray(field.editGroups) ||
            !field.editGroups.every((group) => Array.isArray(group) && group.every((value) => value === null || typeof value === "string")))))
        throw new Error(`Option invalide : ${key}.`);
    }
  }
  const ids = new Set();
  for (const entry of catalog.entries) {
    if (!isIdentifier(entry.id) || ids.has(entry.id) || typeof entry.label !== "string" ||
        typeof entry.html !== "string" || !keys.has(`${entry.type}:${entry.name}`) ||
        (entry.uniqueAttributes !== undefined && (!Array.isArray(entry.uniqueAttributes) || !entry.uniqueAttributes.every((name) => attribute.test(name)))))
      throw new Error("Entrée de catalogue invalide ou dupliquée.");
    ids.add(entry.id);
  }
  return catalog;
}

export function fieldsFor(component, props) {
  return (component?.fields || []).map((field) => {
    if (!field.editGroups) return field;
    const current = props[field.attribute] ?? null;
    const group = field.editGroups.find((values) => values.includes(current));
    return { ...field, allowDefault: !!group?.includes(null), options: field.options.filter((option) =>
      group?.includes(Array.isArray(option) ? option[0] : option)) };
  });
}

export async function fetchCatalogJson(url) {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Chargement impossible (${response.status}) : ${url}`);
  try { return await response.json(); }
  catch { throw new Error(`Le fichier reçu n’est pas du JSON : ${url}`); }
}

export function courseContext(urls) {
  for (const value of urls) {
    let url;
    try { url = new URL(value); } catch { continue; }
    const match = url.pathname.match(/\/d2l\/le\/(?:content|lessons)\/(\d+)(?:\/|$)/i);
    const orgUnitId = match?.[1] || url.searchParams.get("ou");
    if (/^\d+$/.test(orgUnitId || "")) return { origin: url.origin, orgUnitId };
  }
  return null;
}

export async function courseCatalogUrl(urls) {
  const context = courseContext(urls);
  if (context) {
    const versions = await fetchCatalogJson(`${context.origin}/d2l/api/lp/versions/`);
    if (!/^\d+\.\d+$/.test(versions.LatestVersion || "")) throw new Error("Version de l’API D2L introuvable.");
    const course = await fetchCatalogJson(`${context.origin}/d2l/api/lp/${versions.LatestVersion}/courses/${context.orgUnitId}`);
    if (typeof course.Path !== "string" || !course.Path.startsWith("/") || course.Path.startsWith("//"))
      throw new Error("Dossier des fichiers du cours introuvable.");
    return new URL(`${course.Path.replace(/\/+$/, "")}/editor/catalogue.json`, context.origin).href;
  }
  // Aperçu local ou édition directe d’un fichier : le lien editor.css existe déjà.
  for (const value of urls) {
    let url;
    try { url = new URL(value); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    const enforced = url.pathname.match(/^(\/content\/enforced\/[^/]+)\//i);
    if (enforced) return new URL(`${enforced[1]}/editor/catalogue.json`, url.origin).href;
    if (/\/(?:editor\.css|loader\.js)$/.test(url.pathname)) return new URL("editor/catalogue.json", url).href;
  }
  throw new Error("Impossible de trouver les fichiers de ce cours pour charger editor/catalogue.json.");
}
