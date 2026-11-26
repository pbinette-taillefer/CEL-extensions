(() => {
  if (window.__celComponentsPrototype) return;
  const CATALOG = /* CEL_CATALOG */ null;
  const REQUEST = "mes-outils:tinymce:request";
  const RESPONSE = "mes-outils:tinymce:response";
  const pending = new Map();
  let toolbar;
  const labels = {
    "med-nbsp": "Espace insécable", "med-artefact": "Document Office", "med-artefact-pdf": "Document PDF",
    "med-boite": "Boîte", "med-forum": "Forum", "med-fullimg": "Image plein écran",
    "med-h5p": "Activité H5P", "med-ifram": "Intégration iframe", "med-jwplayer": "Lecteur JWPlayer",
    "med-medialink": "Carte de ressource", "med-mediaimage-image": "Image et texte",
    "med-mediaimage-video": "Vidéo et texte", "med-modal": "Bouton et fenêtre modale",
    "med-grid-left": "Colonnes 1/3 – 2/3", "med-grid-right": "Colonnes 2/3 – 1/3",
    "med-grid-equal": "Colonnes 1/2 – 1/2", "med-grid-triple": "Trois colonnes",
    "med-storyline": "Activité Storyline", "med-tableau": "Tableau",
  };
  const select = (attribute, label, options) => ({ attribute, label, type: "select", options });
  const bool = (attribute, label) => select(attribute, label, [["true", "Oui"], ["false", "Non"]]);
  const fullscreen = bool("data-prop-fullscreen", "Activer le plein écran");
  // UI labels and editable subset; HTML remains sourced from the shared catalog.
  const fields = {
    artefact: [select("data-prop-type", "Type de document", ["docx", "xlsx", "pptx", "pdf"])],
    fullimg: [fullscreen],
    grid: [select("data-prop-type", "Disposition", [["left", "1/3 – 2/3"], ["right", "2/3 – 1/3"], ["equal", "1/2 – 1/2"], ["triple", "Trois colonnes"]])],
    ifram: [fullscreen],
    jwplayer: [bool("data-prop-hidedescription", "Masquer la description"), bool("data-prop-forcevideoplayer", "Forcer le lecteur vidéo")],
    mediaimage: [select("data-prop-media-position", "Position du média", [["left", "Gauche"], ["right", "Droite"]]),
      select("data-prop-media-size", "Largeur du média", ["1/3", "1/2", "2/3"]), fullscreen],
    modalbox: [select("data-prop-size", "Largeur de la fenêtre", [["max-w-lg", "Petite"], ["max-w-3xl", "Moyenne"], ["max-w-7xl", "Grande"]]),
      select("data-prop-titletag", "Niveau du titre", ["h2", "h3", "h4", "h5", "h6"])],
    storyline: [select("data-prop-aspectratio", "Ratio", ["16/9", "4/3", "1/1"]), fullscreen],
  };

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
  function modelFor(key) {
    const template = document.createElement("template");
    const modalId = crypto.randomUUID();
    template.innerHTML = key === "med-modal"
      ? `${CATALOG["med-modalbtn"].html}${CATALOG["med-modalbox"].html}` : CATALOG[key].html;
    for (const node of template.content.querySelectorAll('[data-prop-modalid]')) node.setAttribute("data-prop-modalid", modalId);
    for (const slot of template.content.querySelectorAll("span[data-slot].mceEditable")) {
      slot.setAttribute("data-placeholder", "\u00a0");
      if (!slot.children.length && !slot.textContent.trim()) slot.textContent = "\u00a0";
    }
    return template;
  }
  function definitionFor(name, props, editing) {
    return (fields[name] || []).map((field) => {
      if (!editing || field.attribute !== "data-prop-type") return field;
      if (name === "grid") return { ...field, options: field.options.filter((option) => (option[0] === "triple") === (props[field.attribute] === "triple")) };
      if (name === "artefact") return { ...field, options: field.options.filter((option) => (option === "pdf") === (props[field.attribute] === "pdf")) };
      return field;
    });
  }
  function renderFields(container, name, props, editing) {
    container.replaceChildren();
    const controls = [];
    for (const field of definitionFor(name, props, editing)) {
      const label = element("label", field.label);
      const control = element(field.type === "select" ? "select" : "input");
      control.dataset.prop = field.attribute;
      const current = props[field.attribute];
      if (field.type === "select") {
        control.append(element("option", "Valeur par défaut du composant", { value: "" }));
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
    if (editing && ["grid", "artefact", "mediaimage"].includes(name)) container.append(element("p", "Le changement du nombre de colonnes, du format PDF ou du type de média se fait en insérant un nouveau composant.", { class: "note" }));
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
    bar.append(details, edit, element("span", "Prototype · MED", { class: "badge" }), status);
    root.append(bar, dialog);
    let session, model, editing = false, returnToEditor = false, readProps = () => ({}), choices = [];
    function notice(message, failed = false) { status.textContent = message; status.classList.toggle("error", failed); }
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
      heading.textContent = `${editing ? "Options" : "Insérer"} · ${component.name}`;
      readProps = renderFields(fieldContainer, component.name, component.props, editing);
      submit.hidden = editing && !(fields[component.name]?.length);
    }
    componentSelect.addEventListener("change", redraw);
    async function open(key) {
      if (dialog.open || session) return;
      details.open = false;
      editing = !key;
      try {
        session = await rpc("capture", { editorId: editor.id });
        if (editing) {
          choices = session.components;
          if (!choices.length) throw new Error("Placez le curseur dans un composant CEL pour modifier ses options.");
        } else {
          model = modelFor(key);
          const node = key === "med-modal" ? model.content.querySelector('[data-component="modalbox"]') : model.content.firstElementChild;
          choices = [{ name: node.getAttribute("data-component"), props: propsOf(node) }];
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
    for (const [key, title] of Object.entries(labels)) {
      const button = element("button", title, { type: "button" });
      button.addEventListener("click", () => open(key));
      menu.append(button);
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
          const node = choices[0].name === "modalbox" ? model.content.querySelector('[data-component="modalbox"]') : model.content.firstElementChild;
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
    return { host, editor, mount: () => rpc("mount", { editorId: editor.id, hostId: host.id }), close,
      setState(state) {
        host.hidden = state.readonly || state.fullscreen;
        if (host.hidden) { close(); details.open = false; }
      } };
  }
  let scanning = false;
  async function scan() {
    if (scanning) return;
    scanning = true;
    try {
      const editor = await rpc("state");
      if (toolbar && (!editor?.compatible || editor.key !== toolbar.editor.key)) {
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
    finally { scanning = false; }
  }
  const timer = setInterval(scan, 1500);
  window.__celComponentsPrototype = { stop() {
    clearInterval(timer);
    if (toolbar) { toolbar.close(); toolbar.host.remove(); toolbar = null; }
    window.removeEventListener(RESPONSE, receive);
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Outil arrêté.")); }
    pending.clear();
    delete window.__celComponentsPrototype;
  } };
  scan();
})();
