# Composants CEL — catalogue du cours

Outil pour le WYSIWYG de `https://cforp.desire2learn.com/` :

- barre compacte **Ajouter · Options** juste au-dessus de l’unique éditeur de la page Handlebars;
- recherche de composants insensible aux accents, navigation au clavier et fermeture par Échap ou clic extérieur;
- favoris accessibles directement dans la barre et conservés dans le navigateur;
- choix d’insertion chargés depuis `editor/catalogue.json` dans les fichiers du cours;
- formulaire **Options du composant…**, y compris depuis un slot ou un composant imbriqué;
- conservation du contenu des slots et des props non exposées;
- insertion et modification des props annulables avec Ctrl+Z;
- ajout des composants avant la sélection, sans remplacer son contenu;
- UUID généré pour chaque paire bouton/modale.

Les slots texte en `span` reçoivent le placeholder insécable prévu par le gabarit.
Un slot vide reçoit aussi une espace insécable pour que TinyMCE le conserve à
l’insertion (notamment l’identifiant H5P et le MAM ID Storyline).

## Installer avec Mes outils

1. Charger/recharger Mes outils **0.2.0** depuis `mes-outils/dist/chrome` ou
   `mes-outils/dist/edge` dans la page des extensions. Activer les scripts utilisateur.
2. Dans la configuration de Mes outils, déplier **Options avancées**, sélectionner
   [`dist/composants-cel.user.js`](dist/composants-cel.user.js), puis **Examiner le fichier**.
3. Examiner l’aperçu **Contexte de la page**, confirmer et autoriser le domaine D2L.
4. Actualiser la page D2L après avoir enregistré le travail en cours.

Le domaine d’exécution est limité à `cforp.desire2learn.com`. Le script 0.6.1 déclare
`@inject-into page` et contient son propre adaptateur TinyMCE. Mes outils reste
générique. Pour modifier la copie locale, réimporter le fichier; le disque n’est pas
surveillé. L’ajout par URL HTTPS directe reste disponible pour une distribution CDN.
Si l’ancien prototype était installé depuis une URL, le désinstaller avant de
passer à une copie locale.

## Reconnaissance du template

Le script gère un seul éditeur TinyMCE par page. Il lit la signature
`data-cel-template="handlebars"` sur son `<body>`. Si TinyMCE a recréé ce corps
sans la signature, il lit le `<body>` du document HTML complet conservé dans le
textarea source de ce même éditeur. Le document est analysé sans exécuter ses scripts.
Une signature sur un `div`, un composant copié ou l’interface D2L ne suffit pas.

La barre est détectée au démarrage puis à l’initialisation de TinyMCE et aux
changements de son état. Si TinyMCE arrive plus tard, une vérification toutes les
100 ms pendant les dix premières secondes permet de s’y abonner rapidement.
Une vérification de secours toutes les 1,5 seconde reste active ensuite, notamment
pour les changements du document source qui n’émettent pas d’événement TinyMCE.

La version du template n’est pas vérifiée. La cote du cours n’est pas affichée
et son absence n’empêche pas l’utilisation du menu. Si elle change pendant
l’ouverture d’un formulaire, il faut rouvrir celui-ci avant d’enregistrer.

La détection est actualisée avec l’état de l’éditeur : retirer la signature
retire le menu, l’ajouter le rend disponible. Le template est aussi revérifié
avant chaque insertion ou modification. Les anciennes pages doivent recevoir
`data-cel-template="handlebars"` sur leur `<body>` pour utiliser cet outil.

Dans TinyMCE, le corps interne de l’éditeur et le `<body>` du fichier HTML sont
deux éléments différents. Retirer la signature du fichier source retire donc
aussi le menu lorsque cette source est utilisée pour la détection.

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

## Catalogue propre au cours

Le script lit le contexte D2L (`content`, `lessons` ou paramètre `ou`), demande la
version LP disponible, puis le `Path` du cours par l’API avec la session courante.
Il charge ensuite **`editor/catalogue.json` à la racine des fichiers du cours**.
Pour un aperçu local ou un fichier ouvert directement, il utilise les liens
existants `editor.css` / `loader.js` ou le chemin `/content/enforced/…/`.
Aucun attribut `data-cel-components-catalog` n’est ajouté au `<body>`.

Le template génère ce JSON en fusionnant la bibliothèque commune avec
`src/editor/catalogue.json`. `template/components.html` lit le même fichier pour
afficher ses choix, ses aperçus et la copie pour D2L, avec les réglages média historiques.
Les définitions `components` portent `type`, `name`, `label`, `fields` et éventuellement
`editNote`. Les `entries` portent `id`, `label`, `type`, `name`, `html` et éventuellement
`uniqueAttributes`. La version du protocole est `1`.

Le cours peut fournir des composants `site`, `med` ou `universal`, sans modifier le
script. Masquer une entrée (`enabled: false` dans la personnalisation du cours)
retire son insertion tout en conservant les définitions de ses options et son
fichier de rendu pour les pages existantes.

Le catalogue est gardé en mémoire pendant la session de l’éditeur; rechargez la
page après l’avoir téléversé à nouveau. Un changement de cours change le catalogue.
Une erreur HTTP ou un JSON invalide s’affiche dans la barre avec une nouvelle
tentative possible. Aucun catalogue embarqué n’est utilisé en secours.
Les droits de lecture du cours par l’API D2L doivent être disponibles au compte.

## Sources et génération

- `src/outil.js` : interface et formulaires construits depuis le catalogue du cours.
- `src/catalogue.mjs` : résolution du cours, chargement, validation et options.
- `tests/fixtures/catalogue.json` : exemple réservé à la démo et aux tests;
  il n’est pas intégré au script installé.
- `build.py` : produit uniquement `dist/composants-cel.user.js`, à installer dans Mes outils.
- `src/editor-adapter.js` : adaptateur TinyMCE propre à cet outil, inclus dans le
  fichier généré et exécuté avec lui dans le contexte de la page.
- `mes-outils/extension/page-execution.js` : exécution générique de la copie approuvée
  après contrôle de l’activation, du mode, des règles et du document émetteur.

Pour régénérer le script générique :

```powershell
python scripts/d2l/composants/build.py
```

Un seul livrable est généré dans `scripts/d2l/composants/dist/` :

```text
dist/
└── composants-cel.user.js   à importer dans Mes outils
```

`dist/` est ignoré par Git. Reconstruisez-le après une modification de `src/`
et avant de lancer les tests ou la démo sur une nouvelle copie du dépôt.
Ce dossier contient l’outil générique; le `dist/` du template Handlebars contient
les fichiers du cours à téléverser dans D2L.

Pour actualiser aussi la fixture de la démo depuis un cours construit :

```powershell
python scripts/d2l/composants/build.py --catalog-dir C:/Users/AdminDev/Repos/cel-template-handlebar/dist/editor
```

`--domain https://autre-instance.example` permet de générer une autre cible explicite.
Une modification du catalogue du cours ne demande pas de reconstruire le script.
Augmenter `@version` dans le générateur avant de distribuer une modification du
outil déjà installé : Mes outils refuse un changement de code à version identique.

## Validation locale

Depuis `mes-outils/` : `npm run check`, `npm test`, puis `npm run package`.

Depuis la racine, après `python scripts/d2l/composants/build.py` :
`node --test --test-isolation=none scripts/d2l/composants/tests/catalogue.test.mjs`.

Le test navigateur utilise le paquet npm officiel **TinyMCE 8.4.0**, extrait dans
`mes-outils/.artifacts/tinymce-8.4.0/package`, et une installation existante de
Playwright. Il charge la vraie extension dans un profil Chromium temporaire et
sert tous les fichiers de D2L par des fixtures; aucun compte D2L n’est utilisé.

```powershell
node scripts/d2l/composants/tests/browser.mjs CHEMIN_VERS_PLAYWRIGHT CHEMIN_VERS_CHROMIUM
```

Pour vérifier la page du catalogue après construction du template :

```powershell
node scripts/d2l/composants/tests/catalogue-page.mjs C:/Users/AdminDev/Repos/cel-template-handlebar/dist CHEMIN_VERS_CHROMIUM
```

Ce parcours vérifie le JSON commun, les 15 sections du design historique, les
20 boutons de copie, la copie Creator+, les deux copies séparées d’une modale avec
UUID partagé et régénération explicite, les médias synchronisés, les quatre grilles,
les liens, l’affichage à 320 px et les erreurs visibles. Un quatrième argument
facultatif fournit un dossier contenant l’ancien `components.html` et son script
pour comparer la géométrie des cartes et capturer les deux versions.

Les pages `demo.html` et `demo.js` servent de fixtures au parcours navigateur.
Elles initialisent TinyMCE; seul Mes outils charge le script installé.
Le test simule un domaine D2L HTTPS, sans connexion à un compte réel.
La fixture servie sur localhost ne correspond pas au domaine D2L autorisé par l’outil.
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

Vérifications du 26 novembre 2026 pour le script **0.4.0** : 7 tests ciblés du
catalogue et 19 scénarios Chromium avec TinyMCE 8.4.0 réussis, ainsi que le parcours
de la page catalogue et les contrôles de Mes outils (33 tests JavaScript, 3 Python).
Deux cours simulés chargent des fichiers distincts; les composants `site`, les
catalogues vides, l’erreur 404 avec nouvelle tentative et les options des anciennes
instances retirées du menu sont couverts. Le template a été construit et ses
3 tests de génération ont réussi. Les paquets Mes outils 0.2.0 ont été reconstruits.
Les appels D2L sont simulés : la validation dans un vrai cours reste à effectuer.

Le build fournit uniquement la version installable dans Mes outils et retire
l’ancienne sortie console si elle est encore présente. Tous les scénarios de
l’outil dans TinyMCE passent par la vraie extension : installation, réimportation,
insertion, changement de cours et nouvelle tentative après un JSON absent.

Version **0.4.1** : correction de la détection des documents HTML complets dont
TinyMCE ne reporte pas les attributs du `<body>` sur son corps interne. Le document
source de l’éditeur est consulté en repli; une signature sur un composant copié
reste refusée. Réimporter `dist/composants-cel.user.js` dans Mes outils, puis
actualiser D2L. Les 7 tests ciblés et les 20 scénarios Chromium passent, y compris
l’insertion dans un document complet sans ajout artificiel de signature.

Version **0.4.2** : détection rapide au démarrage et réaction aux événements de
TinyMCE. Les 7 tests ciblés et les 21 scénarios Chromium passent. Avec un éditeur
initialisé après le script, la barre est apparue en 102 ms dans le test local,
mesurés à partir de la fin d’initialisation de TinyMCE (seuil du test : 500 ms).

Version **0.4.3** : les nouveaux composants sont insérés au début de la sélection,
sans remplacer son contenu. Le menu conserve aussi la sélection d’un composant
entier dans TinyMCE. Les 7 tests ciblés et les 22 scénarios Chromium passent,
dont la conservation du texte, de plusieurs paragraphes sélectionnés à rebours et
d’un composant entier, avec annulation et rétablissement. Réimporter
`dist/composants-cel.user.js` dans Mes outils, puis actualiser D2L.

Version **0.5.0** : interface allégée, fond blanc et bordures neutres accordés au
WYSIWYG, petite signature CEL bleue et boutons Ajouter / Options avec icônes.
Le menu propose une recherche sans accents, un état sans résultat et une navigation
avec les flèches; Entrée ouvre l’unique résultat et Échap rend le focus au bouton.
La sélection TinyMCE est conservée dès l’ouverture du menu, y compris pendant la
recherche. Les formulaires affichent les noms lisibles des composants, un bouton
de fermeture et une action principale bleue. Les confirmations disparaissent
après six secondes; les erreurs restent visibles.

Validation locale : 7 tests du catalogue et 23 scénarios Chromium réussis avec
TinyMCE 8.4.0, dont la recherche, le clavier, l’affichage à 320 px et l’insertion
avant une sélection de texte ou de composant après recherche. Contrôles Mes outils :
33 tests JavaScript et 3 tests Python réussis. Réimporter le script généré dans
Mes outils, puis actualiser D2L. L’intégration dans un cours D2L réel reste à vérifier.

Version **0.5.1** : retrait du repère CEL de la barre et des en-têtes des
formulaires. Le bouton Options est désactivé lorsque le curseur ne se trouve pas
dans un composant; il devient disponible dans le composant ou ses slots, y compris
les composants imbriqués. Son état suit les changements de sélection TinyMCE.
Les 7 tests du catalogue et les 24 scénarios Chromium passent. Réimporter le script
généré dans Mes outils, puis actualiser D2L.

Version **0.5.2** : les composants sans options configurables sont insérés
directement au choix dans le menu, sans fenêtre intermédiaire. Les composants
avec options conservent leur formulaire. L’insertion directe garde la sélection,
rend le focus à l’éditeur et s’annule avec Ctrl+Z. Les 7 tests du catalogue et les
25 scénarios Chromium passent, y compris les 19 entrées du catalogue.

Version **0.6.0** : une étoile à droite de chaque composant dans le menu Ajouter
permet de l’ajouter aux favoris ou de le retirer. Les favoris apparaissent comme
boutons dans la barre et utilisent le même parcours d’insertion : ajout direct
sans options, formulaire sinon. Le menu conserve toutes les entrées pour gérer
les étoiles. La barre revient à la ligne sur les petits écrans.

Les favoris sont stockés localement dans ce navigateur pour le domaine D2L, sans
modifier le contenu du cours. Ils sont partagés entre les onglets et retrouvés au
rechargement. Seuls les favoris disponibles dans le catalogue du cours courant
sont affichés; les préférences des autres composants sont conservées. Supprimer
les données du site efface ces préférences.

Validation : 7 tests du catalogue et 26 scénarios Chromium réussis, dont l’ajout
et le retrait des favoris au clavier, leur persistance, les raccourcis avec ou
sans options, Ctrl+Z, le retour du focus, l’affichage à 320 px et le changement de
catalogue. Réimporter le script généré dans Mes outils, puis actualiser D2L.

Version **0.6.1** : barre bleu pâle avec un fin accent bleu, bouton Ajouter bleu
et favoris sous forme de boutons blancs sans étoile. Options est aligné à droite;
sur petit écran, les favoris occupent une ligne sous les actions. Les étoiles du
menu Ajouter servent toujours à gérer les favoris. Les 7 tests du catalogue et
26 scénarios Chromium passent; captures vérifiées sur ordinateur et à 320 px.
