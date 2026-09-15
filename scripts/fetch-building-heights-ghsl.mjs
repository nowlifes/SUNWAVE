#!/usr/bin/env node
/**
 * One-shot script: build `src/data/lisbonBuildingHeightsGHSL.ts`, a 3-arcsecond
 * (~90m) grid of MEASURED building height over the Lisbon building envelope.
 *
 * Usage: node scripts/fetch-building-heights-ghsl.mjs
 *
 * WHY
 * ---
 * lisbonBuildings.ts heights are 70.7% "estimated": a typology table (median
 * storeys by neighbourhood x OSM building= tag) invented because OSM carries
 * no height data for most footprints. That estimate is an editorial guess,
 * not a measurement, and the app's uncertainty band currently reflects it as
 * a flat "+/- 1 storey" with no independent check.
 *
 * GHS-BUILT-H is a real measurement: building height derived from AW3D30 /
 * SRTM30 stereo elevation plus a Sentinel-2 2018 composite, published by the
 * EU Joint Research Centre. Sampling it at each estimated building's centroid
 * gives a second, independent height to compare the typology guess against —
 * the next step (not done by this script) is to fold that comparison into
 * the uncertainty range instead of the arbitrary +/-1 floor.
 *
 * SOURCE
 * ------
 * GHS-BUILT-H R2023A, ANBH variant (Average Net Building Height: height
 * averaged over the BUILT footprint inside each pixel, not diluted by the
 * open ground around it — AGBH does the latter and reads lower over sparse
 * blocks, so ANBH is the one that means "how tall is the building here").
 * Grid: EPSG:4326, 3 arcsec (~90m at this latitude), reference epoch 2018.
 * Downloaded directly from the JRC's public FTP mirror, tiled 10x10 degrees:
 *   https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/
 * No account, no API key. Licence: CC BY 4.0, (c) European Union — see the
 * header written into the generated file.
 *
 * Lisbon falls entirely inside tile R6_C18 (lat 29.1..39.1, lng -10.0..0.0),
 * confirmed by inspecting that tile's geotransform and sampling pixels over
 * central Lisbon (values ~14-22m, consistent with 5-storey Baixa blocks).
 * The tile row/col is still derived from the envelope at runtime — see
 * `tileForLatLng` — so a future venue set that drifts outside R6_C18 fails
 * loudly instead of silently reading the wrong tile.
 *
 * The GHSL tile ships as a zip (not a range-servable COG like the Copernicus
 * DEM), so this script downloads the whole tile once (~20MB) into the OS temp
 * dir and shells out to `unzip` (Info-ZIP, preinstalled on macOS and most
 * Linux) rather than adding a zip-parsing dependency for a one-shot script.
 * Re-running the script reuses the cached zip if it's still there.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fromFile } from 'geotiff';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '../src/data/lisbonBuildingHeightsGHSL.ts');
const BUILDINGS_FILE = join(__dirname, '../src/data/lisbonBuildings.ts');

const BASE_URL =
  'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/' +
  'GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss/V1-0/tiles';
const TILE_PREFIX = 'GHS_BUILT_H_ANBH_E2018_GLOBE_R2023A_4326_3ss_V1_0';

const CACHE_DIR = join(tmpdir(), 'sunwave-ghsl-cache');

/** Margin around the building envelope. GHSL pixels are ~90m; a few cells of
 *  padding is enough context, no diffusion/fill needed like the DTM script —
 *  we sample this grid pointwise, we don't feed it whole into the shadow maths. */
const MARGIN_M = 200;

/** GHSL's global 4326 grid tiles the globe in 10x10 degree cells, row 1 at
 *  the north pole, column 1 at -180 longitude. Confirmed against R6_C18's
 *  actual geotransform (origin lat 39.0996, lng -10.0079) rather than assumed. */
function tileForLatLng(lat, lng) {
  const row = Math.floor((90 - lat) / 10) + 1;
  const col = Math.floor((lng + 180) / 10) + 1;
  return { row, col };
}

/** Same parsing trick as fetch-lisbon-terrain-30m.mjs: the generated
 *  RAW_BUILDINGS literal is plain JSON, readable without evaluating the module. */
function readFootprints() {
  const src = readFileSync(BUILDINGS_FILE, 'utf8');
  const marker = 'const RAW_BUILDINGS: RawBuilding[] = ';
  const start = src.indexOf(marker);
  if (start < 0) throw new Error('RAW_BUILDINGS not found — did the data format change?');
  const open = src.indexOf('[', start + marker.length);
  const end = src.indexOf('];', open);
  if (open < 0 || end < 0) throw new Error('could not delimit the RAW_BUILDINGS literal');
  const raw = JSON.parse(src.slice(open, end + 1));
  return raw.map((b) => b[1]); // [osmId, [[lat,lng],...], heightM, heightSourceIndex]
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

const corners = [
  tileForLatLng(env.minLat, env.minLng),
  tileForLatLng(env.minLat, env.maxLng),
  tileForLatLng(env.maxLat, env.minLng),
  tileForLatLng(env.maxLat, env.maxLng),
];
const uniqueTiles = [...new Set(corners.map((t) => `${t.row}_${t.col}`))];
if (uniqueTiles.length !== 1) {
  throw new Error(
    `Envelope spans ${uniqueTiles.length} GHSL tiles (${uniqueTiles.join(', ')}) — ` +
    `this script only mosaics a single tile. Extend it before widening the venue set this far.`
  );
}
const { row, col } = corners[0];
console.log(`Envelope falls entirely inside GHSL tile R${row}_C${col}.`);

const tileName = `${TILE_PREFIX}_R${row}_C${col}`;
const zipPath = join(CACHE_DIR, `${tileName}.zip`);
const tifPath = join(CACHE_DIR, `${tileName}.tif`);

mkdirSync(CACHE_DIR, { recursive: true });

if (existsSync(tifPath)) {
  console.log(`Using cached tile: ${tifPath}`);
} else {
  if (!existsSync(zipPath)) {
    const url = `${BASE_URL}/${tileName}.zip`;
    console.log(`Downloading ${url} ...`);
    execFileSync('curl', ['-sS', '-f', '-o', zipPath, url], { stdio: 'inherit' });
  } else {
    console.log(`Using cached zip: ${zipPath}`);
  }
  console.log('Extracting the .tif ...');
  execFileSync('unzip', ['-o', '-j', zipPath, `${tileName}.tif`, '-d', CACHE_DIR], { stdio: 'inherit' });
  if (!existsSync(tifPath)) throw new Error(`unzip did not produce ${tifPath} — did the archive layout change?`);
}

console.log('Opening the GHSL tile ...');
const tiff = await fromFile(tifPath);
const image = await tiff.getImage();

const [originLng, originLat] = image.getOrigin();
const [resLng, resLatSigned] = image.getResolution();
const resLat = Math.abs(resLatSigned);
const W = image.getWidth();
const H = image.getHeight();
console.log(`Tile ${W}x${H}, origin ${originLat.toFixed(6)},${originLng.toFixed(6)}, ` +
  `step ${resLat.toExponential(4)} lat / ${resLng.toExponential(4)} lng ` +
  `(~${(resLat * 110540).toFixed(1)}m x ~${(resLng * 111320 * Math.cos(38.7 * Math.PI / 180)).toFixed(1)}m)`);

const left = Math.max(0, Math.floor((env.minLng - originLng) / resLng));
const right = Math.min(W, Math.ceil((env.maxLng - originLng) / resLng) + 1);
const top = Math.max(0, Math.floor((originLat - env.maxLat) / resLat));
const bottom = Math.min(H, Math.ceil((originLat - env.minLat) / resLat) + 1);
const cols = right - left;
const rows = bottom - top;
if (cols <= 0 || rows <= 0) throw new Error('envelope falls outside the tile window — wrong tile for this bbox');
console.log(`Reading window ${cols}x${rows} px (${rows * cols} samples)...`);

const [band] = await image.readRasters({ window: [left, top, right, bottom] });

// Re-order to the app's south-up, row-major convention (matches lisbonTerrain30.ts).
const heights = new Array(rows * cols);
let min = Infinity, max = -Infinity, nodata = 0, builtCells = 0;
for (let r = 0; r < rows; r++) {
  const srcRow = rows - 1 - r;
  for (let c = 0; c < cols; c++) {
    const raw = band[srcRow * cols + c];
    // GHSL uses a large negative sentinel for no-data; 0 means "no building here".
    const v = raw < -1000 || !Number.isFinite(raw) ? (nodata++, 0) : Math.max(0, raw);
    const h = Math.round(v * 10) / 10;
    heights[r * cols + c] = h;
    if (h > 0) builtCells++;
    if (h < min) min = h;
    if (h > max) max = h;
  }
}
if (nodata > 0) console.log(`WARNING: ${nodata} no-data samples replaced by 0`);
console.log(`${builtCells}/${rows * cols} cells (${((builtCells / (rows * cols)) * 100).toFixed(1)}%) have a nonzero GHSL height.`);
console.log(`Heights ${min}m..${max}m.`);

const gridMinLat = originLat - (bottom - 1) * resLat;
const gridMinLng = originLng + left * resLng;

const header = `// AUTO-GENERATED by scripts/fetch-building-heights-ghsl.mjs — do not hand-edit.
// Source: GHS-BUILT-H R2023A, ANBH variant (Average Net Building Height),
// EPSG:4326 3 arcsec (~90m), reference epoch 2018. European Commission Joint
// Research Centre, downloaded from:
//   https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/GHSL/GHS_BUILT_H_GLOBE_R2023A/
// (c) European Union, licensed under CC BY 4.0 (https://creativecommons.org/licenses/by/4.0).
// Reuse allowed provided appropriate credit is given and changes are indicated.
// Tile: R${row}_C${col}. Regenerate with: node scripts/fetch-building-heights-ghsl.mjs
//
// Building height in metres, MEASURED (not typology-estimated), ${rows} rows x
// ${cols} cols (${rows * cols} samples, range ${min}m..${max}m), row-major from the
// SOUTH-WEST corner (row 0 = minLat, col 0 = minLng). 0 = no building detected
// at this pixel (open ground, or a footprint smaller than the ~90m cell).
//
// PURPOSE: an independent check on the typology-estimated heights in
// lisbonBuildings.ts (70.7% of which have no OSM height data at all). Sample
// this grid at a building's centroid and compare against its estimated
// height to replace the current flat "+/-1 storey" uncertainty band with
// something that reflects actual agreement/disagreement with a measurement.
// Not yet wired into ShadowService/VenueSunService — this script only
// produces the reference grid.
// Generated: ${new Date().toISOString()}

import type { TerrainGrid } from './lisbonTerrain';

export const lisbonBuildingHeightsGHSL: TerrainGrid = {
  minLat: ${gridMinLat},
  minLng: ${gridMinLng},
  latStep: ${resLat},
  lngStep: ${resLng},
  rows: ${rows},
  cols: ${cols},
  elevations: [${heights.join(',')}],
};
`;

writeFileSync(OUT_FILE, header);
console.log(`Wrote ${OUT_FILE} (${(header.length / 1024).toFixed(0)} KB of source).`);
