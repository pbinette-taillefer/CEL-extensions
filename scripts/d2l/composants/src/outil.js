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
    :host { all: initial; display: block; position: relative; z-index: 10; font: 14px/1.5 system-ui, sans-serif; color: #203b38; }
    :host([hidden]) { display: none !important; }
    * { box-sizing: border-box; } [hidden] { display: none !important; }
    .bar { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 9px 12px; background: #f0f7f5; border: 1px solid #b9d3ca; border-radius: 8px 8px 0 0; }
    button, select, input { font: inherit; } button, summary { cursor: pointer; }
    button, summary { border: 1px solid #759a90; border-radius: 6px; background: white; padding: 7px 11px; color: #203b38; }
    button:hover, summary:hover { background: #e2efea; } :focus-visible { outline: 3px solid #156cbe; outline-offset: 2px; }
    button:disabled { cursor: default; opacity: .55; } summary { list-style: none; } summary::-webkit-details-marker { display: none; }
    details { position: relative; } .menu { position: absolute; top: calc(100% + 6px); left: 0; width: min(300px, 80vw); max-height: 55vh; overflow: auto; border: 1px solid #aac5bb; border-radius: 8px; background: white; box-shadow: 0 8px 28px #0003; padding: 6px; z-index: 20; }
    .menu button { display: block; width: 100%; text-align: left; border: 0; }
    .badge { font-size: 12px; color: #49665e; } .status { margin: 0; flex-basis: 100%; font-size: 13px; } .error { color: #a02727; }
    dialog { color: #203b38; background: white; border: 1px solid #aac5bb; border-radius: 12px; padding: 24px; width: min(480px, calc(100vw - 32px)); max-height: 85vh; box-shadow: 0 16px 60px #0004; }
    dialog::backdrop { background: #122d2866; } h2 { margin: 0 0 12px; font-size: 21px; line-height: 1.3; }
    label { display: grid; gap: 5px; margin: 15px 0; font-weight: 600; } select, input { width: 100%; padding: 8px; border: 1px solid #849e96; border-radius: 5px; color: #203b38; background: white; }
    p { margin: 10px 0; } .note { font-size: 13px; color: #49665e; } .actions { display: flex; justify-content: end; gap: 8px; margin-top: 22px; } .primary { background: #16634f; color: white; border-color: #16634f; } .primary:hover { background: #104e3e; }
  `;
  function element(tag, content, attributes = {}) {
    const node = document.createElement(tag);
    if (content !== undefined) node.textContent = content;
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    return node;
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
    if (!controls.length) container.append(element("p", "Ce composant n’a pas d’options modifiables dans ce prototype. Son contenu se modifie directement dans l’éditeur.", { class: "note" }));
    if (editing && definition?.editNote) container.append(element("p", definition.editNote, { class: "note" }));
    return () => Object.fromEntries(controls.map((control) => [control.dataset.prop, control.value || null]));
  }

  function createToolbar(editor) {
    const host = element("div", undefined, { id: `cel-components-${crypto.randomUUID()}`, "data-cel-components-toolbar": "", "data-cel-editor-id": editor.id });
    const root = host.attachShadow({ mode: "open" });
    root.append(element("style", css));
    const bar = element("div", undefined, { class: "bar", role: "group", "aria-label": "Composants CEL" });
    const details = element("details");
    const summary = element("summary", "Composants CEL ▾");
    const menu = element("div", undefined, { class: "menu" });
    const edit = element("button", "Options du composant…", { type: "button" });
    const status = element("p", "", { class: "status", role: "status", "aria-live": "polite" });
    const dialog = element("dialog", undefined, { "aria-label": "Options du composant CEL" });
    const form = element("form");
    const heading = element("h2");
    const componentLabel = element("label", "Composant à modifier");
    const componentSelect = element("select");
    componentLabel.append(componentSelect);
    const fieldContainer = element("div");
    const error = element("p", "", { class: "error", role: "alert" });
    const actions = element("div", undefined, { class: "actions" });
    const cancel = element("button", "Annuler", { type: "button" });
    const submit = element("button", "Insérer", { type: "submit", class: "primary" });
    actions.append(cancel, submit);
    form.append(heading, componentLabel, fieldContainer, error, actions);
    dialog.append(form);
    details.append(summary, menu);
    details.addEventListener("toggle", () => { if (details.open) menu.scrollTop = 0; });
    bar.append(details, edit, element("span", "Composants du cours", { class: "badge" }), status);
    // Keep TinyMCE's object selection until the menu captures its bookmark.
    bar.addEventListener("mousedown", (event) => {
      if (event.button === 0 && event.target.closest("button, summary")) event.preventDefault();
    });
    root.append(bar, dialog);
    let catalog, entry, session, model, editing = false, returnToEditor = false, readProps = () => ({}), choices = [];
    function notice(message, failed = false) { status.textContent = message; status.classList.toggle("error", failed); }
    function definitionFor(component) {
      return catalog?.components.find((item) => item.type === component.type && item.name === component.name);
    }
    let loading;
    function load() {
      if (loading) return loading;
      edit.disabled = true;
      notice("Chargement du catalogue du cours…");
      loading = catalogFor(editor).then((value) => {
        if (stopped || !host.isConnected) return;
        catalog = value;
        menu.replaceChildren();
        for (const item of catalog.entries) {
          const button = element("button", item.label, { type: "button" });
          button.addEventListener("click", () => open(item));
          menu.append(button);
        }
        if (!catalog.entries.length) menu.append(element("p", "Aucun composant proposé dans ce cours."));
        edit.disabled = false;
        notice("");
      }).catch((failure) => {
        notice(failure.message, true);
        menu.replaceChildren();
        const retry = element("button", "Réessayer le chargement", { type: "button" });
        retry.addEventListener("click", load);
        menu.append(retry);
      }).finally(() => { loading = null; });
      return loading;
    }
    function close() { if (dialog.open) dialog.close(); }
    dialog.addEventListener("close", () => {
      if (session) rpc("release", { token: session.token }).catch(() => {});
      session = null;
      if (returnToEditor) rpc("focus", { editorId: editor.id }).catch(() => {});
      else (editing ? edit : summary).focus();
      returnToEditor = false;
    });
    cancel.addEventListener("click", close);
    function redraw() {
      const component = choices[Number(componentSelect.value) || 0];
      if (!component) return;
      const definition = definitionFor(component);
      heading.textContent = `${editing ? "Options" : "Insérer"} · ${editing ? definition?.label || component.name : entry.label}`;
      readProps = renderFields(fieldContainer, definition, component.props, editing);
      submit.hidden = editing && !(definition?.fields.length);
    }
    componentSelect.addEventListener("change", redraw);
    async function open(selectedEntry) {
      if (dialog.open || session) return;
      details.open = false;
      editing = !selectedEntry;
      entry = selectedEntry;
      try {
        session = await rpc("capture", { editorId: editor.id });
        if (editing) {
          choices = session.components;
          if (!choices.length) throw new Error("Placez le curseur dans un composant CEL pour modifier ses options.");
        } else {
          model = modelFor(entry);
          const node = targetFor(model, entry);
          choices = [{ name: entry.name, type: entry.type, props: propsOf(node) }];
        }
        componentSelect.replaceChildren(...choices.map((component, index) => element("option", component.name, { value: String(index) })));
        componentLabel.hidden = !editing || choices.length < 2;
        submit.textContent = editing ? "Enregistrer" : "Insérer";
        error.textContent = "";
        redraw();
        dialog.showModal();
      } catch (failure) {
        notice(failure.message, true);
        if (session) rpc("release", { token: session.token }).catch(() => {});
        session = null;
      }
    }
    edit.addEventListener("click", () => open());
    root.addEventListener("keydown", (event) => { if (event.key === "Escape" && !dialog.open) { details.open = false; summary.focus(); } });
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
        notice(editing ? "Options enregistrées. Ctrl+Z pour annuler." : "Composant inséré. Modifiez ses zones éditables dans la page.");
        returnToEditor = true;
        close();
      } catch (failure) { error.textContent = failure.message; }
      finally { submit.disabled = false; }
    });
    document.body.append(host);
    return { host, editor, mount: async () => { await rpc("mount", { editorId: editor.id, hostId: host.id }); load(); }, close,
      setState(state) {
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
        toolbar.close(); toolbar.host.remove(); toolbar = null;
      }
      if (!editor?.compatible) return;
      if (!toolbar) {
        const next = createToolbar(editor);
        try { await next.mount(); }
        catch (failure) { next.host.remove(); throw failure; }
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
    if (toolbar) { toolbar.close(); toolbar.host.remove(); toolbar = null; }
    window.removeEventListener(RESPONSE, receive);
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Outil arrêté.")); }
    pending.clear();
    delete window.__celComponentsPrototype;
  } };
  scan();
})();
