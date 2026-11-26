// ==UserScript==
// @name Composants CEL — prototype
// @namespace cel
// @version 0.2.0
// @description Insérer les composants MED et modifier leurs options dans le WYSIWYG D2L.
// @match https://cforp.desire2learn.com/*
// @grant none
// @run-at document-idle
// @inject-into page
// ==/UserScript==
(() => {
  const FLAG = "__mesOutilsTinyMCEBridgeV1";
  if (window[FLAG]) return;
  const REQUEST = "mes-outils:tinymce:request";
  const RESPONSE = "mes-outils:tinymce:response";
  const sessions = new Map();
  const editorKeys = new WeakMap();
  let nextEditorKey = 0;
  const ownProps = (node) => Object.fromEntries([...node.attributes]
    .filter((attr) => attr.name.startsWith("data-prop-"))
    .map((attr) => [attr.name, attr.value]));

  function editorFor(id) {
    const editor = window.tinymce?.get(id);
    if (!editor?.initialized || editor.removed || !editor.getBody())
      throw new Error("Cet éditeur n’est plus disponible. Rouvrez le menu.");
    return editor;
  }
  function writable(editor) {
    if (editor.mode?.isReadOnly()) throw new Error("Cet éditeur est en lecture seule.");
  }
  function restore(session, restoreSelection = true) {
    const editor = editorFor(session.editor.id);
    if (editor !== session.editor || editor.getContent() !== session.content)
      throw new Error("Le contenu a changé depuis l’ouverture du formulaire. Rouvrez-le.");
    writable(editor);
    if (restoreSelection) {
      editor.focus();
      editor.selection.moveToBookmark(session.bookmark);
    }
    return editor;
  }
  function transaction(editor, operation) {
    editor.undoManager.transact(operation);
    editor.nodeChanged();
    editor.setDirty(true);
    editor.dispatch("input");
    editor.dispatch("change");
  }
  function validateProps(props) {
    if (!props || typeof props !== "object" || Array.isArray(props) || Object.keys(props).length > 30)
      throw new Error("Options invalides.");
    for (const [name, value] of Object.entries(props)) {
      if (!/^data-prop-[a-z][a-z0-9-]{0,80}$/.test(name) ||
          (value !== null && (typeof value !== "string" || value.length > 500)))
        throw new Error("Option de composant invalide.");
    }
  }
  const actions = {
    list() {
      return (window.tinymce?.get() || []).filter((editor) => editor.initialized && !editor.removed)
        .map((editor) => {
          if (!editorKeys.has(editor)) editorKeys.set(editor, `editor-${++nextEditorKey}`);
          return { id: editor.id, key: editorKeys.get(editor),
            readonly: !!editor.mode?.isReadOnly(),
            fullscreen: !!editor.plugins?.fullscreen?.isFullscreen() };
        });
    },
    focus({ editorId }) {
      editorFor(editorId).focus();
      return true;
    },
    mount({ editorId, hostId }) {
      const editor = editorFor(editorId);
      const host = document.getElementById(hostId);
      const container = editor.getContainer();
      if (!host?.hasAttribute("data-cel-components-toolbar") || !container?.parentNode)
        throw new Error("Impossible de placer le menu près de l’éditeur.");
      container.before(host);
      return true;
    },
    capture({ editorId }) {
      const editor = editorFor(editorId);
      writable(editor);
      const nodes = [];
      const body = editor.getBody();
      let node = editor.selection.getNode();
      while (node && node !== body && body.contains(node)) {
        if (node.nodeType === 1 && node.matches('[data-component][data-component-type="med"]')) nodes.push(node);
        node = node.parentElement;
      }
      const token = crypto.randomUUID();
      // Simple bookmarks don't insert marker elements in the saved document.
      const bookmark = editor.selection.getBookmark(2, true);
      while (sessions.size >= 32) sessions.delete(sessions.keys().next().value);
      sessions.set(token, { editor, nodes, bookmark, content: editor.getContent(), created: Date.now() });
      return { token, components: nodes.map((element, index) => ({
        index, name: element.getAttribute("data-component"), props: ownProps(element),
      })) };
    },
    release({ token }) { sessions.delete(token); return true; },
    insert({ token, html }) {
      const session = sessions.get(token);
      if (!session) throw new Error("La sélection a expiré. Rouvrez le menu.");
      if (typeof html !== "string" || html.length > 500_000) throw new Error("HTML de composant invalide.");
      const editor = restore(session);
      const template = document.createElement("template");
      template.innerHTML = html;
      const blocks = editor.schema.getBlockElements();
      const hasBlock = [...template.content.children].some((element) => blocks[element.localName]);
      const slot = editor.selection.getNode()?.closest("[data-slot]");
      if (hasBlock && slot?.tagName === "SPAN")
        throw new Error("Placez le curseur dans un paragraphe hors de cette zone de texte pour insérer ce composant.");
      // An editable paragraph after block components lets the author continue below them.
      transaction(editor, () => editor.insertContent(html + (hasBlock ? "<p><br></p>" : "")));
      sessions.delete(token);
      return true;
    },
    update({ token, index, props }) {
      validateProps(props);
      const session = sessions.get(token);
      const node = session?.nodes[index];
      if (!node || !session.editor.getBody()?.contains(node))
        throw new Error("Le composant n’est plus disponible. Rouvrez ses options.");
      const name = node.getAttribute("data-component");
      if (name === "grid" && "data-prop-type" in props &&
          (node.getAttribute("data-prop-type") === "triple") !== (props["data-prop-type"] === "triple"))
        throw new Error("Insérez une nouvelle grille pour changer le nombre de colonnes.");
      if (name === "artefact" && "data-prop-type" in props &&
          (node.getAttribute("data-prop-type") === "pdf") !== (props["data-prop-type"] === "pdf"))
        throw new Error("Insérez un nouvel artefact pour passer au format PDF ou quitter ce format.");
      if (name === "mediaimage" && "data-prop-media-type" in props &&
          (props["data-prop-media-type"] || "image") !== (node.getAttribute("data-prop-media-type") || "image"))
        throw new Error("Insérez un nouveau média pour passer de l’image à la vidéo.");
      if ("data-prop-modalid" in props && props["data-prop-modalid"] !== node.getAttribute("data-prop-modalid"))
        throw new Error("L’identifiant partagé d’une modale ne se modifie pas dans ce prototype.");
      const editor = restore(session, false);
      if (Object.entries(props).some(([key, value]) => node.getAttribute(key) !== value)) transaction(editor, () => {
        for (const [key, value] of Object.entries(props)) editor.dom.setAttrib(node, key, value);
      });
      sessions.delete(token);
      return true;
    },
  };
  window.addEventListener(REQUEST, (event) => {
    if (typeof event.detail !== "string" || event.detail.length > 1_000_000) return;
    let request;
    try { request = JSON.parse(event.detail); } catch { return; }
    if (!request || typeof request.id !== "string" || request.id.length > 100) return;
    for (const [token, session] of sessions) if (Date.now() - session.created > 600_000) sessions.delete(token);
    let response;
    try {
      if (!Object.hasOwn(actions, request.op)) throw new Error("Opération TinyMCE inconnue.");
      response = { id: request.id, ok: true, result: actions[request.op](request) };
    } catch (error) { response = { id: request.id, ok: false, error: error.message }; }
    window.dispatchEvent(new CustomEvent(RESPONSE, { detail: JSON.stringify(response) }));
  });
  window[FLAG] = true;
})();

(() => {
  if (window.__celComponentsPrototype) return;
  const CATALOG = {"med-nbsp": {"name": "nbsp", "html": "<span class=\"mceNonEditable\" data-component=\"nbsp\"\n              data-component-type=\"med\">&nbsp;</span>"}, "med-artefact": {"name": "artefact", "html": "<span data-component=\"artefact\" data-component-type=\"med\"\n              data-prop-type=\"docx\" class=\"mceNonEditable\">\n              <span data-slot=\"titreartefact\" class=\"mceEditable\" data-placeholder=\"Insérer un titre\">Document du\n                cours</span>\n              <span data-slot=\"gsuitelink\" class=\"mceEditable\"\n                data-placeholder=\"Insérer un lien\">https://docs.google.com/document/d/exemple</span>\n              <span data-slot=\"o365link\" class=\"mceEditable\"\n                data-placeholder=\"Insérer un lien\">https://m365.cloud.microsoft/launch/word?file=exemple</span> </span>"}, "med-artefact-pdf": {"name": "artefact", "html": "<span data-component=\"artefact\" data-component-type=\"med\"\n              data-prop-type=\"pdf\" class=\"mceNonEditable\">\n              <span data-slot=\"titreartefact\" class=\"mceEditable\" data-placeholder=\"Insérer un titre\">Document PDF du\n                cours</span>\n              <span data-slot=\"pdflink\" class=\"mceEditable\"\n                data-placeholder=\"Insérer un lien PDF\">https://example.com/document.pdf</span> </span>"}, "med-boite": {"name": "boite-sans-creator", "html": "<div data-component=\"boite-sans-creator\" data-component-type=\"med\"\n            class=\"mceNonEditable\">\n            <div data-slot=\"default\" class=\"mceEditable\">\n              <p><strong>À retenir :</strong> remplacez ce texte par le contenu souhaité.</p>\n            </div>\n          </div>"}, "med-forum": {"name": "forum", "html": "<div data-component=\"forum\" data-component-type=\"med\" class=\"mceNonEditable\">\n            <div data-slot=\"content\" class=\"mceEditable\">\n              <p>\n                Partagez votre réflexion, puis réagissez avec bienveillance à la publication d’une\n                autre personne.\n              </p>\n            </div>\n            <span data-slot=\"forumLink\" class=\"mceEditable\"\n              data-placeholder=\"Insérer un lien\">https://example.com/forum</span>\n          </div>"}, "med-fullimg": {"name": "fullimg", "html": "<div data-component=\"fullimg\" data-component-type=\"med\"\n            data-prop-fullscreen=\"false\" class=\"mceNonEditable\">\n            <span data-slot=\"image\" class=\"mceEditable\" data-placeholder=\"Insérer une image\">\n              <img src=\"https://picsum.photos/id/1015/1200/600\" alt=\"Paysage montagneux traversé par une rivière\">\n            </span>\n            <span data-slot=\"da\" class=\"mceEditable\" data-placeholder=\"Insérer le droit d’auteur\">© Image de\n              démonstration</span>\n          </div>"}, "med-h5p": {"name": "h5p", "html": "<div data-component=\"h5p\" data-component-type=\"med\" class=\"mceNonEditable\">\n            <span data-slot=\"id\" class=\"mceEditable\" data-placeholder=\"Insérer un identifiant\"></span>\n            <span data-slot=\"title\" class=\"mceEditable\" data-placeholder=\"Insérer un titre\">Activité interactive</span>\n            <span data-slot=\"da\" class=\"mceEditable\" data-placeholder=\"Insérer le droit d’auteur\">© Centre\n              franco</span>\n          </div>"}, "med-ifram": {"name": "ifram", "html": "<div data-component=\"ifram\" data-component-type=\"med\" data-prop-fullscreen=\"true\"\n            class=\"mceNonEditable\">\n            <span data-slot=\"src\" class=\"mceEditable\"\n              data-placeholder=\"Insérer un lien\">https://example.com/activite</span>\n            <span data-slot=\"title\" class=\"mceEditable\" data-placeholder=\"Insérer un titre\">Activité interactive</span>\n            <span data-slot=\"da\" class=\"mceEditable\" data-placeholder=\"Insérer le droit d’auteur\">© Activité de\n              démonstration</span>\n          </div>"}, "med-jwplayer": {"name": "jwplayer", "html": "<div data-component=\"jwplayer\" data-component-type=\"med\"\n            data-prop-hidedescription=\"false\" data-prop-forcevideoplayer=\"false\" class=\"mceNonEditable\">\n            <span data-slot=\"mediaids\" class=\"mceEditable\" data-placeholder=\"Insérer un identifiant\">fNZb4Lwv</span>\n            <span data-slot=\"copyrights\" class=\"mceEditable\" data-placeholder=\"Insérer le droit d’auteur\">©\n              Vidéo de démonstration</span>\n          </div>"}, "med-medialink": {"name": "medialink", "html": "<div data-component=\"medialink\" data-component-type=\"med\"\n            class=\"mceNonEditable\">\n            <span data-slot=\"title\" class=\"mceEditable\" data-placeholder=\"Insérer un titre\">Ressource\n              complémentaire</span>\n            <span data-slot=\"href\" class=\"mceEditable\"\n              data-placeholder=\"Insérer un lien\">https://example.com/ressource</span>\n            <span data-slot=\"image\" class=\"mceEditable\" data-placeholder=\"Insérer une image\">\n              <img src=\"https://picsum.photos/id/20/1000/500\" alt=\"Carnet ouvert sur une table\" />\n            </span>\n            <span data-slot=\"da\" class=\"mceEditable\" data-placeholder=\"Insérer le droit d’auteur\">© Image de\n              démonstration</span>\n            <span data-slot=\"default\" class=\"mceEditable\" data-placeholder=\"Insérer du texte\">Consulter la ressource\n              complémentaire</span>\n          </div>"}, "med-mediaimage-image": {"name": "mediaimage", "html": "<div data-component=\"mediaimage\" data-component-type=\"med\"\n                data-prop-media-position=\"left\" data-prop-media-size=\"1/3\" data-prop-media-type=\"image\"\n                data-prop-fullscreen=\"false\" class=\"mceNonEditable\">\n                <section class=\"d2l-cplus-layout hidden\" tabindex=\"-1\"></section>\n                <span data-slot=\"image\" class=\"mceEditable\" data-placeholder=\"Insérer une image\">\n                  <img src=\"https://picsum.photos/id/1015/900/600\"\n                    alt=\"Rivière qui serpente au pied de montagnes boisées\" />\n                </span>\n                <span data-slot=\"da\" class=\"mceEditable\" data-placeholder=\"Insérer le droit d’auteur\">\n                  © Image de démonstration\n                </span>\n                <div data-slot=\"content\" class=\"mceEditable\">\n                  <p class=\"font-bold\">Observer le paysage</p>\n                  <p>Repère les reliefs qui entourent la rivière et explique comment le paysage guide son parcours.</p>\n                </div>\n              </div>"}, "med-mediaimage-video": {"name": "mediaimage", "html": "<div data-component=\"mediaimage\" data-component-type=\"med\"\n                data-prop-media-position=\"left\" data-prop-media-size=\"1/3\" data-prop-media-type=\"video\"\n                class=\"mceNonEditable\">\n                <section class=\"d2l-cplus-layout hidden\" tabindex=\"-1\"></section>\n                <span data-slot=\"mediaids\" class=\"mceEditable\" data-placeholder=\"Insérer un identifiant JWPlayer\">\n                  fNZb4Lwv\n                </span>\n                <span data-slot=\"da\" class=\"mceEditable\" data-placeholder=\"Insérer le droit d’auteur\">\n                  © Vidéo de démonstration\n                </span>\n                <div data-slot=\"content\" class=\"mceEditable\">\n                  <p class=\"font-bold\">Comprendre le courant</p>\n                  <p>Visionne la vidéo, puis décris les changements de vitesse de l’eau observés.</p>\n                </div>\n              </div>"}, "med-modalbtn": {"name": "modalbtn", "html": "<span data-component=\"modalbtn\" data-component-type=\"med\" data-prop-modalid=\"\"\n            class=\"mceNonEditable\">\n            <span data-slot=\"default\" class=\"mceEditable\" data-placeholder=\"Insérer le texte du bouton\">Ouvrir\n              la fenêtre</span>\n          </span>"}, "med-modalbox": {"name": "modalbox", "html": "<div data-component=\"modalbox\" data-component-type=\"med\" data-prop-modalid=\"\"\n            data-prop-titletag=\"h2\" data-prop-size=\"max-w-lg\" class=\"mceNonEditable\">\n            <div data-slot=\"titre\" class=\"mceEditable\">\n              Titre de la fenêtre\n            </div>\n            <div data-slot=\"contenu\" class=\"mceEditable\">\n              <p>Remplacez ce texte par le contenu à afficher.</p>\n            </div>\n          </div>"}, "med-grid-left": {"name": "grid", "html": "<div data-component=\"grid\" data-component-type=\"med\" data-prop-type=\"left\"\n              class=\"mceNonEditable\">\n              <section class=\"d2l-cplus-layout hidden\" tabindex=\"-1\"></section>\n              <div data-slot=\"column1\" class=\"mceEditable\">\n                <p>Colonne 1</p>\n              </div>\n              <div data-slot=\"column2\" class=\"mceEditable\">\n                <p>Colonne 2</p>\n              </div>\n            </div>"}, "med-grid-right": {"name": "grid", "html": "<div data-component=\"grid\" data-component-type=\"med\"\n              data-prop-type=\"right\" class=\"mceNonEditable\">\n              <section class=\"d2l-cplus-layout hidden\" tabindex=\"-1\"></section>\n              <div data-slot=\"column1\" class=\"mceEditable\">\n                <p>Colonne 1</p>\n              </div>\n              <div data-slot=\"column2\" class=\"mceEditable\">\n                <p>Colonne 2</p>\n              </div>\n            </div>"}, "med-grid-equal": {"name": "grid", "html": "<div data-component=\"grid\" data-component-type=\"med\"\n              data-prop-type=\"equal\" class=\"mceNonEditable\">\n              <section class=\"d2l-cplus-layout hidden\" tabindex=\"-1\"></section>\n              <div data-slot=\"column1\" class=\"mceEditable\">\n                <p>Colonne 1</p>\n              </div>\n              <div data-slot=\"column2\" class=\"mceEditable\">\n                <p>Colonne 2</p>\n              </div>\n            </div>"}, "med-grid-triple": {"name": "grid", "html": "<div data-component=\"grid\" data-component-type=\"med\"\n              data-prop-type=\"triple\" class=\"mceNonEditable\">\n              <section class=\"d2l-cplus-layout hidden\" tabindex=\"-1\"></section>\n              <div data-slot=\"column1\" class=\"mceEditable\">\n                <p>Colonne 1</p>\n              </div>\n              <div data-slot=\"column2\" class=\"mceEditable\">\n                <p>Colonne 2</p>\n              </div>\n              <div data-slot=\"column3\" class=\"mceEditable\">\n                <p>Colonne 3</p>\n              </div>\n            </div>"}, "med-storyline": {"name": "storyline", "html": "<div data-component=\"storyline\" data-component-type=\"med\"\n            data-prop-aspectratio=\"16/9\" data-prop-fullscreen=\"true\" class=\"mceNonEditable\">\n            <span data-slot=\"mamid\" class=\"mceEditable\" data-placeholder=\"Insérer le MAM ID\"></span>\n            <span data-slot=\"title\" class=\"mceEditable\" data-placeholder=\"Insérer un titre\">Activité interactive</span>\n          </div>"}, "med-tableau": {"name": "tableau", "html": "<div data-component=\"tableau\" data-component-type=\"med\" class=\"mceNonEditable\">\n            <div data-slot=\"default\" class=\"mceEditable\">\n              <table>\n                <caption class=\"sr-only\">\n                  Évolution du nombre d’abonnements\n                </caption>\n                <thead>\n                  <tr>\n                    <th scope=\"col\" style=\"text-align: center;\"><strong>Temps (semaines)</strong></th>\n                    <th scope=\"col\" style=\"text-align: center;\"><strong>Nombre d’abonnements</strong></th>\n                  </tr>\n                </thead>\n                <tbody>\n                  <tr>\n                    <td style=\"text-align: center;\"><p>0</p></td>\n                    <td style=\"text-align: center;\"><p>1 200</p></td>\n                  </tr>\n                  <tr>\n                    <td style=\"text-align: center;\"><p>4</p></td>\n                    <td style=\"text-align: center;\"><p>1 313</p></td>\n                  </tr>\n                  <tr>\n                    <td style=\"text-align: center;\"><p>8</p></td>\n                    <td style=\"text-align: center;\"><p>1 437</p></td>\n                  </tr>\n                  <tr>\n                    <td style=\"text-align: center;\"><p>12</p></td>\n                    <td style=\"text-align: center;\"><p>1 572</p></td>\n                  </tr>\n                  <tr>\n                    <td style=\"text-align: center;\"><p>20</p></td>\n                    <td style=\"text-align: center;\"><p>1 882</p></td>\n                  </tr>\n                </tbody>\n              </table>\n            </div>\n          </div>"}};
  const REQUEST = "mes-outils:tinymce:request";
  const RESPONSE = "mes-outils:tinymce:response";
  const pending = new Map();
  const toolbars = new Map();
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
      const editors = await rpc("list");
      for (const [key, toolbar] of toolbars) if (!editors.some((editor) => editor.key === key)) {
        toolbar.close(); toolbar.host.remove(); toolbars.delete(key);
      }
      for (const editor of editors) {
        let toolbar = toolbars.get(editor.key);
        if (!toolbar) {
          toolbar = createToolbar(editor);
          try { await toolbar.mount(); }
          catch (failure) { toolbar.host.remove(); throw failure; }
          toolbars.set(editor.key, toolbar);
        }
        toolbar.setState(editor);
      }
    } catch (failure) { console.warn("Composants CEL :", failure.message); }
    finally { scanning = false; }
  }
  const timer = setInterval(scan, 1500);
  window.__celComponentsPrototype = { stop() {
    clearInterval(timer);
    for (const toolbar of toolbars.values()) { toolbar.close(); toolbar.host.remove(); }
    toolbars.clear();
    window.removeEventListener(RESPONSE, receive);
    for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new Error("Outil arrêté.")); }
    pending.clear();
    delete window.__celComponentsPrototype;
  } };
  scan();
})();
