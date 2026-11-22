# Versions de l'app

| Adresse | Rôle |
|---|---|
| `https://vav909.github.io/Music/` | version **publiée** (la racine du dépôt) |
| `https://vav909.github.io/Music/v1/` | **v1 gelée** : ne plus la modifier |
| `https://vav909.github.io/Music/v2/` | **v2** : nouveau graphisme (maquettes dans `design/v2-reference/`), mêmes données que la v1 |

Chaque version s'installe séparément sur le téléphone (noms « Solo Looper v1 » et « Solo Looper v2 »).

## Point de retour
La version de référence est conservée dans la branche **`archive/v1.0`** (commit `f7271e7`). Ne pas y pousser.

- Revoir l'ancienne version : ouvrir `/v1/`.
- Revenir au code d'origine : `git checkout archive/v1.0` (ou demander à Claude de restaurer la racine à partir de cette branche).

## Faire de la v2 la version publiée
Quand la v2 convient, on copie le contenu de `v2/` à la racine (les noms de fichiers sont les mêmes). `v1/` reste intacte.

## Les données sont partagées (choix : voir l'app fonctionner avec ses vrais morceaux)
Les trois adresses sont le même site : elles partagent la base **IndexedDB `solo-looper`** (morceaux, fichiers audio, solos) et le `localStorage`.
Pour que la v1 continue de fonctionner quand la v2 écrit dans la base :

1. **Ne jamais changer la version de la base** (`indexedDB.open('solo-looper', 1)`) ni le nom des magasins `songs` et `audio` : sinon la v1 ne peut plus l'ouvrir.
2. **Ne jamais supprimer ni renommer un champ** d'un morceau ou d'un solo (titre, artiste, album, cover, duration, peaks, solos[start, end, tempo, fav, name, instrument, soloist, score, range, top…]).
3. **Ajouter** de nouveaux champs est permis : la v1 les ignore.
4. Clés `localStorage` : ne pas réutiliser une clé existante (`sl-full`) avec un autre sens.

Si la v2 a besoin d'une autre structure, on passe à un stockage séparé (autre nom de base) et on migre les données une fois, avec une sauvegarde (« Partager mes solos »).

## Tests
`node tests/score.test.js` vise la racine ; `SOLO_DIR=v2 node tests/score.test.js` vise la v2 (idem `meta.test.js` et `compare.js`).
