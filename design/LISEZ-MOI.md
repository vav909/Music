# Maquettes Solo Looper pour Figma

Trois fichiers SVG à importer dans Figma (un fichier = une page Figma). Chaque élément devient un **calque modifiable** (formes, textes, pictos, groupes nommés).

| Fichier | Page Figma | Contenu |
|---|---|---|
| `figma/page-00-styles.svg` | 00 · Styles | couleurs, formes, typographie, pictos (valeurs de `style.css` et `app.js`) |
| `figma/page-01-onglets.svg` | 01 · Onglets | Morceaux, Solos, Morceau (lecteur allégé), Morceau (lecteur complet), Morceau (solo déplié) |
| `figma/page-02-details-solo.svg` | 02 · Détails du solo | plage + partition (bandeau fermé), réglages ouverts |

`figma/apercus/` contient une image de chaque page pour comparer avec ce que Figma affiche.

## Importer dans Figma
1. Crée un fichier Figma, puis une page par SVG (clic droit sur la liste des pages → *Add page*).
2. Glisse le fichier SVG sur la page (ou *Fichier → Placer une image…*).
3. Chaque écran est un groupe nommé `Page_…` : sélectionne-le, puis **Ctrl/Cmd + Alt + G** (*Frame selection*) pour en faire un cadre.
4. La police est **Inter** (celle de Figma) ; l'app utilise la police du téléphone.

## À savoir
- Les textes, les rectangles, les pictos (tracés vectoriels en trait fin 1,5) et les barres du son sont modifiables. Les pictos ont les mêmes tracés que dans l'app.
- Ce sont des **dessins** : pas de composants ni d'*auto layout* Figma. On peut les créer ensuite à partir des calques nommés (`Bouton_…`, `Ligne_solo`, `Carte_…`, `Picto_…`).
- Les noms de calques sont ceux des groupes : retrouve un élément par son nom dans le panneau des calques.

## Régénérer
`python3 design/generer_maquettes.py` réécrit les trois SVG (les couleurs et les tailles sont en haut du script). À refaire quand l'app change.
