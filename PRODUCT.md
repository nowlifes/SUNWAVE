# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users
Les gens qui vivent à Lisbonne ou y passent (Lisbonne et Costa da Caparica), dehors ou sur le point de sortir, téléphone en main. Leur question : « où aller maintenant pour être au soleil, ou au frais ? ».

## Product Purpose
SUNWAVE dit quels lieux (terrasses, bars, rooftops, plages, parcs, miradouros) sont au soleil ou à l'ombre maintenant et plus tard dans la journée, à partir de la géométrie réelle (bâtiments, relief, course du soleil). Réussite : on sort, on va au bon endroit, on y trouve la lumière promise.

## Positioning
Comme Waze, mais pour le dehors : l'algorithme prédit la lumière de chaque lieu, la communauté confirme sur place (« place en un tap », « confirmé par Léa »).

## Operating Context
Usage mobile, dehors, souvent en plein soleil. Des sessions courtes et des décisions rapides. Écrans : Maintenant (la réponse immédiate), Carte, Coucher (coucher de soleil), Explorer (flâner par envie), Favoris (quand aller dans mes lieux aujourd'hui), Profil.

## Capabilities and Constraints
- L'exposition au soleil et à l'ombre de chaque lieu est calculée heure par heure (sunExposureByHour / shadeExposureByHour), avec le meilleur créneau du jour.
- Les réponses de la communauté sont en direct (api/live), avec pseudo et avatar à contre-jour.
- Les lieux OSM entrent comme « à vérifier » : ils restent hors de la promesse « vérifiés à pied ».
- Déploiement : Vercel (plan Hobby), base Neon.

## Brand Commitments
- Tout en français, sur un ton ni niais ni sérieux-adulte : un parti pris vivant, de la chaleur de Lisbonne.
- Jamais de vert ni de rouge pour dire un état : on dit soleil ou ombre.
- La DA « Contre-jour » v4 a été validée le 2026-09-25 ; les décisions visuelles sont dans DESIGN.md quand il existe.

## Evidence on Hand
- Les données réelles des lieux sont dans src/data/lisbonVenues.ts.
- Il n'y a ni photos de lieux sous licence ni témoignages : ne pas en inventer.

## Product Principles
1. Répondre avant d'expliquer : la lumière de maintenant d'abord, le détail ensuite.
2. La lumière est l'information : soleil = ça brille, ombre = éteint.
3. On ne pousse jamais à partir d'un lieu (pas d'alerte « l'ombre arrive »).
4. La prédiction est honnête : ce qui n'est pas vérifié le dit.
