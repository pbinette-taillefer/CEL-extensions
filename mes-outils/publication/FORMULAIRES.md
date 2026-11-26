# Réponses aux formulaires de publication — Mes outils 0.2.0

Actualisé le 25 novembre 2026 à partir de la version 0.2.0. L’utilisateur indique avoir déjà soumis une version, encore en validation. Le tableau de bord et les URL hébergées n’ont pas été consultés dans cette session.

Mise à jour Edge : [tableau de bord Partner Center](https://partner.microsoft.com/dashboard/microsoftedge), puis **Mes outils → Extension overview → Cancel submission** si la version précédente est encore en certification. Mettre à jour le paquet, les textes et la politique, puis sélectionner **Publish**.

## Créer les comptes

| Canal | Inscription officielle | Choix de distribution souhaité |
| --- | --- | --- |
| Chrome | [Inscription Chrome Web Store](https://developer.chrome.com/docs/webstore/register) : compte Google et frais d’inscription uniques. | Unlisted : installation avec le lien. |
| Edge | [Inscription au programme Microsoft Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account) dans Partner Center ; ce programme ne facture pas de frais d’inscription. | Hidden : installation avec le lien. |
| Firefox | [Soumission Mozilla](https://extensionworkshop.com/documentation/publish/submitting-an-add-on/) : se connecter ou créer un compte Mozilla, puis ouvrir le Developer Hub. | On your own : signature, puis distribution du fichier signé. |

La création et l’authentification des comptes, les vérifications d’identité éventuelles et le paiement Chrome doivent être effectués par le propriétaire. Choisir le compte qui doit conserver la propriété de l’extension ; le contact de support peut être différent du compte de connexion. Ne pas mettre de mot de passe, code de validation ou coordonnées de paiement dans le projet.

## Champs communs prêts à copier

### Nom

Mes outils

### Résumé

Gérez vos outils JavaScript : installation confirmée, activation et vérification horaire des mises à jour à approuver.

### Éditeur et contact de support

Pierrick

pierrick.extension@gmail.com

### Objectif unique / Single purpose

Permettre à l’utilisateur d’installer et de gérer ses scripts utilisateur JavaScript, depuis une URL HTTPS ou un fichier local, puis de les exécuter uniquement sur les sites HTTPS qu’il autorise. Chaque outil peut être activé, suspendu, remplacé ou désinstallé indépendamment, après confirmation de ses règles et de son contexte d’exécution.

### Justification storage

Conserver localement le code, les métadonnées, les versions, les règles d’exécution et les états des outils, ainsi que les mises à jour en attente. Pour les fichiers importés, conserver une copie du code et le nom du fichier, sans son chemin complet. Le stockage de session conserve temporairement l’aperçu avant confirmation. Aucune synchronisation ni télémétrie n’est utilisée.

### Justification alarms

Vérifier toutes les 60 minutes les nouvelles versions des outils ajoutés depuis une URL HTTPS, lorsque le navigateur est disponible. Les versions détectées attendent une approbation explicite avant installation. Les outils importés depuis un fichier local sont exclus de ces vérifications.

### Justification userScripts

Enregistrer et exécuter les scripts JavaScript choisis et confirmés par l’utilisateur, uniquement sur les pages HTTPS déclarées par leurs règles et sur les domaines autorisés. Par défaut, ils s’exécutent dans un contexte isolé. Un outil déclarant @inject-into page s’exécute dans le contexte du site après vérification de son activation, de son empreinte et du document cible. Le contexte est présenté avant installation. Les API d’extension ne sont pas exposées au code exécuté dans la page.

### Justification des permissions d’hôte / https://*/*

Les serveurs des outils et leurs sites d’exécution sont choisis par l’utilisateur et ne sont pas connus à l’avance. Le motif HTTPS est optionnel et n’accorde aucun accès global à l’installation. L’extension demande séparément l’origine de téléchargement pour un outil HTTPS et les domaines explicites déclarés par les règles @match. Un import local demande uniquement les domaines d’exécution. Une mise à jour ajoutant un domaine nécessite une nouvelle autorisation.

### Politique de confidentialité / Privacy policy URL

À renseigner après hébergement : URL HTTPS accessible sans compte de la copie générée `dist/publication/site/privacy.html`. Ne pas coller un chemin local, un lien du dépôt privé ou une adresse fictive.

### Description et captures

Utiliser la description commune de `PRESENTATION.md`, le paragraphe de démarrage de `fiches/` correspondant au navigateur et l’icône `visuels/icone-128.png`. Les captures 0.2.0, de 1280 × 800 pixels, sont `visuels/capture-gestion-0.2.0.png`, `visuels/capture-import-local-0.2.0.png` et `visuels/capture-apercu-0.2.0.png`. Elles montrent l’interface réelle avec des outils de démonstration.

## Chrome : code distant

Réponse : **Oui / Yes, I am using remote code**.

Justification à copier :

Mes outils est un gestionnaire de scripts utilisateur. L’utilisateur choisit une URL HTTPS ou un fichier local, examine ses métadonnées et confirme son installation. Les téléchargements utilisent des requêtes sans cookies ni redirection. Les scripts sont analysés sans exécution, conservés localement et exécutés exclusivement via userScripts, dans un contexte isolé par défaut ou dans celui de la page si l’outil le déclare. Les nouvelles versions HTTPS attendent une approbation liée à l’empreinte SHA-256 exacte du fichier. Les fichiers locaux sont remplacés par réimportation confirmée. Aucun code externe n’est exécuté dans l’interface de l’extension ou son service worker.

Voir [l’exception documentée pour les gestionnaires de scripts](https://developer.chrome.com/docs/extensions/develop/migrate/remote-hosted-code#user_scripts_api). La soumission reste soumise à l’examen du store.

## Edge : code distant

Déclarer fidèlement **Oui** si le formulaire demande si l’extension exécute du code téléchargé. Ne pas déclarer « Non » au motif que le code est conservé localement avant son exécution.

Justification à copier :

Mes outils est un gestionnaire de scripts utilisateur. L’utilisateur choisit une URL HTTPS ou un fichier local, examine ses métadonnées et confirme son installation. Le code s’exécute uniquement via l’API userScripts sur les pages autorisées, dans un contexte isolé par défaut ou dans celui de la page si l’outil le déclare. Chaque installation, mise à jour HTTPS et réimportation locale nécessite une confirmation. Aucun code externe n’est exécuté dans l’interface du gestionnaire ou son service worker. Merci d’examiner cet usage de userScripts en tant que gestionnaire de scripts utilisateur.

La [documentation Edge](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension#declare-any-use-of-remote-code) interdit généralement le code distant en Manifest V3. Cette réponse décrit le comportement réel ; elle ne garantit pas son acceptation. Si le tableau de bord bloque cette déclaration, demander une clarification à l’équipe d’examen avant de poursuivre.

## Données : texte descriptif à copier

Le gestionnaire conserve localement le code, les URL sources ou noms de fichiers importés, les versions, les règles d’exécution, les états d’activation et les dates de gestion des outils. Il ne conserve pas le chemin complet des fichiers importés et ne surveille pas le disque. Il ne comporte ni compte, ni publicité, ni télémétrie. Les requêtes HTTPS de téléchargement transmettent au serveur choisi l’URL demandée, l’adresse IP visible lors de la connexion et les en-têtes techniques nécessaires, sans cookies ni Referer. Le gestionnaire n’envoie pas le contenu des pages à son éditeur. Les scripts installés peuvent lire et modifier le contenu des pages autorisées et peuvent avoir des traitements ou communications propres selon leur code.

### Catégories à rapprocher des cases réellement présentées

| Catégorie | Faits à déclarer et à vérifier |
| --- | --- |
| Contenu de site / Website content | Le code téléchargé est traité localement. Les scripts installés peuvent accéder au DOM des pages autorisées. |
| Navigation / Web history ou Browsing activity | Le gestionnaire conserve et demande les URL sources des scripts ; il ne construit pas d’historique des onglets visités. Vérifier la portée de la catégorie dans le formulaire. |
| Activité de l’utilisateur | Les états et dates de gestion sont locaux ; aucun suivi des clics ou frappes dans les pages n’est implémenté par le gestionnaire. |
| Localisation | Aucun GPS ni géolocalisation n’est utilisé. Le serveur choisi voit l’adresse IP de la connexion ; vérifier la définition de la catégorie proposée avant de sélectionner la case. |
| Identité, santé, finances, authentification, communications personnelles | Aucune collecte dédiée n’est implémentée par le gestionnaire. Les outils de production fournis par l’éditeur restent à vérifier selon leur code. |

Les textes ci-dessus sont prêts ; les cases définitives doivent être rapprochées des libellés du formulaire et des outils réellement distribués. Elles ne sont pas certifiées dans ce dossier. Google impose aussi de décrire les traitements locaux : [FAQ sur les données](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).

### Certifications d’utilisation limitée

Le gestionnaire livré ne vend pas les données, ne les utilise pas à des fins étrangères à son objectif et ne les utilise pas pour la solvabilité ou le crédit. Ce sont les faits correspondant aux certifications du formulaire. Vérifier que les scripts de production fournis avec la distribution respectent les mêmes engagements avant de certifier l’ensemble.

## Firefox : déclarations et notes d’examen

Le manifeste livré déclare `browser_specific_settings.gecko.data_collection_permissions.required: ["none"]` pour le gestionnaire sans télémétrie ni extraction de données de pages vers l’éditeur. Les communications nécessaires aux serveurs choisis sont décrites dans la politique. Cette déclaration ne certifie pas le comportement de tout script utilisateur ajouté ultérieurement. Vérifier sa cohérence avec les outils de production distribués et la [classification Mozilla](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).

Notes de soumission à compléter avec les URL réelles :

Mes outils est un gestionnaire de scripts utilisateur Manifest V3 pour ordinateur, compatible avec Firefox 140 ou ultérieur. La permission userScripts est optionnelle et demandée depuis son interface. L’utilisateur choisit explicitement ses scripts, confirme leur installation et peut les suspendre ou les supprimer indépendamment. Les mises à jour des scripts attendent une approbation. Aucun compte applicatif n’est requis pour la démonstration. Les instructions de test indiquent la page de démonstration et l’URL directe du script.

Joindre le document généré `dist/publication/INSTRUCTIONS-EXAMEN.md` après choix de l’hébergement et vérification des liens. La distribution « On your own » nécessite de récupérer le paquet signé. Les mises à jour du paquet de l’extension hors AMO restent à organiser ; elles sont distinctes de celles des scripts gérés.

## État du dossier

- Textes, contact, permissions et explications sur le code distant : préparés.
- Comptes développeur et soumission : l’utilisateur indique une soumission existante en validation; état non consulté dans cette session.
- Politique et démonstration : fichiers préparés, URL publiques à vérifier dans le tableau de bord.
- Catégories de données et certifications : à finaliser dans les vrais formulaires selon les outils distribués.
- Dialogues Firefox : protocole fourni dans `TEST-FIREFOX.md`, vérification manuelle encore requise.
- Formulaires en ligne, téléversement et soumission : aucune modification effectuée par l’assistant dans le tableau de bord.
