# Écrans de Loops (v2) en SVG modifiables

Export de l'app réelle (vue téléphone 393 × 852), état du 24 nov. 2026. Rectangles, textes, pictos et bâtonnets du son sont des éléments vectoriels distincts, nommés par calque (importables dans Figma : *Fichier ▸ Importer*, ou glisser-déposer).

| Fichier | Écran |
|---|---|
| 01-chargement.svg | écran de chargement (rayons violets) |
| 02-accueil.svg | accueil, un morceau déplié |
| 03-accueil-filtres.svg | accueil, filtres ouverts (instruments, favoris / tri, statuts) |
| 04-morceau-solo-deplie.svg | page du morceau, solo déplié (début / fin dans la carte) |
| 05-morceau-bandeau-reduit.svg | page du morceau, bandeau réduit, solos repliés |
| 06-details-solo-off.svg | détails du solo, position « off » (bandeau déployé, début / fin) |
| 07-details-solo-partition.svg | détails du solo, partition affichée (bandeau réduit) |
| 08-details-solo-prises.svg | détails du solo, « Mes prises » |
| 09-icone-app.svg | icône de l'app |

Les textes utilisent la police **Inter** (installer `v2/fonts/inter.woff2` pour un rendu identique). La partition (07) est un SVG imbriqué avec ses propres notes ; les images (pochettes) sont intégrées.

Régénérer : lancer `python3 -m http.server 8123` à la racine du dépôt, puis `S=<dossier avec long.mp3, tagged.mp3, cover.jpg> node design/exporter_ecrans.js`.
