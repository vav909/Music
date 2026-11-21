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
Interface du morceau : en-tête avec pochette, titre, artiste · album et un crayon (modifier titre, artiste, album, pochette, identification) ; tempo au curseur de 10 en 10 (− / + de 5) avec « Tempo original » ; liste des solos : toucher une ligne = jouer la plage, ▾ = options (nom, instrument, soliste, début/fin), crayon (ligne repliée) = page « Détails du solo » : une seule page à sections repliables (plage avec timeline, écouter transcription / avec le solo / solo, partition, diagnostic).
Bibliothèque de morceaux (MP3 importés, stockage local), solos nommés avec instrument, soliste et favori, artiste/album/pochette
(recherche automatique iTunes, sinon saisie), boucle, tempo 25–150 % sans changer la hauteur, montée progressive (+5 % par passage),
pause avec bips entre deux passages, pédale Bluetooth (espace/↓ lecture, ↑ début du solo), export/import JSON des repères (sans audio),
partition du solo sélectionné (`score.js` : analyse YIN limitée à la tessiture de l'instrument du solo avec ramenée d'octave, notes répétées séparées aux creux d'énergie, suivi de la hauteur par continuité (plusieurs candidats par image, chemin de moindre coût : retient les passages flous d'un concert), tessiture réglable à la main (la note la plus grave relève aussi le filtre passe-haut : coupe les harmoniques de la basse) et option « Voix aiguë » pour les mélanges où la basse et le piano sont pris pour le soliste, quantification en doubles-croches ou swing (croches droites), tempo estimé ou tapé, affichage SVG, correction note par note, export MIDI/MusicXML, écoute de la partition écrite seule ou avec le solo d'origine, note en cours surlignée), lecture des étiquettes ID3 du MP3 (`tags.js` : titre, artiste, album, pochette), recherche iTunes puis MusicBrainz (`meta.js`) : nom de fichier nettoyé (« 26-2 » conservé), candidats classés (mots, artiste, durée du fichier) à choisir, titre modifiable, pochette de la galerie en secours, bouton « Envoyer un diagnostic » (JSON sans audio : étiquettes, recherche, réglages, notes détectées).

## À faire ensuite
Détection automatique du swing, Import Drive, import d'une playlist Deezer (titres seulement, puis association aux fichiers), transposition de la partition, partition plus fiable sur piste isolée (serveur),
détection automatique des solos (serveur), changement de tonalité.

## Tests (Node, sans dépendance)
`node tests/score.test.js` (notes répétées, attaques, tessiture, sur un signal synthétique `tests/synth.js`), `node tests/meta.test.js` (noms de fichiers, recherche avec réponses simulées),
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
