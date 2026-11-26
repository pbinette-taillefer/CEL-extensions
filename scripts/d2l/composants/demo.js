(async () => {
  const options = {
    license_key: "gpl", height: 430, menubar: false, promotion: false,
    plugins: "code table fullscreen", toolbar: "undo redo | bold italic | table code fullscreen",
    noneditable_class: "mceNonEditable", editable_class: "mceEditable",
    content_style: `body { font: 16px/1.5 system-ui,sans-serif; color:#203b38; padding:8px; }
      [data-component] { outline:1px dashed #80a399; padding:10px; margin:12px 0; }
      [data-slot] { outline:1px dotted #c4d8d1; min-height:1em; }
      img { max-width:200px; height:auto; } table { border-collapse:collapse; } td,th { border:1px solid #a4bdb4; padding:8px; }`,
  };
  await tinymce.init({ ...options, target: document.getElementById("demo-editor") });
  // Exercise a shadow root as used by web component based hosts.
  const shadow = document.getElementById("shadow-editor").attachShadow({ mode: "open" });
  const second = document.createElement("textarea");
  second.id = "demo-second";
  second.value = "<p>Le deuxième éditeur conserve sa propre sélection.</p>";
  shadow.append(second);
  await tinymce.init({ ...options, target: second });
  if (!new URL(location.href).searchParams.has("extension")) {
    for (const src of ["/composants-cel.user.js"]) {
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.append(script);
      });
    }
  }
})();
