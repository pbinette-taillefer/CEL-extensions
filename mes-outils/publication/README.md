# Distribution de Mes outils — version 0.1.2

Éditeur et contact : Pierrick — pierrick.extension@gmail.com.
Le dépôt peut rester privé. Les commandes préparent des fichiers locaux ; elles ne publient rien.

## Minimum pour la confidentialité

1. Conserver la politique intégrée `extension/privacy.html`, avec le contact, les données locales, les requêtes aux serveurs, l’accès des scripts aux pages, les finalités et les modalités de suppression. C’est la source unique à maintenir.
2. Héberger sa copie générée `dist/publication/site/privacy.html` à une URL HTTPS stable et accessible sans compte. Fournir cette URL dans les formulaires de publication concernés. Aucun achat de domaine ni publication du dépôt n’est imposé par cette préparation.
3. Remplir les déclarations de données et de permissions à partir du comportement réel. Les scripts de production fournis par l’éditeur doivent aussi être examinés ; la politique du gestionnaire ne suffit pas à certifier tous les scripts.

L’extension peut être non répertoriée : Chrome « Unlisted », Edge « Hidden ». Toute personne possédant le lien peut l’installer. Cette visibilité ne dispense pas de l’examen. Firefox propose une signature avec distribution indépendante (« On your own »), avec gestion des mises à jour du paquet à prévoir selon le canal choisi.

## Construire

Exécuter `npm run package`. La commande vérifie les ressources, exécute les tests et crée les archives de chaque navigateur dans `dist/`. La signature Firefox se fait ensuite auprès de Mozilla. La construction exporte également la politique à héberger.

## Préparer la démonstration quand l’hébergement est choisi

```powershell
npm run prepare:publication -- --base-url https://votre-domaine/mes-outils/
```

L’adresse ci-dessus est un exemple à remplacer par l’URL finale du dossier. La commande produit :

- `dist/publication/site/privacy.html` : copie exacte de la politique intégrée.
- `dist/publication/site/demo/` : page, style et deux versions du script avec les règles `@match` adaptées à l’adresse choisie.
- `dist/publication/INSTRUCTIONS-EXAMEN.md` : instructions privées contenant les URL finales.
- `dist/publication/URLS.txt` : adresses à vérifier après téléversement.

Téléverser le contenu de `site/` au dossier HTTPS indiqué, puis ouvrir les URL réelles. Le fichier `.js` doit répondre directement, sans connexion ni redirection, idéalement avec `Content-Type: text/javascript; charset=utf-8`. Les téléchargements de l’extension utilisent l’origine autorisée explicitement par l’utilisateur.

Les sources `demo/` utilisent un domaine fictif. Elles servent de modèles et de fixtures pour les tests ; utiliser les fichiers générés après choix de l’adresse pour l’examen réel. Les fichiers de démonstration ne sont pas inclus dans les archives de l’extension.

## Fiches et examen

- `FORMULAIRES.md` : réponses champ par champ, liens d’inscription et état de préparation des comptes.
- `TEST-FIREFOX.md` : parcours des dialogues natifs et tableau des résultats à renseigner après observation.
- `PRESENTATION.md` : description commune sans référence à un navigateur concurrent.
- `fiches/chrome.md`, `fiches/edge.md`, `fiches/firefox.md` : démarrage et visibilité propres au canal, à joindre à la description commune.
- `CONFIDENTIALITE-ET-PERMISSIONS.md` : justifications des permissions et du code distant.
- `INSTRUCTIONS-EXAMEN.md` : modèle du parcours avec les résultats attendus.
- `VALIDATION.md` : contrôles réellement effectués et vérifications encore nécessaires.
- `visuels/` : icône et capture de l’interface.

Avant soumission : vérifier les dialogues de permissions et le parcours complet dans les navigateurs stables, renseigner les URL accessibles et les déclarations de données, puis choisir la visibilité. Pour Edge, expliquer l’usage de `userScripts` et faire confirmer son admissibilité si l’examen soulève la restriction du code distant en Manifest V3. La prise en charge technique de l’API ne garantit pas l’acceptation par le store.

## Références officielles

- [Visibilité Chrome et examen identique](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution)
- [Confidentialité Chrome](https://developer.chrome.com/docs/webstore/program-policies/policies#privacy-policy)
- [Publication Edge : visibilité et politique](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension)
- [Signature et distribution Firefox](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/)
