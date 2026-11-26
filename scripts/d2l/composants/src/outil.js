(() => {
  if (window.__celComponentsPrototype) return;
  /* CEL_CATALOG_SERVICE */
  const catalogCache = new Map();
  let stopped = false;
  async function catalogFor(editor) {
    const key = JSON.stringify(editor.urls);
    if (!catalogCache.has(key)) {
      const promise = courseCatalogUrl(editor.urls).then(fetchCatalogJson).then(validateCatalog);
      catalogCache.set(key, promise);
      promise.catch(() => catalogCache.delete(key));
    }
    return catalogCache.get(key);
  }
  const REQUEST = "mes-outils:tinymce:request";
  const RESPONSE = "mes-outils:tinymce:response";
  const CHANGED = "mes-outils:tinymce:changed";
  const pending = new Map();
  const FAVORITES_KEY = "cel:components:favorites:v1";
  function readFavorites() {
    try {
      const value = JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]");
      return new Set(Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
    } catch { return new Set(); }
  }
  const favoriteKey = (entry) => JSON.stringify([entry.type, entry.name, entry.id]);
  let toolbar;


  function rpc(op, data = {}) {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error("L’adaptateur TinyMCE ne répond pas. Rechargez la page avec Mes outils à jour.")); }, 5000);
      pending.set(id, { resolve, reject, timer });
      window.dispatchEvent(new CustomEvent(REQUEST, { detail: JSON.stringify({ id, op, ...data }) }));
    });
  }
  function receive(event) {
    if (typeof event.detail !== "string") return;
    let response;
    try { response = JSON.parse(event.detail); } catch { return; }
    const task = pending.get(response?.id);
    if (!task) return;
    clearTimeout(task.timer);
    pending.delete(response.id);
    if (response.ok) task.resolve(response.result);
    else task.reject(new Error(response.error || "Opération impossible."));
  }
  window.addEventListener(RESPONSE, receive);
  const css = `
    :host { all: initial; display: block; position: relative; z-index: 10; font: 14px/1.5 "Segoe UI", system-ui, sans-serif; color: #263238; color-scheme: light; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; } [hidden] { display: none !important; }
    .bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 8px; background: #f1f6fc; border: 1px solid #cfdeec; border-top: 2px solid #90b7df; border-bottom: 0; border-radius: 8px 8px 0 0; }
    button, select, input { font: inherit; } button, summary { cursor: pointer; }
    button, summary { display: inline-flex; align-items: center; justify-content: center; gap: 7px; min-height: 34px; border: 1px solid transparent; border-radius: 5px; background: transparent; padding: 6px 10px; color: #263238; }
    button:enabled:hover, summary:hover, details[open] summary { background: #eef2f6; } :focus-visible { outline: 2px solid #006fbf; outline-offset: 2px; }
    button:disabled { cursor: default; opacity: .55; } summary { list-style: none; } summary::-webkit-details-marker { display: none; }
    summary { color: #fff; background: #386a9b; border-color: #346394; font-weight: 600; }
    summary:hover, details[open] summary { background: #2c5986; }
    details { position: relative; } .menu { position: absolute; top: calc(100% + 8px); left: -8px; width: min(320px, calc(100vw - 48px)); border: 1px solid #dfe3e7; border-radius: 8px; background: white; box-shadow: 0 8px 24px #182b461f; padding: 8px; z-index: 20; }
    .menu-search { margin-bottom: 6px; } .menu-list { max-height: min(340px, 45vh); overflow-y: auto; overscroll-behavior: contain; }
    .menu-list button { display: flex; justify-content: flex-start; text-align: left; border: 0; padding: 8px 10px; }
    .menu-row { display: flex; align-items: center; gap: 2px; }
    .menu-row [data-entry] { flex: 1; min-width: 0; overflow-wrap: anywhere; }
    .menu-list .favorite-toggle { flex: none; justify-content: center; padding: 8px; color: #667684; }
    .favorite-toggle[aria-pressed="true"] { color: #006fbf; } .favorite-toggle[aria-pressed="true"] .star { fill: currentColor; }
    .favorites { display: flex; align-items: center; flex-wrap: wrap; flex: 1; gap: 6px; min-width: 0; max-width: 100%; }
    .favorites button { min-width: 0; max-width: 100%; min-height: 32px; border-color: #cfdeec; background: #fff; color: #365b80; border-radius: 6px; }
    .favorites button:hover { background: #e4eef9; border-color: #9dbbd9; }
    .favorites span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .menu-list p { padding: 8px; } .icon { width: 16px; height: 16px; flex: none; } .chevron { width: 12px; height: 12px; margin-left: 3px; }
    .edit { margin-left: auto; color: #49627a; }
    .edit:enabled:hover { background: #e0ebf6; }
    @media (max-width: 560px) { .favorites { order: 2; flex-basis: 100%; } .status { order: 3; } }
    .status { margin: 0; flex-basis: 100%; font-size: 12px; padding: 4px 7px; color: #53616d; } .status:empty, .error:empty { display: none; } .error, .status.error { color: #b42318; }
    dialog { color: #263238; background: white; border: 1px solid #dfe3e7; border-radius: 10px; padding: 0; width: min(440px, calc(100vw - 32px)); max-height: 85vh; overflow-y: auto; box-shadow: 0 20px 64px #182b4633; }
    dialog::backdrop { background: #1b253b59; } form { padding: 24px; } .dialog-header { display: flex; align-items: flex-start; gap: 12px; margin-bottom: 20px; } .dialog-titles { flex: 1; min-width: 0; }
    .eyebrow { margin: 0 0 5px; font-size: 12px; color: #53616d; } h2 { margin: 0; font-size: 21px; font-weight: 600; line-height: 1.3; overflow-wrap: anywhere; } .close { padding: 6px; min-width: 32px; min-height: 32px; margin: -6px -6px 0 0; }
    label { display: grid; gap: 7px; margin: 16px 0; font-weight: 600; font-size: 13px; } select, input { width: 100%; min-width: 0; min-height: 38px; padding: 8px 10px; border: 1px solid #b5bdc5; border-radius: 5px; color: #263238; background: white; font-weight: 400; }
    p { margin: 10px 0; } .note { font-size: 13px; color: #53616d; } .actions { display: flex; justify-content: end; gap: 8px; margin-top: 24px; padding-top: 16px; border-top: 1px solid #edf0f3; } .actions button { min-height: 38px; padding: 8px 16px; } .primary { background: #006fbf; color: white; } .primary:hover { background: #005b9c; }
    @media (forced-colors: active) { button, summary { border: 1px solid ButtonText; } }
  `;
  function element(tag, content, attributes = {}) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
  }
  function icon(name) {
    const paths = {
      plus: "M8 3v10M3 8h10",
      chevron: "m4 6 4 4 4-4",
      settings: "M3 4h10M3 12h10M6 2v4M10 10v4",
      close: "m4 4 8 8M12 4l-8 8",
      star: "m8 1.5 2 4.1 4.5.6-3.2 3.2.7 4.5-4-2.1-4 2.1.7-4.5L1.5 6.2l4.5-.6Z",
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const [key, value] of Object.entries({ viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", "stroke-width": "1.5", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true", class: `icon ${name}` })) svg.setAttribute(key, value);
    const path = document.createElementNS(svg.namespaceURI, "path");
    path.setAttribute("d", paths[name]);
    svg.append(path);
    return svg;
  }
  function propsOf(node) {
    return Object.fromEntries([...node.attributes].filter((attr) => attr.name.startsWith("data-prop-")).map((attr) => [attr.name, attr.value]));
  }
  function modelFor(entry) {
    const template = document.createElement("template");
    template.innerHTML = entry.html;
    if (template.content.querySelector("script, iframe, object, embed") ||
        [...template.content.querySelectorAll("*")].some((node) => [...node.attributes].some((attr) =>
          /^on/i.test(attr.name) || /^(href|src|action)$/i.test(attr.name) && /^\s*javascript:/i.test(attr.value))))
      throw new Error("Le fragment du catalogue contient du HTML actif interdit.");
    for (const attribute of entry.uniqueAttributes || []) {
      const id = crypto.randomUUID();
      for (const node of template.content.querySelectorAll(`[${attribute}]`)) node.setAttribute(attribute, id);
    }
    for (const slot of template.content.querySelectorAll("span[data-slot].mceEditable")) {
      slot.setAttribute("data-placeholder", "\u00a0");
      if (!slot.children.length && !slot.textContent.trim()) slot.textContent = "\u00a0";
    }
    return template;
  }
  function targetFor(model, entry) {
    const target = [...model.content.querySelectorAll("[data-component]")].find((node) =>
      node.dataset.component === entry.name && (node.dataset.componentType || "site") === entry.type);
    if (!target) throw new Error("Le fragment ne contient pas le composant attendu.");
    return target;
  }
  function renderFields(container, definition, props, editing) {
    container.replaceChildren();
    const controls = [];
    for (const field of fieldsFor(definition, props)) {
      const label = element("label", field.label);
      const control = element(field.type === "select" ? "select" : "input");
      control.dataset.prop = field.attribute;
      const current = props[field.attribute];
      if (field.type === "select") {
        if (field.allowDefault !== false) control.append(element("option", "Valeur par défaut du composant", { value: "" }));
        for (const option of field.options) {
          const [value, title] = Array.isArray(option) ? option : [option, option.toUpperCase()];
          control.append(element("option", title, { value }));
        }
        if (current !== undefined && ![...control.options].some((option) => option.value === current))
          control.append(element("option", `${current} (valeur actuelle)`, { value: current }));
      }
      control.value = current ?? "";
      label.append(control);
      container.append(label);
      controls.push(control);
    }
    if (!controls.length) container.append(element("p", "Le contenu de ce composant se modifie directement dans l’éditeur.", { class: "note" }));
    if (editing && definition?.editNote) container.append(element("p", definition.editNote, { class: "note" }));
    return () => Object.fromEntries(controls.map((control) => [control.dataset.prop, control.value || null]));
  }

  function createToolbar(editor) {
    const host = element("div", undefined, { id: `cel-components-${crypto.randomUUID()}`, "data-cel-components-toolbar": "", "data-cel-editor-id": editor.id });
    const root = host.attachShadow({ mode: "open" });
    root.append(element("style", css));
    const bar = element("div", undefined, { class: "bar", role: "group", "aria-label": "Composants CEL" });
    const details = element("details");
    const summary = element("summary", undefined, { "aria-label": "Ajouter un composant", "aria-expanded": "false" });
    summary.append(icon("plus"), element("span", "Ajouter"), icon("chevron"));
    const menu = element("div", undefined, { class: "menu" });
    const search = element("input", undefined, { type: "search", placeholder: "Rechercher un composant…", "aria-label": "Rechercher un composant", class: "menu-search" });
    const list = element("div", undefined, { class: "menu-list" });
    const favorites = element("div", undefined, { class: "favorites", role: "group", "aria-label": "Composants favoris", hidden: "" });
    menu.append(search, list);
    const edit = element("button", undefined, { type: "button", class: "edit", "aria-label": "Options du composant…", title: "Placez le curseur dans un composant pour modifier ses options" });
    edit.append(icon("settings"), element("span", "Options"));
    const status = element("p", "", { class: "status", role: "status", "aria-live": "polite" });
    const dialog = element("dialog", undefined, { "aria-labelledby": "cel-dialog-title" });
    const form = element("form");
    const heading = element("h2", undefined, { id: "cel-dialog-title" });
    const eyebrow = element("p", "", { class: "eyebrow" });
    const titles = element("div", undefined, { class: "dialog-titles" });
    titles.append(eyebrow, heading);
    const dismiss = element("button", undefined, { type: "button", class: "close", "aria-label": "Fermer" });
    dismiss.append(icon("close"));
    const header = element("div", undefined, { class: "dialog-header" });
    header.append(titles, dismiss);
    const componentLabel = element("label", "Composant à modifier");
    const componentSelect = element("select");
    componentLabel.append(componentSelect);
    const fieldContainer = element("div");
    const error = element("p", "", { class: "error", role: "alert" });
    const actions = element("div", undefined, { class: "actions" });
    const cancel = element("button", "Annuler", { type: "button" });
    const submit = element("button", "Insérer", { type: "submit", class: "primary" });
    actions.append(cancel, submit);
    form.append(header, componentLabel, fieldContainer, error, actions);
    dialog.append(form);
    details.append(summary, menu);
    let menuCapture, opening = false;
    function releaseMenu() {
      if (menuCapture) menuCapture.then((saved) => rpc("release", { token: saved.token })).catch(() => {});
      menuCapture = null;
    }
    summary.addEventListener("click", () => {
      if (!details.open) {
        search.value = "";
        filter();
        list.scrollTop = 0;
        menuCapture = rpc("capture", { editorId: editor.id });
        menuCapture.catch(() => {});
      }
    });
    details.addEventListener("toggle", () => {
      summary.setAttribute("aria-expanded", String(details.open));
      if (!details.open) releaseMenu();
    });
    bar.append(details, favorites, edit, status);
    // Keep TinyMCE's object selection until the menu captures its bookmark.
    bar.addEventListener("mousedown", (event) => {
      if (event.button === 0 && event.target.closest("button, summary")) event.preventDefault();
    });
    root.append(bar, dialog);
    let hasSelectedComponent = editor.hasSelectedComponent;
    let favoriteIds = readFavorites(), returnTarget = summary;
    let catalog, entry, session, model, editing = false, returnToEditor = false, readProps = () => ({}), choices = [];
    let noticeTimer;
    function notice(message, failed = false, temporary = false) {
      clearTimeout(noticeTimer);
      status.textContent = message;
      status.classList.toggle("error", failed);
      if (temporary) noticeTimer = setTimeout(() => { status.textContent = ""; }, 6000);
    }
    function definitionFor(component) {
      return catalog?.components.find((item) => item.type === component.type && item.name === component.name);
    }
    function renderFavorites() {
      favorites.replaceChildren();
      for (const item of catalog?.entries || []) {
        if (!favoriteIds.has(favoriteKey(item))) continue;
        const button = element("button", undefined, { type: "button", title: item.label, "aria-label": item.label });
        button.append(element("span", item.label));
        button.addEventListener("click", () => open(item, button));
        favorites.append(button);
      }
      favorites.hidden = !favorites.childElementCount;
      for (const button of list.querySelectorAll(".favorite-toggle")) {
        const active = favoriteIds.has(button.dataset.favorite);
        button.setAttribute("aria-pressed", String(active));
        const label = `${active ? "Retirer des favoris" : "Ajouter aux favoris"} : ${button.dataset.label}`;
        button.setAttribute("aria-label", label);
        button.title = label;
      }
    }
    function toggleFavorite(item) {
      // Read the latest preferences so another tab's changes are kept.
      const next = readFavorites();
      const key = favoriteKey(item);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify([...next])); }
      catch { notice("Impossible d’enregistrer les favoris dans ce navigateur.", true); return; }
      favoriteIds = next;
      renderFavorites();
    }
    let loading;
    const normalize = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr");
    function filter() {
      const query = normalize(search.value.trim());
      const buttons = [...list.querySelectorAll("button[data-entry]")];
      for (const button of buttons) button.closest(".menu-row").hidden = !normalize(button.textContent).includes(query);
      const empty = list.querySelector(".no-results");
      if (empty) empty.hidden = buttons.some((button) => !button.closest(".menu-row").hidden);
    }
    search.addEventListener("input", filter);
    function load() {
      if (loading) return loading;
      edit.disabled = true;
      search.disabled = true;
      list.replaceChildren(element("p", "Chargement…", { class: "note" }));
      notice("Chargement du catalogue du cours…");
      loading = catalogFor(editor).then((value) => {
        if (stopped || !host.isConnected) return;
        catalog = value;
        list.replaceChildren();
        for (const item of catalog.entries) {
          const row = element("div", undefined, { class: "menu-row" });
          const button = element("button", item.label, { type: "button", "data-entry": "" });
          button.addEventListener("click", () => open(item));
          const star = element("button", undefined, { type: "button", class: "favorite-toggle", "data-favorite": favoriteKey(item), "data-label": item.label });
          star.append(icon("star"));
          star.addEventListener("click", () => toggleFavorite(item));
          row.append(button, star);
          list.append(row);
        }
        list.append(element("p", catalog.entries.length ? "Aucun composant trouvé." : "Aucun composant proposé dans ce cours.", { class: "note no-results", role: "status" }));
        search.disabled = !catalog.entries.length;
        filter();
        renderFavorites();
        edit.disabled = !hasSelectedComponent;
        notice("");
      }).catch((failure) => {
        notice(failure.message, true);
        list.replaceChildren();
        const retry = element("button", "Réessayer le chargement", { type: "button" });
        retry.addEventListener("click", load);
        list.append(retry);
      }).finally(() => { loading = null; });
      return loading;
    }
    function close() { if (dialog.open) dialog.close(); }
    dialog.addEventListener("close", () => {
      if (session) rpc("release", { token: session.token }).catch(() => {});
      session = null;
      if (returnToEditor) rpc("focus", { editorId: editor.id }).catch(() => {});
      else (editing ? edit : returnTarget.isConnected ? returnTarget : summary).focus();
      returnToEditor = false;
    });
    cancel.addEventListener("click", close);
    dismiss.addEventListener("click", close);
    function redraw() {
      const component = choices[Number(componentSelect.value) || 0];
      if (!component) return;
      const definition = definitionFor(component);
      eyebrow.textContent = editing ? "Options du composant" : "Ajouter un composant";
      heading.textContent = editing ? definition?.label || component.name : entry.label;
      readProps = renderFields(fieldContainer, definition, component.props, editing);
      submit.hidden = editing && !(definition?.fields.length);
    }
    componentSelect.addEventListener("change", redraw);
    async function open(selectedEntry, trigger = summary) {
      if (dialog.open || session || opening) return;
      opening = true;
      const captured = menuCapture;
      menuCapture = null;
      details.open = false;
      editing = !selectedEntry;
      returnTarget = trigger;
      entry = selectedEntry;
      notice("");
      try {
        session = await (captured || rpc("capture", { editorId: editor.id }));
        if (editing) {
          choices = session.components;
          if (!choices.length) throw new Error("Placez le curseur dans un composant CEL pour modifier ses options.");
        } else {
          model = modelFor(entry);
          const node = targetFor(model, entry);
          choices = [{ name: entry.name, type: entry.type, props: propsOf(node) }];
          if (!fieldsFor(definitionFor(choices[0]), choices[0].props).length) {
            await rpc("insert", { token: session.token, html: model.innerHTML });
            await rpc("release", { token: session.token });
            session = null;
            notice("Composant inséré. Modifiez son contenu dans l’éditeur.", false, true);
            await rpc("focus", { editorId: editor.id });
            return;
          }
        }
        componentSelect.replaceChildren(...choices.map((component, index) => element("option", definitionFor(component)?.label || component.name, { value: String(index) })));
        componentLabel.hidden = !editing || choices.length < 2;
        submit.textContent = editing ? "Enregistrer" : "Insérer";
        error.textContent = "";
        redraw();
        notice("");
        dialog.showModal();
        (fieldContainer.querySelector("select, input") || (submit.hidden ? cancel : submit)).focus();
      } catch (failure) {
        notice(failure.message, true);
        if (session) rpc("release", { token: session.token }).catch(() => {});
        session = null;
      } finally { opening = false; }
    }
    edit.addEventListener("click", () => open());
    root.addEventListener("keydown", (event) => {
      if (dialog.open || !details.open) return;
      if (event.key === "Escape") { event.preventDefault(); details.open = false; summary.focus(); }
      const buttons = [...list.querySelectorAll("button")].filter((button) => !button.closest(".menu-row")?.hidden);
      if (["ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        const index = buttons.indexOf(root.activeElement);
        if (event.key === "ArrowUp" && index <= 0) search.focus();
        else buttons[event.key === "ArrowDown" ? (index + 1) % buttons.length : index - 1]?.focus();
      }
      const entries = buttons.filter((button) => button.hasAttribute("data-entry"));
      if (event.key === "Enter" && event.target === search && entries.length === 1) { event.preventDefault(); entries[0].click(); }
    });
    const listeners = new AbortController();
    window.addEventListener("storage", (event) => {
      if (event.key === FAVORITES_KEY || event.key === null) { favoriteIds = readFavorites(); renderFavorites(); }
    }, { signal: listeners.signal });
    document.addEventListener("pointerdown", (event) => {
      if (!event.composedPath().includes(host)) details.open = false;
    }, { capture: true, signal: listeners.signal });
    window.addEventListener("blur", () => { details.open = false; }, { signal: listeners.signal });
    root.addEventListener("focusout", (event) => { if (!root.contains(event.relatedTarget)) details.open = false; });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!session || submit.disabled) return;
      submit.disabled = true;
      try {
        const props = readProps();
        if (editing) {
          const component = choices[Number(componentSelect.value) || 0];
          await rpc("update", { token: session.token, index: component.index, props });
        } else {
          const node = targetFor(model, entry);
          for (const [key, value] of Object.entries(props)) {
            if (value === null) node.removeAttribute(key);
            else node.setAttribute(key, value);
          }
          await rpc("insert", { token: session.token, html: model.innerHTML });
        }
        notice(editing ? "Options enregistrées. Ctrl+Z pour annuler." : "Composant inséré. Modifiez son contenu dans l’éditeur.", false, true);
        returnToEditor = true;
        close();
      } catch (failure) { error.textContent = failure.message; }
      finally { submit.disabled = false; }
    });
    document.body.append(host);
    return { host, editor, mount: async () => { await rpc("mount", { editorId: editor.id, hostId: host.id }); load(); }, close,
      destroy() { close(); releaseMenu(); clearTimeout(noticeTimer); listeners.abort(); host.remove(); },
      setState(state) {
        hasSelectedComponent = state.hasSelectedComponent;
        edit.disabled = !catalog || !hasSelectedComponent || state.readonly;
        host.hidden = state.readonly || state.fullscreen;
        if (host.hidden) { close(); details.open = false; }
      } };
  }
  const startupUntil = Date.now() + 10_000;
  let scanning = false, rescan = false, timer;
  async function scan() {
    if (stopped) return;
    if (scanning) { rescan = true; return; }
    clearTimeout(timer);
    scanning = true;
    try {
      const editor = await rpc("state");
      if (stopped) return;
      if (toolbar && (!editor?.compatible || editor.key !== toolbar.editor.key || JSON.stringify(editor.urls) !== JSON.stringify(toolbar.editor.urls))) {
        toolbar.destroy(); toolbar = null;
      }
      if (!editor?.compatible) return;
      if (!toolbar) {
        const next = createToolbar(editor);
        try { await next.mount(); }
        catch (failure) { next.destroy(); throw failure; }
        toolbar = next;
      }
      toolbar.setState(editor);
    } catch (failure) { console.warn("Composants CEL :", failure.message); }
    finally {
      scanning = false;
      if (!stopped) timer = setTimeout(scan, rescan ? 0 : !toolbar && Date.now() < startupUntil ? 100 : 1500);
      rescan = false;
    }
  }
  window.addEventListener(CHANGED, scan);
  window.__celComponentsPrototype = { stop() {
    stopped = true;
    clearTimeout(timer);
    window.removeEventListener(CHANGED, scan);
    catalogCache.clear();
    if (toolbar) { toolbar.destroy(); toolbar = null; }
    window.removeEventListener(RESPONSE, receive);
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Outil arrêté.")); }
    pending.clear();
    delete window.__celComponentsPrototype;
  } };
  scan();
})();
