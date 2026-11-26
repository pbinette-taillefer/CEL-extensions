# Visuels de distribution

`icone-128.png` est l’icône 128 × 128 incluse dans le manifeste.

`capture-gestion.png` (1280 × 800 pixels) montre l’interface réelle 0.1.2 avec un outil de démonstration et des réponses réseau simulées. Les noms de domaine example.test sont fictifs et aucune donnée d’élève ni d’employé n’est utilisée. Elle illustre le gestionnaire ; elle ne constitue pas une capture du site de production.

Cette ancienne capture est conservée comme référence. Pour la version 0.2.0, utiliser les PNG suivants, tous de 1280 × 800 pixels :

- `capture-gestion-0.2.0.png` : gestion de deux outils, un local et un HTTPS.
- `capture-import-local-0.2.0.png` : Options avancées et sélection d’un fichier local.
- `capture-apercu-0.2.0.png` : aperçu du fichier, domaines et contexte avant confirmation.

Ces captures montrent l’interface réelle de Mes outils 0.2.0, sans modification de
son HTML ou de ses styles pour la prise de vue. Les outils sont des démonstrations;
la réponse du CDN de démonstration est simulée et aucune donnée d’élève ni d’employé
n’est utilisée. Le domaine D2L est celui fourni pour le prototype; aucun contenu de
cours ni compte connecté n’est capturé. Les images ont été vérifiées visuellement.

Pour les régénérer dans un profil Chromium séparé, depuis `mes-outils/` :

```powershell
node scripts/capture-store.mjs CHEMIN_VERS_PLAYWRIGHT_CORE CHEMIN_VERS_CHROMIUM
```

Le script optionnel `scripts/browser-smoke.mjs` produit également une capture de
test sous `.artifacts/browser-checks/`.
