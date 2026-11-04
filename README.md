# SUNWAVE

**Où aller dehors, maintenant ?** SUNWAVE répond par un seul lieu à Lisbonne
(terrasse, belvédère, plage, parc) : au soleil ou au frais selon l'envie, jusqu'à
quelle heure, et à combien de minutes. L'algorithme prédit la lumière, ceux qui
sont sur place confirment (« encore au soleil ? », « il reste des tables ? »).

Prod : https://sunwave-olive.vercel.app · FR / EN (langue du téléphone, bascule dans le Profil)

## Ce qui rend la réponse juste

- **Ombres réelles** : 13 801 bâtiments OpenStreetMap, hauteurs croisées avec
  GHSL (Copernicus), relief Copernicus DEM 30 m, horizon calculé pour le coucher.
  Position du soleil au quart d'heure avec SunCalc.
- **Lieux choisis à la main** : 73 lieux, dont 61 vérifiés à pied ; les 12
  importés d'OSM (Caparica, Almada) restent marqués « à vérifier » tant que
  personne n'y est allé.
- **Météo** : Open-Meteo (nuages, température) module la recommandation.
- **Communauté** : `api/live.ts` reçoit les réponses de ceux qui sont à moins de
  150 m du lieu (contrôlé côté serveur). Une réponse vaut 45 min.

## Stack

| Couche | Choix |
|---|---|
| Front | React 18, TypeScript, Vite, Tailwind 3 |
| Carte | MapLibre GL, fonds CARTO / OpenFreeMap, chargée seulement à l'ouverture de l'onglet Carte |
| API | Fonction Vercel `api/live.ts` (Node, sans import relatif) |
| Base | Neon Postgres — branche `dev` en local, `production` pour Vercel |
| Hébergement | Vercel, déploiement à chaque merge sur `main` |

## Démarrer

```bash
npm ci
# .env : DATABASE_URL (branche Neon dev), VITE_CARTO_API_KEY (optionnel)
npm run dev
```

| Commande | Rôle |
|---|---|
| `npm run typecheck` | Types |
| `npm test` | Tests unitaires (Vitest) : moteur d'ombres, terrain, recommandations, i18n |
| `npm run test:e2e` | L'app réelle dans Chromium, tailles iPhone et Android (Playwright) |
| `node scripts/db-live.mjs <URL>` | Applique les migrations `db/*.sql` |
| `node scripts/smoke-deploy.mjs <url>` | Vérifie une URL déployée |

La CI (`.github/workflows/ci.yml`) rejoue types, tests, build et e2e sur chaque PR.

## Données

Les fichiers de `src/data/` sont générés par `scripts/fetch-*.mjs` et vérifiés
par `scripts/verify-*.mjs` — ne pas les éditer à la main.

## Design

Direction « Contre-jour » : cartes crème coupées en diagonale soleil / ombre à
l'angle réel du soleil, couleurs qui suivent l'heure de la journée. Règles et
tokens dans [`DESIGN.md`](DESIGN.md).
