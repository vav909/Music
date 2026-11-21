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
  quelques touches de bleu pur. Sobre, mobile d'abord (boutons ≥ 44 px, commandes au pouce).
  **À appliquer dans cette app** (le thème actuel est sombre).
- Priorité : tester d'abord avec un MP3 téléchargé.

## Comment modifier l'app et la mettre en ligne
1. Modifier les fichiers à la racine. Garder l'app sans dépendance ni étape de build.
2. Tester en vue téléphone (390×844) avec un vrai MP3 (voir `docs/DEPLOIEMENT.md`).
3. Si un fichier est ajouté ou renommé, mettre à jour la liste `ASSETS` de `sw.js`.
4. Ne pas modifier le nom du cache dans `sw.js` à la main : le déploiement le change tout seul.
5. Créer une branche `claude/<sujet>`, commit, push, ouvrir une pull request. Le merge sur `main` met l'app en ligne.
6. Après le déploiement, rouvrir l'app (deux ouvertures si elle est installée) pour voir la nouvelle version.

## Règles
- Réponses et textes de l'interface en français.
- Ne jamais committer de clés, de jetons ni de fichiers audio protégés par le droit d'auteur.
- Deezer : métadonnées seulement (titres, artistes, pochettes). Pas de contournement du chiffrement du flux.
