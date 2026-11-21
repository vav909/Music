# Mise en ligne et mise à jour de l'app

## Fonctionnement
L'app est publiée par GitHub Pages à partir de la branche `main` (`https://vav909.github.io/Music/`).
Chaque fusion sur `main` met l'app à jour automatiquement, environ une minute plus tard. Aucun réglage supplémentaire.
Le service worker (`sw.js`) charge d'abord la version en ligne, et utilise sa copie en cache seulement hors ligne :
les modifications arrivent donc sans manipulation.

## Au quotidien
1. Demander une modification à Claude.
2. Claude teste, pousse une branche et ouvre une pull request.
3. Tu fusionnes la pull request (bouton « Merge »).
4. Après environ une minute, l'app est à jour : onglet **Actions** du dépôt, « pages build and deployment », pastille verte.
5. Sur le téléphone, rouvre l'app. Si elle est installée, ferme-la complètement puis rouvre-la.

## Installer l'app sur le téléphone
- Android (Chrome) : menu ⋮ → « Installer l'application ».
- iPhone (Safari) : bouton Partager → « Sur l'écran d'accueil ».

## Tester en local
```
python3 -m http.server 8000
```
puis ouvrir `http://localhost:8000` en vue téléphone, et charger un MP3 : créer un solo, boucle, vitesse à 60 %, montée progressive.

## Si l'app ne se met pas à jour
- Onglet **Actions** : le dernier déploiement est-il rouge ? Ouvrir le détail et me coller l'erreur.
- Vérifier : Settings → Pages → source « Deploy from a branch », branche `main`, dossier `/ (root)`.
- Navigateur : vider les données du site, ou rouvrir l'app deux fois.
