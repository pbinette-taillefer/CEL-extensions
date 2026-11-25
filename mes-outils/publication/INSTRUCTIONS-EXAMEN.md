# Instructions privées destinées aux évaluateurs

Le jeton `{{BASE_URL}}` est remplacé par `npm run prepare:publication -- --base-url URL_HTTPS_DU_DOSSIER`. Fournir le document généré, après vérification des URL hébergées.

## Parcours principal à copier dans Test instructions

Mes outils est un gestionnaire de scripts utilisateur choisis par l’utilisateur. Aucun compte n’est requis pour la démonstration. Autoriser les scripts utilisateur avec le bouton de Mes outils si une permission est demandée, ou avec « Autoriser les scripts utilisateur » dans les détails de l’extension selon le navigateur.

1. Ouvrir Mes outils, puis « Ajouter un outil ».
2. Coller `{{BASE_URL}}demo/outil.js`. Autoriser l’origine, cliquer sur « Examiner », puis « Confirmer l’installation » et accepter l’accès au site de démonstration.
3. Ouvrir `{{BASE_URL}}demo/index.html` et recharger. Résultat : un bandeau vert « Mes outils fonctionne · version 1.0.0 » apparaît. Le script ne fait aucune requête réseau et ne lit aucune donnée saisie.
4. Mettre l’outil en pause et recharger : le bandeau disparaît. Le réactiver puis recharger : le bandeau réapparaît.
5. Désinstaller l’outil et recharger : le bandeau disparaît et l’outil n’est plus dans la liste.

La politique est disponible dans l’extension et à `{{BASE_URL}}privacy.html`. Éditeur et assistance : Pierrick — pierrick.extension@gmail.com.

## Vérification d’une mise à jour, avec coordination de l’éditeur

Cette partie nécessite un changement du fichier servi ; le parcours principal ci-dessus est autonome.

1. Installer `demo/outil.js` en version 1.0.0.
2. L’éditeur remplace le contenu servi à cette même URL par celui de `demo/outil-v2.js` (version 1.0.1). Ne pas installer la seconde URL comme un autre outil.
3. Cliquer sur « Vérifier les mises à jour » : la version 1.0.1 est proposée. La version 1.0.0 reste enregistrée tant que l’utilisateur n’approuve pas.
4. Choisir « Plus tard » et recharger la page : le bandeau reste en version 1.0.0.
5. Ouvrir la proposition et cliquer sur « Installer cette version ». Le bandeau d’une page déjà ouverte ne change pas ; après rechargement il affiche la version 1.0.1.
6. Répéter avec l’outil en pause : l’approbation conserve la pause. Restaurer le fichier 1.0.0 sur le serveur pour les prochains tests de première installation.

Les vérifications automatiques sont prévues toutes les 60 minutes quand le navigateur est disponible. Le mode document-idle est le seul pris en charge.

## Avant envoi par l’éditeur

Vérifier que le fichier JavaScript est accessible sans redirection, cookies ni connexion et que son `@match` correspond à la page réelle. Tester le dialogue de permissions dans une installation neuve. Le domaine des modèles du dépôt est fictif ; seul le site généré pour l’hébergement final convient à l’examen. Ne pas joindre d’identifiants ou de données réelles.
