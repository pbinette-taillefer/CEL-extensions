# Vérification manuelle Firefox — Mes outils 0.1.2

État au 25 novembre 2026 : **non exécutée** pour les fenêtres natives. Le paquet a déjà été chargé temporairement dans Firefox 161.0. Le contrôle des fenêtres Windows est actuellement indisponible (`native pipe unavailable`), y compris après réinitialisation. Aucun résultat ci-dessous ne doit être marqué réussi sans observation.

## Préparation

Utiliser une fenêtre ou un profil Firefox de test sans données réelles. Construire avec `npm run package`. Ouvrir `about:debugging#/runtime/this-firefox`, choisir « Charger un module complémentaire temporaire » et sélectionner `dist/firefox/manifest.json`.

Pour l’installation d’un outil, utiliser une page HTTPS et un script de démonstration réellement hébergés, préparés avec `npm run prepare:publication -- --base-url URL_HTTPS_DU_DOSSIER`. Les adresses `example.test` du dépôt sont fictives et ne constituent pas un hébergement. L’absence de ces URL n’empêche pas de commencer le test du bouton userScripts.

## A. Autoriser les scripts utilisateur

1. Ouvrir la configuration de Mes outils. Le message « Autorisez les scripts utilisateur pour exécuter vos outils » doit être affiché si la permission n’a jamais été accordée.
2. Cliquer sur « Autoriser les scripts utilisateur ». Firefox doit afficher sa demande native d’autorisation.
3. Refuser ou annuler. Résultat attendu : un message compréhensible indique le refus ; aucun outil ne devient actif et le bouton permet de réessayer.
4. Cliquer de nouveau et accepter. Résultat attendu : l’autorisation est reconnue et le message demandant la permission disparaît.

## B. Autoriser le serveur du script

1. Entrer l’URL HTTPS directe du fichier `demo/outil.js`, puis cliquer sur « Examiner ».
2. Refuser l’accès au serveur quand Firefox le demande. Résultat attendu : le téléchargement ne se poursuit pas et aucun outil n’est installé.
3. Réessayer et accepter. Résultat attendu : l’aperçu affiche le nom « Démonstration Mes outils », la version 1.0.0, la source et les pages autorisées. L’aperçu n’exécute pas le script.

## C. Autoriser un site distinct et installer

L’accès au serveur et l’accès aux pages utilisent tous deux les permissions d’origine. Si le fichier et la page sont sur le même domaine, Firefox peut ne pas redemander une permission déjà accordée : ce comportement est normal.

Pour tester distinctement le refus d’accès aux pages, héberger une copie du script sur une seconde origine HTTPS et conserver un `@match` visant l’origine de la page de démonstration. Le serveur du script et le domaine de la page doivent donc être différents et aucun des deux ne doit être déjà autorisé dans le profil de test.

1. Examiner le script depuis son serveur distinct, en autorisant ce serveur.
2. Cliquer sur « Confirmer l’installation », puis refuser l’accès au domaine de la page. Résultat attendu : l’outil n’est pas installé.
3. Confirmer de nouveau et accepter. Résultat attendu : une carte d’outil activé apparaît.
4. Ouvrir la page de démonstration et recharger. Résultat attendu : bandeau « Mes outils fonctionne · version 1.0.0 ».

## D. Pause, réactivation et suppression

1. Mettre l’outil en pause et recharger la page de test : le bandeau disparaît.
2. Réactiver l’outil et recharger : le bandeau revient.
3. Depuis les détails de l’outil, choisir « Désinstaller » et confirmer. La carte disparaît ; après rechargement, le bandeau disparaît aussi.

La pause ou la suppression n’efface pas le code déjà exécuté dans une page ouverte ; enregistrer son travail et recharger avant de juger le résultat.

## E. Mise à jour et redémarrage

1. Réinstaller la version 1.0.0. Sur le serveur, remplacer le contenu à la même URL par le fichier `outil-v2.js` (1.0.1).
2. Vérifier les mises à jour : la 1.0.1 doit être proposée. Choisir « Plus tard » puis recharger : la 1.0.0 reste active.
3. Approuver la version proposée et recharger : la 1.0.1 s’exécute.
4. Refaire la vérification avec un outil en pause : l’approbation ne le réactive pas.
5. Un chargement temporaire est supprimé au redémarrage de Firefox. Le véritable test de conservation des outils après redémarrage et de mise à jour du paquet doit être effectué avec le paquet signé par Mozilla installé de façon persistante.

## F. Révocation de permissions

Dans `about:addons`, ouvrir Mes outils et ses permissions. Retirer userScripts ou une permission de site accordée, revenir dans Mes outils et recharger la page de test. Vérifier le message d’action requise et la possibilité de mettre en pause ou supprimer l’outil. Rétablir les autorisations depuis les boutons de Mes outils et vérifier le rétablissement après rechargement.

Ne pas confondre le retrait de l’accès au serveur du script avec le retrait de l’accès à son site d’exécution : un retrait du serveur bloque les téléchargements de versions ; il n’interdit pas nécessairement un script déjà approuvé sur un autre domaine toujours autorisé.

## Compte rendu à compléter après exécution

| Contrôle | Résultat constaté |
| --- | --- |
| Version et système | À renseigner |
| Refus puis acceptation de userScripts | Non vérifié |
| Refus puis acceptation du serveur | Non vérifié |
| Refus puis acceptation du site distinct | Non vérifié |
| Exécution, pause et réactivation | Non vérifié |
| Mise à jour en attente puis approuvée | Non vérifié |
| Approbation d’un outil en pause | Non vérifié |
| Suppression et rechargement | Non vérifié |
| Révocation et restauration des permissions | Non vérifié |
| Installation persistante et mise à jour du paquet signé | Non vérifié |

Noter pour chaque erreur l’étape, le texte affiché et la version testée, sans données personnelles ni identifiants.
