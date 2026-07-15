# Laboratoire iOS PWA

Ce dossier est entièrement isolé de l’application principale.

- URL de production : `https://fontaines.coic.me/tests/`
- Manifeste, styles, JavaScript et service worker dédiés
- Scope du service worker limité à `/tests/`
- Aucun cache : toutes les requêtes utilisent le réseau avec `cache: no-store`
- À l’activation, le worker du laboratoire supprime uniquement les éventuelles entrées `/tests/` que le worker racine aurait ajoutées pendant la toute première navigation
- Aucun fichier de l’application principale n’est modifié ou importé, hormis les bibliothèques Leaflet et les icônes statiques en lecture seule

## Test sur iPhone

1. Ouvrir `/tests/` dans Safari.
2. Ajouter la page à l’écran d’accueil sous le nom « Fontaines Lab ».
3. Fermer complètement la PWA depuis le sélecteur d’applications.
4. La relancer à froid et attendre au moins trois secondes.
5. Copier le rapport avant toute rotation.
6. Tourner l’iPhone, revenir en portrait, puis copier un second rapport.
7. Comparer les cinq stratégies avec le sélecteur.

## Interprétation

- Écart `map → innerHeight` non nul : problème CSS / viewport.
- Écart `Leaflet → map` non nul : Leaflet conserve une mauvaise taille interne.
- Deux écarts nuls mais bande visible : composition iOS, overlay, ou zone système hors du viewport exposé.

La bande rouge est volontaire : elle rend immédiatement visible toute zone non peinte par les tuiles de la carte. Les lignes verte et jaune marquent respectivement les bords CSS supérieur et inférieur.
