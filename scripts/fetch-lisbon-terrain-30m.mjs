#!/usr/bin/env node
/**
 * One-shot script: build `src/data/lisbonTerrain30.ts`, a 30m ground-elevation
 * grid over the part of Lisbon where buildings — and therefore shadows — are.
 *
 * Usage: node scripts/fetch-lisbon-terrain-30m.mjs
 *
 * WHY, WHEN scripts/fetch-lisbon-terrain.mjs ALREADY EXISTS
 * ---------------------------------------------------------
 * That one serves Copernicus DEM GLO-90 through Open-Meteo: ~90m cells, and a
 * quota billed PER LOCATION that broke at 38 batches out of 44, leaving
 * everything north of 38.722974 clamped onto the grid's edge row. Lisbon's
 * relief is tighter than 90m: the drop from Miradouro de Santa Catarina to Rua
 * da Boavista is ~35m over ~120m of ground, barely more than one GLO-90 cell,
 * so crests read too low and valley floors too high by several metres — and an
 * altitude error feeds straight into `effectiveHeight` in ShadowService.
 *
 * SOURCE
 * ------
 * Copernicus DEM GLO-30, the 30m global DSM, read directly from the AWS Open
 * Data mirror as a Cloud-Optimised GeoTIFF:
 *   https://copernicus-dem-30m.s3.amazonaws.com/
 * No account, no API key, no quota. Licence: free to use and redistribute,
 * including commercially, with attribution to the European Space Agency /
 * Copernicus Programme (see the header written into the generated file).
 *
 * Being a COG, the tile is read through HTTP range requests: we pull the few
 * hundred KB covering Lisbon, not the ~500MB tile.
 *
 * SURFACE MODEL -> TERRAIN MODEL (the pass that makes this usable)
 * ---------------------------------------------------------------
 * GLO-30 is a DSM: over a city block it measures the ROOF. ShadowService
 * computes a roof altitude as `building.altitude + building.height`, so
 * feeding it a DSM would count the building twice — a 25m block on 50m of
 * ground would stand at 100m instead of 75m, and every terrace behind it
 * would be declared shaded.
 *
 * The footprints needed to fix that are already in the repo. Cells whose
 * centre falls inside a footprint are marked UNKNOWN and refilled by
 * diffusion from the cells around them — streets, squares, gardens, the
 * river. "The ground under this block, read from the streets that surround
 * it" is exactly the number the shadow maths wants.
 *
 * It is an approximation: a block wider than ~120m gets its middle
 * interpolated across, and on a steep slope the fill is flatter than the true
 * ground. Both errors are metres, against the tens of metres of error that
 * using roofs as ground would introduce.
 *
 * WHY A SECOND GRID INSTEAD OF REPLACING THE FIRST
 * ------------------------------------------------
 * The venue set reaches Costa da Caparica (38.645) and Carcavelos (-9.24),
 * ~10km of sea and sand away from the nearest building. Covering that whole
 * rectangle at 30m would trip the grid from ~33k to ~94k values for ground
 * that is flat, at sea level, and has no footprint to cast a shadow. So the
 * fine grid covers the BUILDING envelope plus a margin, and the existing
 * ~90m grid stays as the fallback outside it (see TerrainService).
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fromUrl } from 'geotiff';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '../src/data/lisbonTerrain30.ts');
const BUILDINGS_FILE = join(__dirname, '../src/data/lisbonBuildings.ts');

// Copernicus tiles are named by their SOUTH-WEST corner. Lisbon sits in the
// one-degree cell starting at 38N, 10W.
const TILE =
  'https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N38_00_W010_00_DEM/Copernicus_DSM_COG_10_N38_00_W010_00_DEM.tif';

/** Metres of padding around the building envelope. A shadow is capped at 2000m
 *  in ShadowService, but the altitudes that matter are those of the point and
 *  of its neighbours — 400m is well past the 150m neighbour radius. */
const MARGIN_M = 400;

/** The generated RAW_BUILDINGS literal is plain JSON (numbers and arrays only),
 *  so it can be read without evaluating the module or its imports. */
function readFootprints() {
  const src = readFileSync(BUILDINGS_FILE, 'utf8');
  const marker = 'const RAW_BUILDINGS: RawBuilding[] = ';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('RAW_BUILDINGS not found — did the data format change?');
  // From the END of the marker: the marker itself contains a '[' (RawBuilding[]).
  const open = src.indexOf('[', start + marker.length);
  const end = src.indexOf('];', open);
  if (open < 0 || end < 0) throw new Error('could not delimit the RAW_BUILDINGS literal');
  const raw = JSON.parse(src.slice(open, end + 1));
  // [osmId, [[lat,lng],...], heightM, heightSourceIndex]
  return raw.map((b) => b[1]);
}

function buildingEnvelope(footprints) {
  let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180, n = 0;
  for (const ring of footprints) {
    for (const [lat, lng] of ring) {
      n++;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
  }
  if (n === 0) throw new Error('no building coordinates parsed — did the data format change?');
  const dLat = MARGIN_M / 110540;
  const dLng = MARGIN_M / (111320 * Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180));
  return { n, minLat: minLat - dLat, maxLat: maxLat + dLat, minLng: minLng - dLng, maxLng: maxLng + dLng };
}

const footprints = readFootprints();
const env = buildingEnvelope(footprints);
console.log(`Parsed ${footprints.length} footprints.`);
console.log(`Building envelope (${env.n} vertices, +${MARGIN_M}m): ` +
  `lat ${env.minLat.toFixed(5)}..${env.maxLat.toFixed(5)}, lng ${env.minLng.toFixed(5)}..${env.maxLng.toFixed(5)}`);

console.log('Opening the Copernicus GLO-30 tile over HTTP (range requests)...');
const tiff = await fromUrl(TILE);
const image = await tiff.getImage();

// Geotransform, straight from the file rather than assumed: GLO-30 keeps 1
// arcsecond of latitude everywhere but stretches longitude by latitude band,
// so hard-coding the steps would silently shift the grid sideways.
const [originLng, originLat] = image.getOrigin();
const [resLng, resLatSigned] = image.getResolution();
const resLat = Math.abs(resLatSigned); // north-up images carry a negative y step
const W = image.getWidth();
const H = image.getHeight();
console.log(`Tile ${W}x${H}, origin ${originLat.toFixed(6)},${originLng.toFixed(6)}, ` +
  `step ${resLat.toExponential(4)} lat / ${resLng.toExponential(4)} lng ` +
  `(~${(resLat * 110540).toFixed(1)}m x ~${(resLng * 111320 * Math.cos(38.7 * Math.PI / 180)).toFixed(1)}m)`);

// Pixel window covering the envelope. Row 0 of the raster is the NORTH edge.
const left = Math.max(0, Math.floor((env.minLng - originLng) / resLng));
const right = Math.min(W, Math.ceil((env.maxLng - originLng) / resLng) + 1);
const top = Math.max(0, Math.floor((originLat - env.maxLat) / resLat));
const bottom = Math.min(H, Math.ceil((originLat - env.minLat) / resLat) + 1);
const cols = right - left;
const rows = bottom - top;
if (cols <= 0 || rows <= 0) throw new Error('envelope falls outside the tile — wrong tile for this bbox');
console.log(`Reading window ${cols}x${rows} px (${rows * cols} samples)...`);

const [band] = await image.readRasters({ window: [left, top, right, bottom] });

// Re-order to the app's convention: row-major from the SOUTH-WEST corner.
const elevations = new Array(rows * cols);
let min = Infinity, max = -Infinity, nodata = 0;
for (let r = 0; r < rows; r++) {
  const srcRow = rows - 1 - r; // raster is north-up, our grid is south-up
  for (let c = 0; c < cols; c++) {
    const raw = band[srcRow * cols + c];
    // Copernicus marks the absence of data with a large negative value; over
    // Lisbon it should never appear, so treat it as sea level and count it.
    const v = raw < -1000 || !Number.isFinite(raw) ? (nodata++, 0) : raw;
    const e = Math.round(v);
    elevations[r * cols + c] = e;
    if (e < min) min = e;
    if (e > max) max = e;
  }
}
if (nodata > 0) console.log(`WARNING: ${nodata} no-data samples replaced by 0`);

// --- SURFACE -> TERRAIN ------------------------------------------------------
const gridMinLat = originLat - (bottom - 1) * resLat;
const gridMinLng = originLng + left * resLng;

/** Ray casting in grid axes; `ring` is [[lat,lng],...]. */
function inRing(lat, lng, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    if ((latI > lat) !== (latJ > lat) && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) {
      inside = !inside;
    }
  }
  return inside;
}

const built = new Uint8Array(rows * cols);
for (const ring of footprints) {
  if (ring.length < 3) continue;
  let rLo = Infinity, rHi = -Infinity, cLo = Infinity, cHi = -Infinity;
  for (const [lat, lng] of ring) {
    const r = (lat - gridMinLat) / resLat;
    const c = (lng - gridMinLng) / resLng;
    if (r < rLo) rLo = r;
    if (r > rHi) rHi = r;
    if (c < cLo) cLo = c;
    if (c > cHi) cHi = c;
  }
  for (let r = Math.max(0, Math.floor(rLo)); r <= Math.min(rows - 1, Math.ceil(rHi)); r++) {
    for (let c = Math.max(0, Math.floor(cLo)); c <= Math.min(cols - 1, Math.ceil(cHi)); c++) {
      if (built[r * cols + c]) continue;
      const lat = gridMinLat + r * resLat;
      const lng = gridMinLng + c * resLng;
      if (inRing(lat, lng, ring)) built[r * cols + c] = 1;
    }
  }
}
const builtCount = built.reduce((a, b) => a + b, 0);
console.log(`Cells whose centre sits on a footprint: ${builtCount}/${rows * cols} ` +
  `(${((builtCount / (rows * cols)) * 100).toFixed(1)}%) — refilled from their surroundings.`);
if (builtCount === rows * cols) throw new Error('every cell is built over — nothing left to interpolate from');

// Diffusion fill: each unknown cell takes the mean of its already-known
// neighbours, layer by layer inward from the streets. Deterministic, and it
// cannot invent a value higher than the ground around it.
const dtm = elevations.slice();
const unknown = new Set();
for (let i = 0; i < built.length; i++) if (built[i]) { unknown.add(i); dtm[i] = NaN; }
const deltas = [];
let guard = 0;
while (unknown.size > 0) {
  if (++guard > 1000) throw new Error('diffusion fill did not converge');
  const filledNow = [];
  for (const i of unknown) {
    const r = Math.floor(i / cols), c = i % cols;
    let sum = 0, n = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const rr = r + dr, cc = c + dc;
        if (rr < 0 || rr >= rows || cc < 0 || cc >= cols) continue;
        const v = dtm[rr * cols + cc];
        if (Number.isFinite(v)) { sum += v; n++; }
      }
    }
    if (n > 0) filledNow.push([i, Math.round(sum / n)]);
  }
  if (filledNow.length === 0) throw new Error('diffusion fill stalled — an enclosed built region with no open neighbour');
  for (const [i, v] of filledNow) {
    deltas.push(elevations[i] - v);
    dtm[i] = v;
    unknown.delete(i);
  }
}
deltas.sort((a, b) => a - b);
console.log(`Roof correction over built cells: median ${deltas[Math.floor(deltas.length / 2)]}m, ` +
  `p90 ${deltas[Math.floor(deltas.length * 0.9)]}m, max ${deltas[deltas.length - 1]}m ` +
  `(positive = the DSM stood above the refilled ground, as expected).`);

for (let i = 0; i < dtm.length; i++) elevations[i] = dtm[i];
min = Math.min(...elevations);
max = Math.max(...elevations);

const grid = {
  minLat: gridMinLat, // latitude of our row 0 (southmost)
  minLng: gridMinLng,
  latStep: resLat,
  lngStep: resLng,
  rows,
  cols,
};
console.log(`Grid: ${rows} rows x ${cols} cols, elevations ${min}m..${max}m, ` +
  `SW corner ${grid.minLat.toFixed(6)},${grid.minLng.toFixed(6)}`);

const header = `// AUTO-GENERATED by scripts/fetch-lisbon-terrain-30m.mjs — do not hand-edit.
// Source: Copernicus DEM GLO-30 (30m global DSM), read as a Cloud-Optimised
// GeoTIFF from the AWS Open Data mirror. No API key, no quota.
//   https://copernicus-dem-30m.s3.amazonaws.com/
// Produced using Copernicus WorldDEM-30 (c) DLR e.V. 2010-2014 and (c) Airbus
// Defence and Space GmbH 2014-2018, provided under COPERNICUS by the European
// Union and ESA; all rights reserved. Free to use and redistribute, including
// commercially, with this attribution.
// Regenerate with: node scripts/fetch-lisbon-terrain-30m.mjs
//
// Ground elevation in metres above sea level, ${rows} rows x ${cols} cols
// (${rows * cols} samples, range ${min}m..${max}m), row-major from the
// SOUTH-WEST corner (row 0 = minLat, col 0 = minLng).
//
// COVERAGE: the BUILDING envelope plus ${MARGIN_M}m, not the whole venue set.
// Beaches ~10km out (Caparica, Carcavelos) have no footprint to cast a shadow
// and sit at sea level; they fall back to the ~90m grid in lisbonTerrain.ts.
// See TerrainService, which reads this grid first and that one outside it.
//
// PRECISION: GLO-30 is a SURFACE model — over a dense block it measures the
// ROOFS. Cells covered by an OSM footprint were therefore dropped and refilled
// by diffusion from the open ground around them (streets, squares, the river),
// which makes this grid a TERRAIN model. Wide blocks have their middle
// interpolated and steep slopes come out slightly flat; treat a single
// altitude as +/- a few metres, as before.
// Generated: ${new Date().toISOString()}

import type { TerrainGrid } from './lisbonTerrain';

export const lisbonTerrain30: TerrainGrid = {
  minLat: ${grid.minLat},
  minLng: ${grid.minLng},
  latStep: ${grid.latStep},
  lngStep: ${grid.lngStep},
  rows: ${rows},
  cols: ${cols},
  elevations: [${elevations.join(',')}],
};
`;

writeFileSync(OUT_FILE, header);
console.log(`Wrote ${OUT_FILE} (${(header.length / 1024).toFixed(0)} KB of source).`);
