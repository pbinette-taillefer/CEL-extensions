# Fiche Edge

Le paquet Edge déclare explicitement le français (`default_locale: fr`) et contient `_locales/fr/messages.json`. Le nom et la description du manifeste sont des références aux messages localisés afin que Partner Center détecte la langue. Si le brouillon affiche seulement English (United States), remplacer son paquet depuis Packages par le ZIP Edge reconstruit puis vérifier les langues de Store listings. L’interface doit encore être confirmée dans le tableau de bord réel.

Utiliser le nom, le résumé et la description de `../PRESENTATION.md`, jusqu’à la section « Distribution et contact » exclue. Le texte à copier ne cite aucun navigateur concurrent.

## Paragraphe de démarrage à ajouter

Nécessite Microsoft Edge 138 ou ultérieur sur ordinateur. Dans les détails de Mes outils sur la page des extensions, activez « Autoriser les scripts utilisateur », puis revenez dans Mes outils pour ajouter votre premier outil.

## Paramètres du tableau de bord

- Visibilité souhaitée : **Hidden**, installation par lien.
- Support : pierrick.extension@gmail.com.
- Politique : URL HTTPS finale de `privacy.html`, à renseigner après hébergement.
- Décrire fidèlement le téléchargement des scripts utilisateur via `userScripts`. La documentation de publication interdit généralement le code distant en Manifest V3 ; demander une clarification à l’équipe d’examen si nécessaire. La compatibilité de l’API ne vaut pas acceptation du paquet.
- Instructions : utiliser celles générées après choix de l’hébergement.
