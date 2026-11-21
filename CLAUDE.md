# Solo Looper : consignes de travail

App mobile (PWA, Android + iPhone) pour relever des solos de jazz : repérer, isoler, boucler,
ralentir sans changer la hauteur. Fichiers statiques sans build : `index.html`, `app.js`,
`style.css`, `sw.js`, `manifest.webmanifest`. Stockage local (IndexedDB), hors ligne.

## Décisions déjà prises (ne pas redemander)
- Utilisatrice : flûtiste traversière (clé de sol, sans transposition). Transposition vers d'autres instruments : plus tard.
- Contenu : solos de jazz de soufflants (sax, trompette, flûte…) et de piano. Artiste, soliste et pochette
  retrouvés automatiquement, saisie manuelle en secours.
- Sources audio : MP3 du téléphone, Drive, playlists Deezer (Deezer ne fournit que les titres, jamais l'audio).
- Partage : chacun garde ses propres fichiers audio. On échange uniquement repères de solos, noms de solistes, partitions.
- Usage : travail à la maison, sur pupitre ; partage entre amis.
- Style : fond blanc, gris clair, bâtonnets rectangulaires bleu clair pour le son, sélection en bleu plus soutenu,
  quelques touches de bleu pur. Sobre, mobile d'abord (boutons ≥ 44 px, commandes au pouce). Appliqué.
- Priorité : tester d'abord avec un MP3 téléchargé.

## Déjà dans l'app
Bibliothèque de morceaux (MP3 importés, stockage local), solos nommés avec instrument, soliste et favori, titre/artiste/album/pochette
(étiquettes ID3 du MP3 lues d'abord, sinon nom de fichier nettoyé puis recherche iTunes / MusicBrainz avec choix entre plusieurs candidats, saisie et pochette de la galerie en secours : `meta.js`), boucle, tempo 25–150 % sans changer la hauteur, montée progressive (+5 % par passage),
pause avec bips entre deux passages, pédale Bluetooth (espace/↓ lecture, ↑ début du solo), export/import JSON des repères (sans audio),
partition du solo sélectionné (`score.js` : analyse YIN limitée à la tessiture de l'instrument du solo (réglable à la main), lissage médian,
séparation des attaques aux creux d'énergie, rejet des notes hors plage ; quantification en doubles-croches ou croches swinguées (auto / droit / swing) ;
tempo estimé, tapé ou saisi ; affichage SVG, correction note par note, export MIDI/MusicXML). Hauteurs sonores, sans transposition.

## À faire ensuite
Import Drive, import d'une playlist Deezer (titres seulement, puis association aux fichiers), transposition de la partition, partition plus fiable sur piste isolée (serveur),
détection automatique des solos (serveur), changement de tonalité.

## Tests (Node, sans dépendance)
`node tests/score.test.js` (tessiture, swing, tempo, sur un signal synthétique `tests/synth.js`), `node tests/meta.test.js` (ID3, noms de fichiers, recherche avec réponses simulées),
`node tests/compare.js [révision]` (avant/après sur le même signal). Le bac à sable bloque iTunes/MusicBrainz : la recherche réelle reste à vérifier sur un téléphone.

## Comment modifier l'app et la mettre en ligne
1. Modifier les fichiers à la racine. Garder l'app sans dépendance ni étape de build.
2. Tester en vue téléphone (390×844) avec un vrai MP3 (voir `docs/DEPLOIEMENT.md`).
3. `sw.js` charge le réseau d'abord : pas de numéro de version à changer. Si un fichier est ajouté, l'ajouter aussi à `ASSETS`.
4. Créer une branche `claude/<sujet>`, commit, push, ouvrir une pull request. Le merge sur `main` met l'app en ligne.
5. Après le déploiement, rouvrir l'app (deux ouvertures si elle est installée) pour voir la nouvelle version.

## Règles
- Réponses et textes de l'interface en français.
- Ne jamais committer de clés, de jetons ni de fichiers audio protégés par le droit d'auteur.
- Deezer : métadonnées seulement (titres, artistes, pochettes). Pas de contournement du chiffrement du flux.
