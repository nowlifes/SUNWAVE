import type { GeoPoint } from '@/types';
import { lisbonTerrain, type TerrainGrid } from '@/data/lisbonTerrain';
import { lisbonTerrain30 } from '@/data/lisbonTerrain30';
import { caparicaTerrain30 } from '@/data/caparicaTerrain30';
import { almadaTerrain30 } from '@/data/almadaTerrain30';

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
// This service answers "how high is the ground here" from pre-fetched grids.
// No network calls at runtime — both grids are frozen in src/data/.
//
// TWO GRIDS, FINE FIRST
// ---------------------
//  - lisbonTerrain30 (~30m, Copernicus GLO-30 read straight from AWS, with the
//    cells under OSM footprints refilled from the surrounding streets so it is
//    a TERRAIN and not a surface model) covers the building envelope — every
//    square metre where a shadow is actually computed.
//  - lisbonTerrain (~90m, Open-Meteo/GLO-90) stays as the fallback outside it:
//    the venue set reaches Costa da Caparica and Carcavelos, ~10km of sea and
//    sand with no footprint to cast a shadow.
//
// The ~90m grid was also TRUNCATED: its quota broke at 38 batches out of 44, so
// everything north of 38.722974 — and everything west of -9.213 or south of
// 38.69 — was clamped onto an edge cell. The fine grid is what un-clamps the
// venues inside the city; the beaches still clamp, at sea level, where it costs
// nothing.
//
// LIMIT: even at 30m, bilinear interpolation between samples smooths crests and
// valleys, and the de-buildinging pass flattens the middle of a wide block.
// Treat a single altitude as +/- several metres, and never as a reason to claim
// precision the data does not have.
// ---------------------------------------------------------------------------

class TerrainServiceClass {
  private coarse: TerrainGrid = lisbonTerrain;
  /** Une grille fine par zone bâtie : Lisbonne, puis la rive sud (Costa da
   *  Caparica avec Capuchos, Almada avec Cristo Rei), ajoutées le 2026-09-23.
   *  Hors de toutes, Capuchos tombait au niveau de la mer sur un bord de la
   *  grille grossière. */
  private fine: TerrainGrid[] = [lisbonTerrain30, caparicaTerrain30, almadaTerrain30];

  /** Is the point inside a grid, with no clamping needed? */
  private covers(grid: TerrainGrid, point: GeoPoint): boolean {
    return (
      point.lat >= grid.minLat &&
      point.lat <= grid.minLat + (grid.rows - 1) * grid.latStep &&
      point.lng >= grid.minLng &&
      point.lng <= grid.minLng + (grid.cols - 1) * grid.lngStep
    );
  }

  /**
   * Elevation in metres above sea level, bilinearly interpolated from the
   * finest grid that actually covers the point.
   *
   * Points outside both grids clamp to the nearest edge cell of the coarse one
   * — clamping keeps a stray user location from producing a NaN that would
   * poison the whole shadow calc.
   */
  altitudeAt(point: GeoPoint): number {
    return this.sample(this.fine.find((g) => this.covers(g, point)) ?? this.coarse, point);
  }

  private sample(grid: TerrainGrid, point: GeoPoint): number {
    const { minLat, minLng, latStep, lngStep, rows, cols, elevations } = grid;

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
