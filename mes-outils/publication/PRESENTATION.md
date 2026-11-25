# Présentation de Mes outils

## Nom

Mes outils

## Résumé (identique au manifeste)

Gérez vos outils JavaScript : installation confirmée, activation et vérification horaire des mises à jour à approuver.

## Langue et catégorie proposées

Français. Catégorie : Productivité, ou catégorie équivalente proposée dans le tableau de bord.

## Description détaillée

Copier la description ci-dessous, puis le paragraphe de démarrage du fichier `fiches/` correspondant au store. Les autres sections sont des consignes pour l’éditeur.

Mes outils vous permet d’installer et de gérer vos outils JavaScript sur les sites HTTPS autorisés depuis une seule extension.

Ajoutez un lien HTTPS direct fourni par une source de confiance, examinez le nom, la version et les pages autorisées, puis confirmez l’installation. Gérez plusieurs outils, activez-les, mettez-les en pause ou désinstallez-les indépendamment.

L’extension recherche les nouvelles versions toutes les 60 minutes lorsque le navigateur est disponible. Une mise à jour détectée attend votre approbation : la version installée reste utilisée jusqu’à votre décision. La veille ou l’absence de réseau peuvent retarder la vérification. Les mises à jour ne rechargent pas vos onglets ouverts.

Pour commencer, autorisez les scripts utilisateur selon les indications affichées, ajoutez l’adresse HTTPS directe de votre outil et confirmez l’installation en autorisant les sites indiqués. Enregistrez votre travail avant d’actualiser les pages concernées.

Les outils sont des scripts utilisateur JavaScript autonomes. Ils sont limités aux pages correspondant à leurs règles @match et peuvent lire ou modifier les pages autorisées. Utilisez uniquement des outils dont vous connaissez la source et le comportement. Les scripts ne sont pas fournis automatiquement : leur lien est communiqué par votre équipe ou leur auteur.

Le gestionnaire conserve ses outils et leur état localement dans le navigateur, sans compte ni télémétrie intégrés. Les connexions aux serveurs choisis servent au téléchargement des outils et de leurs versions. Le comportement des scripts installés dépend de leur propre code ; consultez la politique de confidentialité et les informations de leur auteur.

La mise en pause ou la suppression bloque les prochaines injections. Pour retirer les effets d’un script déjà exécuté, enregistrez votre travail puis actualisez la page. Le format pris en charge est volontairement limité et ne comprend pas toutes les fonctions de Tampermonkey.

Les outils s’exécutent après le chargement du DOM et la vérification de leur autorisation. Seul le mode document-idle est pris en charge ; les outils nécessitant document-start ou document-end ne sont pas compatibles.

## Distribution et contact

Éditeur et assistance : Pierrick — pierrick.extension@gmail.com. Le dépôt source peut rester privé. La politique intégrée est exportée pendant la construction dans `dist/publication/site/privacy.html` ; renseigner son URL HTTPS réelle dans le formulaire de publication après hébergement.
