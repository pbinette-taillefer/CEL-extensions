# Champs de confidentialité et permissions

## Objectif unique

Permettre à l’utilisateur d’installer, d’activer et de mettre à jour après confirmation ses scripts utilisateur autonomes sur les sites HTTPS déclarés par chaque outil et autorisés par l’utilisateur.

## Justifications à copier

**storage** : conserver localement le code et les métadonnées des outils installés, leurs états et dates, ainsi que les versions en attente ; conserver temporairement l’aperçu dans le stockage de session. Aucune synchronisation entre navigateurs.

**alarms** : déclencher une vérification des versions toutes les 60 minutes et recréer l’alarme au démarrage si nécessaire. Le téléchargement d’une nouvelle version ne l’installe pas sans approbation.

**userScripts** : enregistrer et exécuter les scripts JavaScript choisis et confirmés par l’utilisateur sur les sites autorisés. Le mode par défaut reste isolé dans USER_SCRIPT. Un outil déclarant `@inject-into page` demande au lanceur isolé l’exécution de la copie approuvée dans MAIN, après contrôle de l’empreinte, de l’activation, des règles et du document émetteur. Le site peut interagir avec ce code, sans recevoir les API d’extension.

**Import local** : le sélecteur de fichier dans Options avancées lit seulement le fichier .js choisi. Il ne demande aucune permission supplémentaire, ne conserve pas son chemin complet et ne surveille pas le disque. Le gestionnaire ignore ces outils dans les vérifications réseau et attend une réimportation confirmée pour les remplacer.

**Accès aux sites des outils** : aucun domaine n’est imposé dans le manifeste. À la confirmation, l’extension demande l’accès aux domaines HTTPS explicites déclarés par les règles @match. Les jokers de domaine et les ports ne sont pas acceptés. Une mise à jour ajoutant un domaine nécessite son autorisation avant activation.

**Accès HTTPS optionnel https://*/* ** : les sources des outils sont fournies par l’utilisateur et ne sont pas connues à l’avance. L’extension demande au moment de l’ajout l’autorisation pour l’origine exacte du lien saisi, puis l’utilise pour télécharger ce fichier et ses versions. Elle ne demande pas globalement l’accès à tous les sites. Si la distribution est ensuite limitée à un hébergeur unique, réduire le motif optionnel en conséquence.

## Code distant : déclarer OUI

L’extension télécharge les scripts utilisateur depuis les URL HTTPS explicitement choisies par l’utilisateur. Leur syntaxe est analysée localement avec Acorn embarqué. L’aperçu n’exécute pas le code. Une confirmation installe le fichier exact identifié par SHA-256. Les versions suivantes attendent une nouvelle approbation. Le code s’exécute exclusivement via l’API userScripts, dans USER_SCRIPT par défaut ou dans MAIN si l’outil déclare @inject-into page, sur les pages autorisées. Aucun eval, new Function ou script distant n’est utilisé dans les pages de l’extension ou le service worker.

Le code des outils est téléchargé à la demande, puis uniquement après confirmation pour l’installation. Ce comportement doit être décrit selon le canal de distribution choisi ; le code distant reste du code téléchargé même après son enregistrement local.

Pour Chrome, expliquer le cas particulier des gestionnaires de scripts utilisateur. Pour Edge, la documentation de publication reste restrictive sur le code distant en Manifest V3 : exposer l’usage exact de userScripts aux évaluateurs et obtenir une clarification si nécessaire. Une API disponible n’est pas une garantie d’admissibilité.

Seul document-idle est pris en charge. Les versions stockées avec document-start ou document-end sont bloquées jusqu’à leur remplacement par une version compatible approuvée. Le contrôle d’autorisation asynchrone reste actif.

## Données : base factuelle pour les cases du tableau de bord

La politique publique fait foi avec le comportement réel. Ne pas cocher globalement « aucune donnée traitée » : les URL des sources, le code et les métadonnées sont conservés localement et les serveurs choisis reçoivent les requêtes nécessaires au téléchargement.

- Contenu de site : le code téléchargé et ses métadonnées sont traités et conservés localement ; les outils autorisés peuvent accéder au contenu des pages.
- Historique de navigation : le gestionnaire ne constitue pas un historique des pages visitées. Les URL des sources de scripts sont néanmoins conservées et transmises au serveur concerné lors du téléchargement ; les décrire explicitement.
- Identité, santé, finances, authentification, communications personnelles et localisation précise : aucune collecte de ces catégories n’est mise en œuvre par le gestionnaire. Ne pas extrapoler cette absence aux scripts distribués, qui doivent être examinés selon leur comportement.
- Activité : le gestionnaire conserve l’état d’activation et les dates de gestion des outils ; aucune analyse des clics ou de navigation n’est intégrée.
- L’adresse IP est visible par le serveur du fichier choisi ; le gestionnaire n’ajoute pas de collecte ni de géolocalisation de cette adresse.

Sélectionner les catégories applicables dans le formulaire réel, notamment le contenu traité, conformément à leurs définitions et aux scripts fournis avec la distribution. Les traitements locaux doivent être décrits même sans transmission à l’éditeur. L’absence d’accès au tableau de bord et au code des outils de production ne permet pas de préremplir définitivement toutes les cases.

Les certifications d’utilisation limitée correspondent au gestionnaire livré : aucune vente, aucune publicité personnalisée, aucun usage pour la solvabilité et aucun usage hors des fonctionnalités déclarées. Vérifier leur cohérence avec les outils de production avant certification.

## Particularités des navigateurs

Dans Firefox, userScripts est une permission optionnelle demandée par le bouton de Mes outils. Dans Edge et Chrome, elle est déclarée dans le manifeste et son utilisation doit être activée dans les détails de l’extension.

Le manifeste Firefox déclare `data_collection_permissions.required: ["none"]` pour le gestionnaire livré : aucune collecte de données de pages ni télémétrie transmise à l’éditeur n’est mise en œuvre. Les demandes de fichiers aux serveurs choisis et leurs journaux restent décrits dans la politique. Cette déclaration concerne le gestionnaire ; les outils distribués doivent être décrits selon leur propre comportement.

[API userScripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts) · [Déclaration des données Firefox](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
