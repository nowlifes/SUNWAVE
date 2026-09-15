import type { GeoPoint } from '@/types';
import { lisbonTerrain, type TerrainGrid } from '@/data/lisbonTerrain';

// ---------------------------------------------------------------------------
// Ground elevation lookup.
//
// Lisbon is built on hills, and the shadow engine used to assume a flat city:
// `ShadowService.isBlockedByBuilding` compared `atan(height / distance)` to the
// sun's elevation, which is only correct if the building's base and the
// observed point sit at the same altitude. At a miradouro the difference is
// routinely LARGER than the buildings themselves, so the model handed the
// viewpoint the shadows of buildings far below it that can never reach it.
//
// This service answers "how high is the ground here" from a pre-fetched
// ~90m grid (see scripts/fetch-lisbon-terrain.mjs). No network calls at
// runtime — the grid is frozen in src/data/lisbonTerrain.ts.
//
// LIMIT: the source DEM is ~90m resolution and bilinear interpolation between
// those samples smooths crests and valleys. Treat a single altitude as
// +/- several metres, and never as a reason to claim precision the data does
// not have.
// ---------------------------------------------------------------------------

class TerrainServiceClass {
  private grid: TerrainGrid = lisbonTerrain;

  /**
   * Elevation in metres above sea level, bilinearly interpolated from the grid.
   * Points outside the grid clamp to the nearest edge cell — every venue and
   * building in the dataset is inside it, and clamping keeps a stray user
   * location from producing a NaN that would poison the whole shadow calc.
   */
  altitudeAt(point: GeoPoint): number {
    const { minLat, minLng, latStep, lngStep, rows, cols, elevations } = this.grid;

    const fr = (point.lat - minLat) / latStep;
    const fc = (point.lng - minLng) / lngStep;

    const r0 = Math.min(rows - 1, Math.max(0, Math.floor(fr)));
    const c0 = Math.min(cols - 1, Math.max(0, Math.floor(fc)));
    const r1 = Math.min(rows - 1, r0 + 1);
    const c1 = Math.min(cols - 1, c0 + 1);

    // Interpolation weights, clamped so out-of-grid points take the edge value
    // rather than extrapolating a nonsense altitude.
    const tr = Math.min(1, Math.max(0, fr - r0));
    const tc = Math.min(1, Math.max(0, fc - c0));

    const e00 = elevations[r0 * cols + c0];
    const e01 = elevations[r0 * cols + c1];
    const e10 = elevations[r1 * cols + c0];
    const e11 = elevations[r1 * cols + c1];

    const top = e00 + (e01 - e00) * tc;
    const bottom = e10 + (e11 - e10) * tc;
    return top + (bottom - top) * tr;
  }

  /** Rounded to 0.1m — the precision the source DEM can actually support. */
  altitudeAtRounded(point: GeoPoint): number {
    return Math.round(this.altitudeAt(point) * 10) / 10;
  }
}

export const TerrainService = new TerrainServiceClass();
