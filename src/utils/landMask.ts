import type { TerrainGrid } from '@/data/lisbonTerrain';

// ---------------------------------------------------------------------------
// Terre et eau, tirées des grilles de relief à 30 m. Les tuiles raster ne
// savent pas distinguer le Tage des quais : un voile « soleil » posé sur
// toute la carte teintait aussi l'eau, et la ville devenait une seule masse.
// Dans ces grilles l'eau vaut 0 m ou moins ; la berge la plus basse de
// Lisbonne (Terreiro do Paço) est à ~3 m. Le seuil de 0,5 m les sépare net.
// ---------------------------------------------------------------------------

const WATER_MAX_M = 0.5;

type Rect = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
};

/** Un rectangle par suite de cases contiguës de même nature, rangée par
 *  rangée : ~400 polygones pour Lisbonne et la rive sud, au lieu de 70 000. */
export function gridRuns(grids: TerrainGrid[], kind: 'land' | 'water'): { type: 'FeatureCollection'; features: Rect[] } {
  const features: Rect[] = [];
  for (const g of grids) {
    const isKind = (v: number) => (kind === 'water' ? v <= WATER_MAX_M : v > WATER_MAX_M);
    for (let r = 0; r < g.rows; r++) {
      const s = g.minLat + (r - 0.5) * g.latStep;
      const n = g.minLat + (r + 0.5) * g.latStep;
      let start = -1;
      for (let c = 0; c <= g.cols; c++) {
        const hit = c < g.cols && isKind(g.elevations[r * g.cols + c]);
        if (hit && start < 0) start = c;
        if (!hit && start >= 0) {
          const w = g.minLng + (start - 0.5) * g.lngStep;
          const e = g.minLng + (c - 0.5) * g.lngStep;
          features.push({
            type: 'Feature',
            properties: {},
            geometry: { type: 'Polygon', coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]] },
          });
          start = -1;
        }
      }
    }
  }
  return { type: 'FeatureCollection', features };
}
