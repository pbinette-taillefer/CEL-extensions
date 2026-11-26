(() => {
  const FLAG = "__mesOutilsTinyMCEBridgeV1";
  if (window[FLAG]) return;
  const REQUEST = "mes-outils:tinymce:request";
  const RESPONSE = "mes-outils:tinymce:response";
  const sessions = new Map();
  let currentEditor, editorKey = 0;
  const ownProps = (node) => Object.fromEntries([...node.attributes]
    .filter((attr) => attr.name.startsWith("data-prop-"))
    .map((attr) => [attr.name, attr.value]));

  function editorFor(id) {
    const editor = window.tinymce?.get(id);
    if (!editor?.initialized || editor.removed || !editor.getBody())
      throw new Error("Cet éditeur n’est plus disponible. Rouvrez le menu.");
    return editor;
  }
  function pageInfo(editor) {
    const body = editor.getBody();
    const template = body?.getAttribute("data-cel-template") || "";
    return { template,
      courseCode: body?.getAttribute("data-cel-course-code") || "",
      compatible: template === "handlebars" };
  }
  function writable(editor) {
    if (!pageInfo(editor).compatible)
      throw new Error("Cette page doit utiliser le template Handlebars pour modifier ses composants.");
    if (editor.mode?.isReadOnly()) throw new Error("Cet éditeur est en lecture seule.");
  }
  function restore(session, restoreSelection = true) {
    const editor = editorFor(session.editor.id);
    if (editor !== session.editor || editor.getContent() !== session.content ||
        pageInfo(editor).courseCode !== session.courseCode)
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
    state() {
      const editor = (window.tinymce?.get() || []).find((editor) => editor.initialized && !editor.removed);
      if (editor !== currentEditor) { currentEditor = editor; editorKey++; }
      return editor ? { id: editor.id, key: editorKey, ...pageInfo(editor),
        readonly: !!editor.mode?.isReadOnly(),
        fullscreen: !!editor.plugins?.fullscreen?.isFullscreen() } : null;
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
      sessions.set(token, { editor, nodes, bookmark, content: editor.getContent(),
        courseCode: pageInfo(editor).courseCode, created: Date.now() });
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
