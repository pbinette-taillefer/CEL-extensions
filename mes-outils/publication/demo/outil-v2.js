// ==UserScript==
// @name Démonstration Mes outils
// @namespace mes-outils-demo
// @version 1.0.1
// @description Affiche un bandeau sur la page de démonstration, sans requête réseau.
// @match https://demo.example.test/mes-outils/demo/*
// @grant none
// @run-at document-idle
// @noframes
// ==/UserScript==
(() => {
  if (document.getElementById("mes-outils-demo")) return;
  const banner = document.createElement("p");
  banner.id = "mes-outils-demo";
  banner.textContent = "Mes outils fonctionne · version 1.0.1";
  banner.setAttribute("role", "status");
  Object.assign(banner.style, { padding: "16px", background: "#d9f6e5", color: "#123d2c", border: "2px solid #176e51" });
  document.body.prepend(banner);
})();
