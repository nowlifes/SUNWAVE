import { describe, expect, it } from 'vitest';
import type { TerrainGrid } from '@/data/lisbonTerrain';
import { gridRuns } from './landMask';

// La carte distingue la terre du Tage à partir des grilles de relief : l'eau
// y vaut 0 m (ou moins), la berge la plus basse de Lisbonne est à 2-3 m.

const grid: TerrainGrid = {
  minLat: 38.7,
  minLng: -9.2,
  latStep: 0.001,
  lngStep: 0.001,
  rows: 2,
  cols: 5,
  // rangée sud : eau eau terre terre eau ; rangée nord : terre partout
  elevations: [0, -1, 3, 12, 0, 5, 5, 5, 5, 5],
};

describe('gridRuns', () => {
  it('regroupe les cases de terre contiguës en un rectangle par rangée', () => {
    const land = gridRuns([grid], 'land');
    expect(land.features).toHaveLength(2);
    const [south] = land.features;
    const ring = south.geometry.coordinates[0];
    // de la case 2 à la case 3 : bords à ±½ pas autour des centres
    expect(ring[0][0]).toBeCloseTo(-9.2 + 1.5 * 0.001, 9);
    expect(ring[1][0]).toBeCloseTo(-9.2 + 3.5 * 0.001, 9);
    expect(ring[0][1]).toBeCloseTo(38.7 - 0.5 * 0.001, 9);
    expect(ring[2][1]).toBeCloseTo(38.7 + 0.5 * 0.001, 9);
    expect(ring).toHaveLength(5);
  });
  it("donne l'eau à part, jamais confondue avec la terre", () => {
    const water = gridRuns([grid], 'water');
    expect(water.features).toHaveLength(2);
    const widths = water.features.map((f) => Math.round((f.geometry.coordinates[0][1][0] - f.geometry.coordinates[0][0][0]) / 0.001));
    expect(widths).toEqual([2, 1]);
  });
  it('additionne plusieurs grilles', () => {
    expect(gridRuns([grid, grid], 'land').features).toHaveLength(4);
  });
});
