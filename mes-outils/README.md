# Mes outils

Extension Manifest V3 pour installer et gérer plusieurs outils JavaScript choisis par l’utilisateur sur les sites HTTPS déclarés par chaque outil et autorisés par l’utilisateur.

Chaque outil possède son activation, sa version et sa désinstallation. Les nouvelles versions sont recherchées toutes les 60 minutes et installées uniquement après approbation. Un outil peut lire et modifier les pages autorisées : utilisez uniquement des sources de confiance.

## Contenu du dépôt

- `extension/` : code commun et manifeste de base pour Chrome et Edge, avec sa politique de confidentialité.
- `manifests/` : paramètres de construction pour Firefox.
- `scripts/` : contrôle statique, construction et préparation des fichiers à héberger.
- `tests/` : tests du gestionnaire, des téléchargements et de la démonstration avec API navigateur simulées.
- `publication/` : présentation, permissions, consignes de distribution et visuels.

## Préparer les versions

Navigateurs de bureau ciblés : Chrome 138+, Edge 138+ et Firefox 140+. Node.js 22+ et Python 3 sont nécessaires pour les commandes ci-dessous. Aucune installation npm n’est nécessaire.

```powershell
npm run check
npm test
npm run package
```

La construction produit `dist/chrome/`, `dist/edge/` et `dist/firefox/`, ainsi que les archives `Mes-outils-Chrome.zip`, `Mes-outils-Edge.zip` et `Mes-outils-Firefox.zip`. Chaque archive contient son manifeste à la racine et uniquement les fichiers de l’extension. Pour construire une seule version : `npm run package -- firefox` (ou `edge`, `chrome`). Les sorties sont exclues de Git.

Le manifeste Firefox utilise un script d’arrière-plan en module et déclare `userScripts` comme permission optionnelle. Les autres versions utilisent un service worker. L’identifiant Firefox `mes-outils@extension.local` est un identifiant technique local, pas une adresse de contact ; il doit rester stable pour les futures versions de la même extension.

La construction exécute les contrôles et les tests avant de créer les archives. Elle exporte aussi la politique dans `dist/publication/site/privacy.html` depuis sa source unique `extension/privacy.html`.

Le paquet Edge déclare le français dans son manifeste et ajoute les messages `_locales/fr/messages.json`, générés à partir du nom et de la description communs. Cette adaptation sert à la détection de la langue dans Partner Center ; elle est appliquée uniquement à la sortie Edge.

## Installer localement

1. Construire les versions avec `npm run package`.
2. Dans Chrome : ouvrir `chrome://extensions`, activer le mode développeur, charger `dist/chrome/`, puis activer « Autoriser les scripts utilisateur » dans les détails de Mes outils.
3. Dans Edge : ouvrir `edge://extensions`, activer le mode développeur, charger `dist/edge/`, puis autoriser les scripts utilisateur dans les détails de l’extension.
4. Dans Firefox : ouvrir `about:debugging#/runtime/this-firefox`, choisir « Charger un module complémentaire temporaire » et sélectionner `dist/firefox/manifest.json`. Dans Mes outils, cliquer sur « Autoriser les scripts utilisateur » pour accorder la permission.
5. Ajouter le lien HTTPS direct d’un fichier `.js` sur le CDN public, autoriser son serveur, examiner l’aperçu, puis confirmer l’installation et autoriser les sites indiqués.
6. Enregistrer le travail en cours et actualiser les pages concernées.

Le chargement temporaire dans Firefox ne remplace pas une installation permanente : la distribution habituelle nécessite un paquet signé par Mozilla. Les scripts ne doivent pas être activés en double dans un autre gestionnaire.

## Format des outils

Les outils sont des fichiers JavaScript `.js` publiés sur un CDN public. Le nom du fichier est libre : aucun suffixe particulier n’est imposé. Le fichier doit conserver l’en-tête de métadonnées ci-dessous pour déclarer son nom, sa version et les pages où il s’exécute.

```javascript
// ==UserScript==
// @name Mon outil
// @namespace mon-equipe
// @version 1.0.0
// @match https://demo.example.test/*
// @grant none
// @run-at document-idle
// @noframes
// ==/UserScript==
(() => { /* Code autonome */ })();
```

`@name`, une version numérique et au moins un `@match` sont obligatoires. Les correspondances et exclusions doivent viser des domaines HTTPS explicites, sans joker de domaine ni port. Les jokers de chemin sont acceptés. L’accès à chaque domaine déclaré par @match est demandé à la confirmation de l’installation ou de la mise à jour. Taille maximale : 1 Mo UTF-8. Les API GM_*, `unsafeWindow`, `@require` et `@resource` ne sont pas prises en charge. Ce gestionnaire n’implémente pas toutes les fonctions de Tampermonkey.

Une pause ou suppression agit sur les injections futures ; actualisez les pages après avoir enregistré. Les scripts sont isolés des variables JavaScript internes de la page, mais ont accès au DOM. La syntaxe est analysée avec Acorn sans exécution pendant l’aperçu ; ceci ne garantit pas la sûreté du code.

Seul `@run-at document-idle` est accepté (également utilisé si la directive est absente). L’outil s’exécute après le chargement du DOM et la vérification asynchrone de son autorisation ; aucun passage avant les scripts de la page ou avant `DOMContentLoaded` n’est garanti. Les anciens outils installés avec `document-start` ou `document-end` sont bloqués avec un message explicite. Leur auteur doit fournir une version compatible ; une mise à jour approuvée peut les rétablir.

## Confidentialité et publication

La [politique de confidentialité](extension/privacy.html) décrit les données locales, les connexions aux serveurs et le comportement des outils. Elle est également accessible depuis l’extension. Éditeur et contact : Pierrick, pierrick.extension@gmail.com.

Le dépôt GitHub est destiné à rester privé. Pour la publication, héberger la politique exportée à une URL HTTPS accessible sans connexion et renseigner cette URL dans les formulaires. Le choix « Unlisted » (Chrome) ou « Hidden » (Edge) masque la recherche mais ne supprime pas l’examen et les obligations de confidentialité. Pour Firefox, utiliser la signature et la distribution indépendante si aucune fiche AMO n’est souhaitée. Aucun hébergement public n’est encore configuré.

Une démonstration sans compte est fournie dans `publication/demo/`. Quand l’adresse du dossier HTTPS est connue, préparer les fichiers avec `npm run prepare:publication -- --base-url https://votre-domaine/mes-outils/` (adresse d’exemple à remplacer). Les fichiers à héberger et les instructions avec leurs URL seront créés dans `dist/publication/`. Voir [les consignes](publication/README.md).

Les outils `.js` sont téléchargés depuis le CDN public, sans cookies, sans identifiants et sans redirection. Le lien fourni doit renvoyer directement le JavaScript. Le dépôt source de l’extension peut rester privé indépendamment de ces fichiers publics.

Suivre les [consignes de distribution](publication/README.md). Le dépôt et ses accès restent gérés par le propriétaire ; aucune mise en ligne ni publication n’est effectuée par les scripts.

## Références techniques

- [API userScripts et autorisations](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts)
- [Arrière-plan des extensions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background)
- [API prises en charge par Edge](https://learn.microsoft.com/microsoft-edge/extensions/developer-guide/api-support)

## Code tiers

Acorn 8.16.0 est embarqué sous licence MIT ; sa licence est conservée dans `extension/vendor/ACORN-LICENSE`. Aucune licence du code propre au projet n’est ajoutée sans choix explicite de l’éditeur.
