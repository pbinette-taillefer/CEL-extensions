(async () => {
  const sourceDocument = new URL(location.href).searchParams.has("source-document");
  if (sourceDocument) document.getElementById("demo-editor").value = '<!doctype html><html lang="fr"><head><title>Page du cours</title></head><body data-cel-template="handlebars" data-cel-course-code="HFN1O"><p>Page HTML complète du cours.</p></body></html>';
  const options = {
    license_key: "gpl", height: 430, menubar: false, promotion: false,
    plugins: "code table fullscreen", toolbar: "undo redo | bold italic | table code fullscreen",
    noneditable_class: "mceNonEditable", editable_class: "mceEditable",
    content_css: "/editor.css",
    init_instance_callback(editor) {
      if (!sourceDocument) Object.assign(editor.getBody().dataset, {
        celTemplate: "handlebars", celTemplateVersion: "1",
        celCourseCode: "HFN1O",
      });
      window.__celEditorReadyAt = performance.now();
    },
    content_style: `body { font: 16px/1.5 system-ui,sans-serif; color:#203b38; padding:8px; }
      [data-component] { outline:1px dashed #80a399; padding:10px; margin:12px 0; }
      [data-slot] { outline:1px dotted #c4d8d1; min-height:1em; }
      img { max-width:200px; height:auto; } table { border-collapse:collapse; } td,th { border:1px solid #a4bdb4; padding:8px; }`,
  };
  if (new URL(location.href).searchParams.has("delayed-editor")) {
    const deadline = performance.now() + 5000;
    while (!window.__celComponentsPrototype && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 25));
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await tinymce.init({ ...options, target: document.getElementById("demo-editor") });
})();
