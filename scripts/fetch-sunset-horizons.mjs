#!/usr/bin/env node
/**
 * One-shot script: build `src/data/sunsetHorizons.ts`, the real horizon seen
 * from each venue towards the setting sun.
 *
 * Usage: node scripts/fetch-sunset-horizons.mjs
 *
 * WHY
 * ---
 * The official sunset (19:32 on 23 September) is when the sun meets a flat,
 * sea-level horizon. Almost nobody in Lisbon has one: from Santa Catarina the
 * sun goes behind a building at 19:23, from the Time Out Market behind the
 * Monsanto ridge at 19:25. From the Costa da Caparica beaches it touches the
 * Atlantic at 19:35. Which place gets the sun INTO THE WATER, and at what
 * minute, is something only terrain + buildings can answer.
 *
 * HOW
 * ---
 * For every azimuth from 230° to 310° (Lisbon's sunsets run from ~238° in
 * December to ~302° in June), march a ray out of the venue:
 *   - 0–500 m: OSM buildings (roof = base altitude + height) and the app's
 *     30 m ground grids, exactly the data the shadow engine uses;
 *   - 500 m–40 km: Copernicus GLO-30 DSM (a surface model: tree and roof tops
 *     included, which is what hides a far sunset), read straight from the COG.
 * Each sample's elevation angle is corrected for Earth curvature and standard
 * refraction (k = 0.13). The highest angle is the horizon; what produced it
 * (water, far coast, hill, building, near relief) is kept alongside.
 *
 * The venue is not one point: like ShadowService, it is the 15 m ring of 12
 * points around it, minus those inside a building. Per azimuth we keep the
 * LOWEST horizon over those points — the spot on the terrace with the view.
 * Without it a beach bar is hidden by its own wall at 17:36 while its sand,
 * 15 m away, sees the sun touch the water at 19:35.
 */
process.env.TZ = 'Europe/Lisbon';
import { createServer } from 'vite';
import { fromUrl } from 'geotiff';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '../src/data/sunsetHorizons.ts');
const TILE =
  'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N38_00_W010_00_DEM/Copernicus_DSM_COG_10_N38_00_W010_00_DEM.tif';

const AZ_MIN = 230, AZ_MAX = 310;
const R = 6371000, K = 0.13;
const EYE_M = 1.6;
const NEAR_M = 500, FAR_M = 40000, STEP_M = 30;
const RING_M = 15;
const M_PER_DEG_LAT = 110540;
/** Codes stored per azimuth — see SunsetService.HORIZON_KIND. */
const KIND = { water: 'w', far: 'f', hill: 'h', building: 'b', relief: 'r' };

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
try {
  const { lisbonVenues } = await server.ssrLoadModule('/src/data/lisbonVenues.ts');
  const { lisbonBuildings } = await server.ssrLoadModule('/src/data/lisbonBuildings.ts');
  const { TerrainService } = await server.ssrLoadModule('/src/services/TerrainService.ts');

  // --- DSM window: the whole western horizon of Lisbon and Caparica --------
  console.log('Opening the Copernicus GLO-30 tile over HTTP (range requests)...');
  const img = await (await fromUrl(TILE)).getImage();
  const [oLng, oLat] = img.getOrigin();
  const [rLng, rLatSigned] = img.getResolution();
  const rLat = Math.abs(rLatSigned);
  const BOX = { s: 38.4, n: 38.85, w: -9.8, e: -9.05 };
  const left = Math.floor((BOX.w - oLng) / rLng), right = Math.ceil((BOX.e - oLng) / rLng);
  const top = Math.floor((oLat - BOX.n) / rLat), bottom = Math.ceil((oLat - BOX.s) / rLat);
  const cols = right - left, rows = bottom - top;
  const [band] = await img.readRasters({ window: [left, top, right, bottom] });
  console.log(`Read ${cols}x${rows} px of DSM.`);
  const dsm = (lat, lng) => {
    const c = Math.round((lng - (oLng + left * rLng)) / rLng);
    const r = Math.round((oLat - top * rLat - lat) / rLat);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return null;
    const v = band[r * cols + c];
    return v < -1000 ? 0 : v;
  };
  const onFineGrid = (p) => TerrainService.fine.some((g) => TerrainService.covers(g, p));

  const inPoly = (x, y, pts) => {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  const drop = (d) => (d * d * (1 - K)) / (2 * R);
  const deg = (rad) => (rad * 180) / Math.PI;

  const out = {};
  const summary = [];
  for (const v of lisbonVenues) {
    const mPerDegLng = 111320 * Math.cos((v.latitude * Math.PI) / 180);
    const toXY = (p) => [(p.lng - v.longitude) * mPerDegLng, (p.lat - v.latitude) * M_PER_DEG_LAT];
    const near = [];
    for (const b of lisbonBuildings) {
      const [x0, y0] = toXY(b.points[0]);
      if (Math.abs(x0) > NEAR_M + 200 || Math.abs(y0) > NEAR_M + 200) continue;
      near.push({ pts: b.points.map(toXY), roof: (b.altitude ?? 0) + b.height });
    }

    // The ring, minus points inside a building; the centre if all are.
    const ring = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 2 * Math.PI;
      ring.push([Math.cos(a) * RING_M, Math.sin(a) * RING_M]);
    }
    let points = ring.filter(([x, y]) => !near.some((b) => inPoly(x, y, b.pts)));
    if (points.length === 0) points = [[0, 0]];
    const eye = v.altitude + EYE_M;

    /** Far field (500 m–40 km) from the centre: 15 m changes nothing there. */
    const farHorizon = (az) => {
      const dx = Math.sin((az * Math.PI) / 180), dy = Math.cos((az * Math.PI) / 180);
      let best = -90, kind = KIND.water;
      for (let d = NEAR_M + STEP_M; d <= FAR_M; d += STEP_M) {
        const h = dsm(v.latitude + (dy * d) / M_PER_DEG_LAT, v.longitude + (dx * d) / mPerDegLng);
        if (h === null) break;
        if (h <= 1) continue; // sea or river: the curvature term below handles it
        const ang = deg(Math.atan2(h - eye - drop(d), d));
        if (ang > best) { best = ang; kind = h > 60 ? KIND.hill : KIND.far; }
      }
      return { best, kind };
    };

    /** Near field (0–500 m) from one ring point: buildings and fine ground. */
    const nearHorizon = (az, [px, py]) => {
      const dx = Math.sin((az * Math.PI) / 180), dy = Math.cos((az * Math.PI) / 180);
      let best = -90, kind = KIND.relief;
      for (const { pts, roof } of near) {
        if (inPoly(px, py, pts)) continue; // a rooftop venue stands on its own roof
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [x1, y1] = [pts[j][0] - px, pts[j][1] - py];
          const [ex, ey] = [pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]];
          const den = dx * ey - dy * ex;
          if (Math.abs(den) < 1e-9) continue;
          const t = (x1 * ey - y1 * ex) / den;
          const u = (x1 * dy - y1 * dx) / den;
          if (t > 1 && t <= NEAR_M && u >= 0 && u <= 1) {
            const ang = deg(Math.atan2(roof - eye - drop(t), t));
            if (ang > best) { best = ang; kind = KIND.building; }
          }
        }
      }
      for (let d = STEP_M; d <= NEAR_M; d += STEP_M) {
        const p = {
          lat: v.latitude + (py + dy * d) / M_PER_DEG_LAT,
          lng: v.longitude + (px + dx * d) / mPerDegLng,
        };
        const h = onFineGrid(p) ? TerrainService.altitudeAt(p) : dsm(p.lat, p.lng);
        if (h === null || h <= 1) continue;
        const ang = deg(Math.atan2(h - eye - drop(d), d));
        if (ang > best) { best = ang; kind = KIND.relief; }
      }
      return { best, kind };
    };

    const dip = -deg(Math.sqrt((2 * Math.max(eye, 0.5) * (1 - K)) / R));
    const angles = [];
    let kinds = '';
    for (let az = AZ_MIN; az <= AZ_MAX; az++) {
      const far = farHorizon(az);
      let best = Infinity, kind = KIND.water;
      for (const p of points) {
        const n = nearHorizon(az, p);
        let a = dip, k = KIND.water;
        if (far.best > a) { a = far.best; k = far.kind; }
        if (n.best > a) { a = n.best; k = n.kind; }
        if (a < best) { best = a; kind = k; }
      }
      // A far coast lower than the geometric horizon reads as the horizon.
      if (kind === KIND.far && best <= 0) kind = KIND.water;
      angles.push(Math.round(best * 10));
      kinds += kind;
    }
    out[v.id] = [angles, kinds];
    summary.push(`${v.name.padEnd(34)} 270°: ${(angles[270 - AZ_MIN] / 10).toFixed(1)}° ${kinds[270 - AZ_MIN]}  (${points.length} pts)`);
  }

  const lines = Object.entries(out).map(([id, [a, k]]) => `  ${JSON.stringify(id)}: [[${a.join(',')}], '${k}'],`);
  writeFileSync(
    OUT_FILE,
    `// AUTO-GENERATED by scripts/fetch-sunset-horizons.mjs — do not hand-edit.
// The horizon seen from each venue towards the setting sun, azimuth ${AZ_MIN}°..${AZ_MAX}°
// by 1°: [angles in tenths of a degree above the geometric horizon, one kind
// code per azimuth — see SunsetService]. Buildings: OpenStreetMap (ODbL).
// DSM: Copernicus GLO-30, produced using Copernicus WorldDEM-30 (c) DLR e.V.
// 2010-2014 and (c) Airbus Defence and Space GmbH 2014-2018, provided under
// COPERNICUS by the European Union and ESA; all rights reserved.
// Regenerate with: node scripts/fetch-sunset-horizons.mjs

export const SUNSET_AZ_MIN = ${AZ_MIN};
export const SUNSET_AZ_MAX = ${AZ_MAX};

export const sunsetHorizons: Record<string, [number[], string]> = {
${lines.join('\n')}
};
`
  );
  console.log(summary.join('\n'));
  console.log(`Wrote ${OUT_FILE} (${Object.keys(out).length} venues).`);
} finally {
  await server.close();
}
