# Solo Looper

App mobile (PWA, pensée pour Android) pour repérer, isoler et boucler des solos et les travailler avec son instrument.

- Ligne sonore simplifiée en petits rectangles, zoomable, tap pour se placer
- Solos nommés (avec instrument, favori) sauvegardés par morceau, modifiables à tout moment
  (« ⌖ ici » pour caler début/fin pendant l'écoute, boutons −/+ avec pas réglable)
- Boucle sur le solo sélectionné, tempo 40–120 % **sans changer la hauteur** (`preservesPitch`)
- Tempo mémorisé par solo ; onglets Morceaux / Solos, filtres favoris et instrument
- Tout est stocké localement sur le téléphone (IndexedDB), fonctionne hors ligne

## Essayer
L'app est publiée automatiquement sur GitHub Pages à chaque modification de `main` : ouvrir
`https://vav909.github.io/Music/`, puis installer l'app depuis le navigateur (Android : menu ⋮ ; iPhone : Partager → « Sur l'écran d'accueil »).
En local : `python3 -m http.server` puis ouvrir `localhost:8000`.

## Documentation
- [Mise en ligne et mise à jour](docs/DEPLOIEMENT.md) : réglage unique, déploiement automatique, dépannage.
- [CLAUDE.md](CLAUDE.md) : décisions du projet et méthode de travail avec Claude.
