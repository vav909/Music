# Mise en ligne et mise à jour de l'app

## Fonctionnement
Chaque push sur `main` lance `.github/workflows/pages.yml`, qui publie l'app sur GitHub Pages
(`https://vav909.github.io/Music/`). Le workflow donne aussi un nouveau nom au cache hors ligne de `sw.js`
(sinon les téléphones garderaient l'ancienne version).

## À faire une seule fois (réglage GitHub, 30 secondes)
Dépôt → **Settings → Pages → Build and deployment → Source : GitHub Actions**.
Puis fusionner la pull request qui contient ce workflow : le premier déploiement démarre tout seul.

## Au quotidien
1. Demander une modification à Claude.
2. Claude teste, pousse une branche et ouvre une pull request.
3. Tu fusionnes la pull request (bouton « Merge »).
4. Après environ une minute, l'app est à jour. Onglet **Actions** du dépôt : pastille verte = en ligne.
5. Sur le téléphone, rouvre l'app. Si elle est installée, ferme-la complètement puis rouvre-la.

## Installer l'app sur le téléphone
- Android (Chrome) : menu ⋮ → « Installer l'application ».
- iPhone (Safari) : bouton Partager → « Sur l'écran d'accueil ».

## Tester en local
```
python3 -m http.server 8000
```
puis ouvrir `http://localhost:8000` en vue téléphone, et charger un MP3 : boucle A-B, vitesse à 60 %, solo enregistré.

## Si l'app ne se met pas à jour
- Onglet **Actions** : le dernier déploiement est-il rouge ? Ouvrir le détail et me coller l'erreur.
- Vérifier que Pages est réglé sur « GitHub Actions » (voir plus haut).
- Navigateur : vider les données du site, ou rouvrir l'app deux fois.
