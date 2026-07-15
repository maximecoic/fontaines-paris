# 💧 Fontaines Paris

Une carte simple, rapide et agréable pour trouver une fontaine à boire à Paris — en temps réel, à partir des [données ouvertes de la Ville de Paris](https://opendata.paris.fr/explore/dataset/fontaines-a-boire/).

Conçue pour être **installée comme une application** sur l'écran d'accueil d'un iPhone (PWA), avec un mode hors-ligne.

## Fonctionnalités

- 🗺️ Carte interactive de **1 300+ points d'eau** (bornes fontaines, fontaines Wallace, fontaines 2 en 1, points d'eau des bois et parcs, fontaines pétillantes…)
- 🔵 Code couleur clair : disponible / indisponible (avec le motif et la date de retour si connue)
- 🔎 Recherche instantanée par rue, quartier ou arrondissement
- 📍 Géolocalisation « Autour de moi » avec la liste des fontaines les plus proches et leur distance
- 🌗 Thème clair / sombre (mémorisé, avec détection automatique des préférences système)
- 📶 Fonctionne hors-ligne une fois installée (carte, dernières données connues)
- 📱 Installable sur l'écran d'accueil iPhone/Android comme une vraie application (PWA)
- 🧭 Données rafraîchies directement depuis l'API officielle à chaque ouverture

## Technologies (100% open-source)

| Rôle | Outil |
|---|---|
| Bibliothèque cartographique | [Leaflet](https://leafletjs.com/) |
| Fond de carte | [OpenStreetMap](https://www.openstreetmap.org/copyright) via les tuiles gratuites [CARTO](https://carto.com/attributions) (clair & sombre) |
| Regroupement des marqueurs | [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster) |
| Données | [API Paris Data — jeu de données « Fontaines à boire »](https://opendata.paris.fr/explore/dataset/fontaines-a-boire/) (licence [ODbL](https://opendatacommons.org/licenses/odbl/), producteur : Eau de Paris) |
| Frontend | HTML / CSS / JavaScript vanilla — aucune dépendance de build |

Aucune clé d'API, aucun compte, aucun service payant n'est nécessaire : tout repose sur des briques ouvertes et gratuites.

## Installer sur l'écran d'accueil iPhone

1. Ouvrez le site avec **Safari** sur iPhone.
2. Touchez l'icône de **partage** (carré avec une flèche vers le haut).
3. Choisissez **« Sur l'écran d'accueil »**.
4. Confirmez : l'application apparaît avec sa propre icône et s'ouvre en plein écran, sans barre d'adresse.

## Développement local

Le projet est 100% statique, aucune installation n'est nécessaire.

```bash
python3 -m http.server 8765
# puis ouvrir http://localhost:8765
```

## Structure du projet

```
index.html              Page principale
css/style.css           Styles (thème clair/sombre, mise en page mobile-first)
js/app.js               Logique de l'application (carte, données, recherche, géolocalisation)
manifest.webmanifest     Manifeste PWA (icônes, couleurs, mode standalone)
service-worker.js        Cache applicatif + mode hors-ligne
icons/                    Icônes de l'application (toutes tailles iOS/Android)
vendor/                   Leaflet et Leaflet.markercluster (auto-hébergés)
```

## Données

Les données proviennent de l'API publique de la Ville de Paris et sont interrogées directement depuis le navigateur à chaque chargement (aucune donnée n'est stockée sur un serveur intermédiaire). La dernière réponse est mise en cache localement pour permettre un usage hors-ligne.

- Jeu de données : [Fontaines à boire](https://opendata.paris.fr/explore/dataset/fontaines-a-boire/)
- Producteur : Eau de Paris
- Licence : [Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/)

## Licence

Code source disponible librement pour un usage personnel et éducatif. Données © Eau de Paris / Ville de Paris sous licence ODbL. Fond de carte © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributeurs, © [CARTO](https://carto.com/attributions).
