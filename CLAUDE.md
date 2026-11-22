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
- Pictos : toujours des SVG en trait fin (épaisseur 1,5, `IC` dans `app.js`), jamais de symbole en texte (▶ ⏸ ⏹ ⬆ ⬇ ★ ✕… deviennent des emojis colorés sur Android).
- Boutons : les pastilles (fonds arrondis) sont voulues.
- **v2 : le graphisme vient des maquettes de l'utilisatrice** (`design/v2-reference/*.svg`, exportées de Figma) : violet-gris `#636487` (accent), beige `#E3C5A2` (barres du son, pastille de lecture à l'arrêt `#E0CDB6`), texte discret `#98836A`, texte `#1B1918`, fond de liste `#F5F5F5`, boutons carrés `#F3F3F3` (rayon 16), boutons ronds et plage sélectionnée `#E5E5F0`. Ne pas inventer d'autres couleurs ni refaire le style sans nouvelle maquette.
- v2 : lecteur réduit (bande fine, boucle / reculer / lecture / avancer, tempo avec « |0s| » = pause entre passages) et complet (+ temps, zoom, début / fin, pas, montée progressive) partagé entre la page du morceau et les détails du solo ; liste « Mes solos » en cartes blanches ; bouton « + » flottant ; détails du solo sans bandeau du bas (Transcription, Réanalyser, puis réglages et diagnostic repliés). v2 : ce qu'elle a retiré des maquettes est masqué en CSS (Pas, Montée progressive, Réglages de la partition, Diagnostic) ; barres du son = bâtonnets arrondis (2,43 px, pas de 6 px) ; police Inter (`v2/fonts/`) ; géométrie mesurée sur les SVG (cadre 393 px : en-tête 60, bandes grises de 3 px, wave 104/34, boutons 60/52/51, cartes 72, partition au pas de 75 px). Le tempo original s'obtient en touchant l'étiquette « 100 % ».

## Déjà dans l'app
Interface du morceau : en-tête avec pochette, titre, artiste · album et un crayon (modifier titre, artiste, album, pochette, identification) ; lecteur en haut en deux versions (allégée : boucle, lecture au centre, curseur de tempo ; complète : + avance/recul de 1 s, appui long par 5 puis 10 s, tempo − / + de 5, « Tempo original », « Pause entre passages », « Montée progressive »), icônes dessinées en SVG (jamais de ▶ ⏸ ⏹ en texte : Android les affiche en emoji colorés) ; liste des solos : pastille ▶ = jouer la plage, toucher le nom (ou ▾) = déplier les champs (nom, instrument, soliste, début/fin ; affichés d'office à la création), crayon (ligne repliée) = page « Détails du solo » : une seule page à sections repliables (plage avec timeline, partition avec boutons croche « Transcription » / « Avec le solo » au-dessus, diagnostic) et un bandeau fixe en bas : bouton central « ▶ Solo », picto portée (note sur la ligne de sol) qui déplie les réglages de la partition (tempo, rythme, ♯/♭, mesures, tessiture, voix aiguë, réanalyser).
Bibliothèque de morceaux (MP3 importés, stockage local), solos nommés avec instrument, soliste et favori, artiste/album/pochette
(recherche automatique iTunes, sinon saisie), boucle, tempo 25–150 % sans changer la hauteur, montée progressive (+5 % par passage),
pause avec bips entre deux passages, pédale Bluetooth (espace/↓ lecture, ↑ début du solo), export/import JSON des repères (sans audio),
partition du solo sélectionné (`score.js` : analyse YIN limitée à la tessiture de l'instrument du solo avec ramenée d'octave, notes répétées séparées aux creux d'énergie, suivi de la hauteur par continuité (plusieurs candidats par image, chemin de moindre coût : retient les passages flous d'un concert), tessiture réglable à la main (la note la plus grave relève aussi le filtre passe-haut : coupe les harmoniques de la basse) et option « Voix aiguë » pour les mélanges où la basse et le piano sont pris pour le soliste, quantification en doubles-croches ou swing (croches droites), tempo estimé ou tapé, affichage SVG, correction note par note, export MIDI/MusicXML, écoute de la partition écrite seule ou avec le solo d'origine, note en cours surlignée), lecture des étiquettes ID3 du MP3 (`tags.js` : titre, artiste, album, pochette), recherche iTunes puis MusicBrainz (`meta.js`) : nom de fichier nettoyé (« 26-2 » conservé), candidats classés (mots, artiste, durée du fichier) à choisir, titre modifiable, pochette de la galerie en secours, bouton « Envoyer un diagnostic » (JSON sans audio : étiquettes, recherche, réglages, notes détectées).

**v2 — page unique** : plus d'onglets Morceaux / Solos. Une seule liste : pour chaque morceau, sa carte (pochette, titre, artiste · album · durée · nombre de solos) au-dessus de ses solos ; balayer la carte vers la gauche emporte tout le bloc (corbeille sur fond violet sur toute la hauteur, confirmation). Tri A–Z / arrivée, filtres favoris, instrument (ligne défilante) et statut. Nouveau solo = en haut de la pile ; ses réglages Début / Fin sont dans sa carte dépliée (plus dans le bandeau du lecteur ; le chevron qui agrandit la timeline reste). Avance/recul : un appui = 0,5 s, en maintenant 1 s, puis 3, 5 et 10 s. Zoom de la timeline : « − » rapproche les bâtonnets, « + » les écarte (pas de 6 px au zoom normal).

**v2 — Loops** : l'app s'appelle « Loops ». Accueil = la liste unique ; écran de chargement = le visuel de rayons violets (généré par `design/generer_loops.py`, SVG en ligne dans `v2/index.html`, icônes via `design/rendre_icones.js`). Barre du haut : titre, puis importer / partager (sans texte, infobulles, contour violet 1,5) et filtrer (contour noir 2,5, ouvre les filtres ; pastille violette si un filtre est actif). Le « + » d'import d'un morceau est en bas à droite. Pochettes et titres de morceaux posés sur le fond de la page.

**v2 — Mes prises** (`v2/takes.js`) : dans les détails du solo, bloc repliable « Mes prises » (fermé par défaut). Enregistrer (3 bips, le solo démarre au début de la plage à la vitesse du lecteur, micro sans traitement : pas d'annulation d'écho / bruit / gain auto), prises listées par date (la plus récente en haut), « Prise seule » / « Superposée au solo » (deux éléments audio synchronisés, GainNode pour chaque volume, dérive corrigée toutes les 250 ms), volumes « Ma prise » / « Solo original » et décalage −300…+800 ms réglables pendant l'écoute et mémorisés par prise, réglage « Mon casque » (décalage par défaut), choix du micro (intégré par défaut si reconnu, avertissement Bluetooth), essai « Caler automatiquement » (propose un décalage par corrélation des débuts de sons, jamais appliqué seul). Stockage : **base IndexedDB séparée `solo-looper-takes`** (magasin `takes`) — la base `solo-looper` partagée avec la v1 n'est pas touchée (monter sa version casserait la v1). Les prises sont enregistrées en WAV (durée exacte, lecture à position précise), champ `rate` = tempo du lecteur à l'enregistrement : à la réécoute la prise est jouée à `tempo actuel / tempo d'enregistrement` pour rester alignée sur le solo. Jamais exportées avec les repères. Statut de travail des solos (`status` : todo / doing / done, vide = non renseigné) et tri/filtres de l'onglet Solos ajoutés dans la v2.

## À faire ensuite
Détection automatique du swing, Import Drive, import d'une playlist Deezer (titres seulement, puis association aux fichiers), transposition de la partition, partition plus fiable sur piste isolée (serveur),
détection automatique des solos (serveur), changement de tonalité.

## Tests (Node, sans dépendance)
`node tests/score.test.js` (notes répétées, attaques, tessiture, sur un signal synthétique `tests/synth.js`), `node tests/meta.test.js` (noms de fichiers, recherche avec réponses simulées),
`node tests/compare.js [révision]` (avant/après sur le même signal). Le bac à sable bloque iTunes/MusicBrainz : la recherche réelle reste à vérifier sur un téléphone.

## Versions (voir `docs/VERSIONS.md`)
- Racine = version publiée. `v1/` = copie gelée (ne pas modifier). `v2/` = nouveau graphisme en chantier : **tout le travail de la v2 se fait dans `v2/`**, pas à la racine.
- Point de retour : branche `archive/v1.0` (ne pas y pousser).
- Données **partagées** entre les versions (même base IndexedDB `solo-looper`) : ne jamais changer la version de la base ni le nom des magasins, ne jamais supprimer ni renommer un champ, seulement en ajouter.
- Tests de la v2 : `SOLO_DIR=v2 node tests/score.test.js`.

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
