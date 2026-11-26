# Présentation de Mes outils

## Nom

Mes outils

## Résumé (identique au manifeste)

Gérez vos outils JavaScript : installation confirmée, activation et vérification horaire des mises à jour à approuver.

## Langue et catégorie proposées

Français. Catégorie : Productivité, ou catégorie équivalente proposée dans le tableau de bord.

## Description détaillée

Copier la description ci-dessous, puis le paragraphe de démarrage du fichier `fiches/` correspondant au store. Les autres sections sont des consignes pour l’éditeur.

Mes outils vous permet d’installer et de gérer vos outils JavaScript depuis une seule extension, sur les sites HTTPS que vous autorisez.

Ajoutez un outil depuis un lien HTTPS direct ou importez un fichier JavaScript local dans les Options avancées. Avant de confirmer, examinez son nom, sa version, ses pages autorisées et son contexte d’exécution.

Gérez plusieurs outils et activez-les, mettez-les en pause ou désinstallez-les indépendamment. Les outils sont isolés du JavaScript du site par défaut. Certains peuvent demander le contexte de la page pour accéder à ses objets et fonctions; ce choix est indiqué dans l’aperçu.

Pour les outils ajoutés par lien, l’extension recherche les nouvelles versions toutes les 60 minutes lorsque le navigateur est disponible. Chaque mise à jour attend votre approbation. La veille ou l’absence de réseau peuvent retarder la vérification.

Les fichiers locaux se mettent à jour par réimportation manuelle. Une copie est conservée dans le navigateur; le fichier d’origine n’est pas surveillé.

Pour commencer, autorisez les scripts utilisateur selon les indications affichées, ajoutez votre outil, puis confirmez l’installation en autorisant les sites indiqués. Enregistrez votre travail avant d’actualiser les pages concernées.

Les outils sont des scripts utilisateur JavaScript autonomes. Ils peuvent lire et modifier les pages autorisées correspondant à leurs règles. Utilisez uniquement des outils provenant de sources de confiance. Les scripts sont fournis par votre équipe ou leur auteur.

Le gestionnaire conserve ses outils et leur état localement dans le navigateur, sans compte ni télémétrie intégrés. Les connexions aux serveurs choisis servent au téléchargement des outils et de leurs versions. Le comportement des scripts installés dépend de leur propre code ; consultez la politique de confidentialité et les informations de leur auteur.

La mise en pause ou la suppression bloque les prochaines injections. Pour retirer les effets d’un script déjà exécuté, enregistrez votre travail puis actualisez la page. Le format pris en charge est volontairement limité et ne comprend pas toutes les fonctions de Tampermonkey.

Les outils s’exécutent après le chargement du DOM et la vérification de leur autorisation. Seul le mode document-idle est pris en charge ; les outils nécessitant document-start ou document-end ne sont pas compatibles.

## Distribution et contact

Éditeur et assistance : Pierrick — pierrick.extension@gmail.com. Le dépôt source peut rester privé. La politique intégrée est exportée pendant la construction dans `dist/publication/site/privacy.html` ; renseigner son URL HTTPS réelle dans le formulaire de publication après hébergement.
