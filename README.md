# Solo Looper

App mobile (PWA, pensée pour Android) pour repérer, isoler et boucler des solos et les travailler avec son instrument.

- Ligne sonore simplifiée en petits rectangles, zoomable, tap pour se placer
- Solos nommés (avec instrument, favori) sauvegardés par morceau, modifiables à tout moment
  (« ⌖ ici » pour caler début/fin pendant l'écoute, boutons −/+ avec pas réglable)
- Boucle sur le solo sélectionné, tempo 40–120 % **sans changer la hauteur** (`preservesPitch`)
- Tempo mémorisé par solo ; onglets Morceaux / Solos, filtres favoris et instrument
- Tout est stocké localement sur le téléphone (IndexedDB), fonctionne hors ligne

## Essayer
Activer GitHub Pages (Settings → Pages → branche, dossier `/`), ouvrir l'URL sur Android avec Chrome,
puis menu ⋮ → « Installer l'application ». En local : `python3 -m http.server` puis ouvrir `localhost:8000`.
