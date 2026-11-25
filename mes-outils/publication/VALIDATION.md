# Validation de la préparation

Date : 25 novembre 2026. Version : 0.1.2.

## Vérifications effectuées sur cette version

- `npm run check` : manifestes, concordance de version, imports locaux, ressources, identifiants HTML et syntaxe JavaScript vérifiés.
- `npm test` : 21 tests JavaScript et 3 tests Python réussis. Ils couvrent les timings, l’aperçu et son expiration, l’autorisation par empreinte, les mises à jour en attente et obsolètes, les permissions de domaines, la pause et la suppression, les erreurs réseau et quotas, la concurrence suppression/téléchargement, la restauration après redémarrage, le blocage et la récupération des anciens timings, les limites de téléchargement et la préparation du site.
- `npm run package` : archives 0.1.2 créées et relues pour vérifier leur contenu exact (21 fichiers pour Chrome et Firefox, 22 pour Edge avec son fichier de langue). Les tests et contrôles sont exécutés avant la construction.
- La politique est maintenue uniquement dans `extension/privacy.html`, avec le nom et le contact de l’éditeur. La construction en exporte une copie exacte dans `dist/publication/site/privacy.html`. Aucun fichier source `docs/index.html` n’est nécessaire.
- Le paquet Edge déclare `default_locale: fr`, utilise les références de messages pour le nom et la description et contient `_locales/fr/messages.json`, généré depuis les textes communs. La reconstruction Edge a réussi avec les 24 tests ; les références et leur résolution ont été vérifiées dans l’archive. L’affichage de la langue après remplacement dans Partner Center reste à confirmer. Les archives Chrome et Firefox existantes sont restées identiques (vérification SHA-256).
- Le générateur de publication est testé dans un dossier temporaire avec une URL fictive : il adapte les règles @match et les instructions, copie la politique sans modification et n’inclut pas les instructions privées dans le site à héberger.
- Chrome for Testing 159.0.8154.6 et Microsoft Edge 158.0.4370.33 : chargement réel dans des profils isolés, activation du bouton de scripts utilisateur, refus d’un outil document-start, aperçu, confirmation, injection userScripts sur une page simulée, mise à jour 1.0.0 vers 1.0.1 uniquement après approbation, pause, réactivation et suppression après rechargement réussis. Aucune erreur JavaScript de page détectée.
- Firefox 161.0 : paquet installé temporairement via la commande WebDriver standard `Addon:Install`. Cette installation vérifie le chargement du paquet, mais ne valide pas le parcours utilisateur complet.

Les tests de navigateur utilisent des données fictives. Le CDN et la page sont simulés pour les essais Chrome/Edge ; les permissions du domaine de test sont accordées par l’API de test du navigateur dans les profils isolés. Leurs dialogues natifs de permissions d’hôte ne sont donc pas validés par ces essais.

## Reproduire le parcours Chrome/Edge

Le script optionnel `scripts/browser-smoke.mjs` nécessite une installation existante de Playwright Core et un exécutable compatible avec le chargement des extensions. Il n’est pas requis par la construction sans dépendances npm.

```powershell
node scripts/browser-smoke.mjs CHEMIN_PLAYWRIGHT_CORE chrome CHEMIN_CHROME_FOR_TESTING
node scripts/browser-smoke.mjs CHEMIN_PLAYWRIGHT_CORE edge CHEMIN_EDGE
```

Les profils, captures d’échec et rapports JSON sont conservés sous `.artifacts/browser-checks/`, exclus de la distribution.

## Vérifications à terminer avant soumission

- Choisir l’adresse HTTPS de l’hébergement et générer le site avec `npm run prepare:publication -- --base-url URL_DU_DOSSIER`. Téléverser les fichiers et vérifier les vraies URL, le type JavaScript, l’absence de redirection et le bon domaine @match.
- Tester manuellement les dialogues natifs d’autorisation d’hôte et le parcours complet dans Firefox. L’automatisation Firefox sans accès système privilégié a accepté l’installation temporaire, puis refusé la navigation WebDriver vers la page moz-extension. Aucun accès système privilégié n’a été activé.
- Vérifier les versions minimales annoncées si elles doivent être garanties ; les essais actuels utilisent des versions plus récentes.
- Compléter les déclarations de données selon les outils réellement distribués et fournir les instructions avec leurs URL finales.
- Soumettre à l’examen des stores et obtenir la signature Firefox. L’admissibilité Edge de ce gestionnaire de scripts reste à confirmer par l’examen, compte tenu de la documentation restrictive sur le code distant MV3.

La capture de publication a été refaite avec l’interface 0.1.2, un outil de démonstration et des réponses réseau simulées. Elle a été vérifiée visuellement.

Les contrôles locaux ne constituent pas une signature, une publication ni une garantie d’acceptation. Aucun compte réel ni aucune donnée de production n’a été utilisé.

## Préparation des formulaires et essai d’accès aux fenêtres

- Le propriétaire a indiqué n’avoir encore aucun compte développeur pour les stores. Aucun formulaire en ligne n’a été rempli ni soumis.
- `FORMULAIRES.md` contient les réponses préparées, les liens d’inscription et les points encore à finaliser dans les vrais tableaux de bord.
- L’accès aux fenêtres réelles Firefox n’a pas fonctionné : le helper Windows renvoie « Computer Use native pipe is unavailable » (fichier introuvable, erreur système 2), malgré une nouvelle tentative et une réinitialisation. Le contrôle navigateur de secours renvoie la même erreur. Aucune permission réelle Firefox n’a été acceptée ou refusée pendant cet essai.
- `TEST-FIREFOX.md` détaille le parcours restant et laisse tous les résultats natifs à « Non vérifié ». Un même domaine utilisé pour le fichier et la page ne déclenche pas nécessairement deux demandes : un cas à origines distinctes est décrit pour vérifier les deux refus indépendamment.
