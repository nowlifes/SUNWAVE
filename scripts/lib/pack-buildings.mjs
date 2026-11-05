// Format compact des emprises de bâtiments (src/data/lisbonBuildings.ts).
//
// Un bâtiment = un tableau plat d'entiers :
//   [osmId, hauteurM, indexSource, lat0, lng0, dLat1, dLng1, ...]
// où lat0/lng0 sont en millionièmes de degré et chaque point suivant est
// l'écart au précédent. Les coordonnées sources ont 6 décimales : le passage
// en entiers puis le retour (÷ 1e6) redonne exactement le même nombre.
//
// Pourquoi : les coordonnées absolues (« 38.714862 ») pesaient 387 Ko gzip,
// plus des deux tiers du premier chargement. Les écarts (« 55 », « -29 »)
// compressent bien mieux. Le décodeur côté app est dans lisbonBuildings.ts.

const E6 = 1e6;

/** [osmId, [[lat,lng],...], heightM, sourceIdx] → tableau plat compact. */
export function packBuilding([osmId, points, height, sourceIdx]) {
  const out = [osmId, height, sourceIdx];
  let pLat = 0;
  let pLng = 0;
  for (const [lat, lng] of points) {
    const iLat = Math.round(lat * E6);
    const iLng = Math.round(lng * E6);
    if (iLat / E6 !== lat || iLng / E6 !== lng) {
      throw new Error(`coordonnée non représentable à 6 décimales : ${lat},${lng} (bâtiment ${osmId})`);
    }
    out.push(iLat - pLat, iLng - pLng);
    pLat = iLat;
    pLng = iLng;
  }
  return out;
}

/** L'inverse de packBuilding. */
export function unpackBuilding(flat) {
  const [osmId, height, sourceIdx] = flat;
  const points = [];
  let lat = 0;
  let lng = 0;
  for (let i = 3; i < flat.length; i += 2) {
    lat += flat[i];
    lng += flat[i + 1];
    points.push([lat / E6, lng / E6]);
  }
  return [osmId, points, height, sourceIdx];
}

/** Tout ce qui suit l'en-tête de src/data/lisbonBuildings.ts : imports, données
 *  compactes (un bâtiment par ligne — voir la note sur les lignes trop longues)
 *  et décodeur. `buildings` est au format d'origine [osmId, [[lat,lng],...], h, s]. */
export function renderBuildingsBody(buildings) {
  const lines = buildings.map((b) => JSON.stringify(packBuilding(b))).join(',\n');
  return `import type { BuildingFootprint, HeightSource } from '@/types';
import { TerrainService } from '@/services/TerrainService';

// Un bâtiment = [osmId (négatif = relation), hauteurM, indexSource,
//                lat0, lng0, dLat1, dLng1, ...]
// Coordonnées en millionièmes de degré ; après le premier point, chaque point
// est l'écart au précédent. Format et raison : scripts/lib/pack-buildings.mjs.
type RawBuilding = number[];

const E6 = 1e6;

const HEIGHT_SOURCES: HeightSource[] = ['tagged', 'levels', 'estimated'];

// One tuple per line, not a single JSON.stringify(compact) blob: a 1.1MB
// single line here made \`vite build\` (not \`vite\` dev/SSR, which is why this
// went unnoticed) hang for good — a regex somewhere in the Rollup/Vite
// pipeline backtracks catastrophically on a single line that long.
const RAW_BUILDINGS: RawBuilding[] = [
${lines}
];

export const lisbonBuildings: BuildingFootprint[] = RAW_BUILDINGS.map((flat) => {
  const [osmId, height, sourceIdx] = flat;
  const points: { lat: number; lng: number }[] = [];
  let iLat = 0;
  let iLng = 0;
  let sumLat = 0;
  let sumLng = 0;
  for (let i = 3; i < flat.length; i += 2) {
    iLat += flat[i];
    iLng += flat[i + 1];
    const lat = iLat / E6;
    const lng = iLng / E6;
    points.push({ lat, lng });
    sumLat += lat;
    sumLng += lng;
  }
  const centroid = { lat: sumLat / points.length, lng: sumLng / points.length };
  return {
    id: osmId < 0 ? \`b_osm_r\${-osmId}\` : \`b_osm_\${osmId}\`,
    points,
    height,
    heightSource: HEIGHT_SOURCES[sourceIdx],
    altitude: TerrainService.altitudeAtRounded(centroid),
  };
});
`;
}

/** Lit le littéral du fichier de données, ancien ou nouveau format, et renvoie
 *  toujours l'ancien : [osmId, [[lat,lng],...], heightM, sourceIdx][]. */
export function readBuildingsLiteral(src) {
  const marker = 'const RAW_BUILDINGS: RawBuilding[] = ';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('RAW_BUILDINGS introuvable — le format du fichier a changé ?');
  const open = src.indexOf('[', start + marker.length);
  const end = src.indexOf('];', open);
  if (open < 0 || end < 0) throw new Error('littéral RAW_BUILDINGS non délimité');
  const raw = JSON.parse(src.slice(open, end + 1));
  return raw.map((b) => (typeof b[1] === 'number' ? unpackBuilding(b) : b));
}
