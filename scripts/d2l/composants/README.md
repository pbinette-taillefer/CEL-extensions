# Prototype Composants CEL

Outil autonome pour le WYSIWYG de `https://cforp.desire2learn.com/` :

- dropdown **Composants CEL** juste au-dessus de l’unique éditeur de la page Handlebars;
- 19 choix d’insertion issus des 20 fragments du catalogue MED (bouton et modale sont réunis);
- formulaire **Options du composant…**, y compris depuis un slot ou un composant imbriqué;
- conservation du contenu des slots et des props non exposées;
- insertion et modification des props annulables avec Ctrl+Z;
- UUID généré pour chaque paire bouton/modale.

Les slots texte en `span` reçoivent le placeholder insécable prévu par le gabarit.
Un slot vide reçoit aussi une espace insécable pour que TinyMCE le conserve à
l’insertion (notamment l’identifiant H5P et le MAM ID Storyline).

## Essayer immédiatement dans D2L

Ouvrir une page de contenu en édition, puis les outils de développement du navigateur.
Dans **Sources → Snippets**, créer un snippet, y coller tout le contenu de
[`prototype-console.js`](prototype-console.js), puis l’exécuter dans le contexte
où `tinymce` est accessible. Cette variante contient à la fois l’adaptateur et
l’interface. Elle dure jusqu’au prochain rechargement de page et ne s’installe pas.

Pour retirer ce prototype temporaire sans recharger :

```js
window.__celComponentsPrototype.stop();
```

Utiliser un seul mode à la fois : snippet temporaire **ou** installation Mes outils.

## Installer avec Mes outils

1. Charger/recharger Mes outils **0.2.0** depuis `mes-outils/dist/chrome` ou
   `mes-outils/dist/edge` dans la page des extensions. Activer les scripts utilisateur.
2. Dans la configuration de Mes outils, déplier **Options avancées**, sélectionner
   [`composants-cel.user.js`](composants-cel.user.js), puis **Examiner le fichier**.
3. Examiner l’aperçu **Contexte de la page**, confirmer et autoriser le domaine D2L.
4. Actualiser la page D2L après avoir enregistré le travail en cours.

Le domaine d’exécution est limité à `cforp.desire2learn.com`. Le script 0.3.1 déclare
`@inject-into page` et contient son propre adaptateur TinyMCE. Mes outils reste
générique. Pour modifier la copie locale, réimporter le fichier; le disque n’est pas
surveillé. L’ajout par URL HTTPS directe reste disponible pour une distribution CDN.
Si l’ancien prototype était installé depuis une URL, le désinstaller avant de
passer à une copie locale.

## Reconnaissance du template

Le script gère un seul éditeur TinyMCE par page et lit son `<body>`. Le menu
apparaît seulement si ce corps porte `data-cel-template="handlebars"`. Une signature sur un `div`,
sur un composant copié ou sur l’interface D2L ne suffit pas.

La version du template n’est pas vérifiée. La cote du cours n’est pas affichée
et son absence n’empêche pas l’utilisation du menu. Si elle change pendant
l’ouverture d’un formulaire, il faut rouvrir celui-ci avant d’enregistrer.

La détection est actualisée avec l’état de l’éditeur : retirer la signature
retire le menu, l’ajouter le rend disponible. Le template est aussi revérifié
avant chaque insertion ou modification. Les anciennes pages doivent recevoir
`data-cel-template="handlebars"` sur leur `<body>` pour utiliser cet outil.

## Options disponibles

| Composant | Props exposées |
| --- | --- |
| `artefact` | Type Office, en conservant les slots existants; PDF reste une insertion distincte |
| `fullimg`, `ifram` | Plein écran |
| `grid` | Disposition des deux colonnes; trois colonnes à l’insertion |
| `jwplayer` | Masquer la description, forcer le lecteur vidéo |
| `mediaimage` | Position, largeur du média, plein écran; image/vidéo à l’insertion |
| `modalbox` | Largeur et niveau du titre |
| `storyline` | Ratio, plein écran |

**Valeur par défaut du composant** supprime l’attribut correspondant. Une valeur
actuelle non listée reste conservée et sélectionnable. Les autres composants sont
insérables; leurs slots se modifient dans le WYSIWYG.

Le changement image/vidéo, PDF/Office ou deux/trois colonnes demande une nouvelle
insertion dans cette version, car les slots diffèrent. L’identifiant partagé d’une
modale n’est pas modifiable. Aucun contenu de slot n’est supprimé par le formulaire.

Le menu est masqué en lecture seule et en plein écran. Quitter le plein écran pour
retrouver le menu. L’outil ne recrée pas l’éditeur et ne modifie pas sa configuration.
Il ne charge pas le runtime apprenant : le rendu visuel des options dépend du gabarit
et de la prévisualisation habituelle du cours.

## Sources et génération

- `src/outil.js` : interface, formulaires et catalogue des props exposées.
- `catalog.generated.json` : instantané du HTML d’auteur, sans le rendu du runtime;
  le chemin d’origine et l’empreinte du fichier source y sont conservés.
- `build.py` : produit le fichier à installer et le snippet autonome.
- `src/editor-adapter.js` : adaptateur TinyMCE propre à cet outil, inclus dans le
  fichier généré et exécuté avec lui dans le contexte de la page.
- `mes-outils/extension/page-execution.js` : exécution générique de la copie approuvée
  après contrôle de l’activation, du mode, des règles et du document émetteur.

Le dépôt de composants d’origine n’est pas modifié. Pour rafraîchir les fragments :

```powershell
python scripts/d2l/composants/build.py --catalog-dir C:/Users/AdminDev/Repos/cel-template-handlebar/cel-components-library/catalog
```

Pour reconstruire depuis l’instantané, sans dépendance au dépôt voisin :

```powershell
python scripts/d2l/composants/build.py
```

`--domain https://autre-instance.example` permet de générer une autre cible explicite.
Augmenter `@version` dans le générateur avant de distribuer une modification d’un
outil déjà installé : Mes outils refuse un changement de code à version identique.

## Validation locale

Depuis `mes-outils/` : `npm run check`, `npm test`, puis `npm run package`.

Le test navigateur utilise le paquet npm officiel **TinyMCE 8.4.0**, extrait dans
`mes-outils/.artifacts/tinymce-8.4.0/package`, et une installation existante de
Playwright. Il charge la vraie extension dans un profil Chromium temporaire et
sert tous les fichiers de D2L par des fixtures; aucun compte D2L n’est utilisé.

```powershell
node scripts/d2l/composants/tests/browser.mjs CHEMIN_VERS_PLAYWRIGHT CHEMIN_VERS_CHROMIUM
```

La démo sans extension peut se servir localement avec ce même paquet TinyMCE :

```powershell
python scripts/d2l/composants/demo-server.py
```

Ouvrir `http://127.0.0.1:4175`. Le serveur n’écoute que sur la boucle locale.
TinyMCE est une dépendance de test locale et n’est pas livré dans l’outil.

L’essai réel dans D2L reste nécessaire pour confirmer les règles de nettoyage HTML,
le placement du menu et le rechargement du contenu enregistré dans votre instance.

Vérifications du 25 novembre 2026 : contrôles statiques, 33 tests JavaScript et
3 tests Python de Mes outils réussis; intégration Chromium réussie avec TinyMCE
8.4.0, les 19 choix du catalogue, les props, Ctrl+Z au clavier, deux éditeurs dont
un dans un Shadow DOM, les composants imbriqués et le mode autonome. Les paquets
Mes outils 0.2.0 ont été construits pour Chrome, Edge et Firefox. Le parcours
navigateur a été exécuté dans Chromium; Edge et Firefox restent à essayer.

Vérifications du 26 novembre 2026 pour le script **0.3.1** : contrôles statiques,
33 tests JavaScript et 3 tests Python réussis; parcours Chromium complet réussi
avec TinyMCE 8.4.0 et un seul éditeur par page. La détection distingue son corps de
l’interface D2L et des composants copiés, accepte les versions absentes ou
différentes, masque le menu après retrait de la signature et bloque les mutations
si le template change pendant l’ouverture du formulaire. La cote reste invisible.
