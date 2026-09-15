#!/usr/bin/env node
/**
 * One-shot script: fetch a ground-elevation grid over the Lisbon area covered
 * by `src/data/lisbonVenues.ts`, and generate `src/data/lisbonTerrain.ts`.
 *
 * Usage: node scripts/fetch-lisbon-terrain.mjs
 *
 * WHY A GRID AND NOT PER-BUILDING ALTITUDES
 * -----------------------------------------
 * The naive approach is to ask Open-Meteo for the altitude of each of the ~9000
 * building centroids (~90 requests) and freeze one number per building in
 * `lisbonBuildings.ts`. A grid is strictly better here:
 *   - it is SMALLER in the bundle (~4000 numbers vs ~9000, and the grid is
 *     shared by buildings, venues and the user's own position);
 *   - it answers "what is the altitude HERE" for any point, which buildings
 *     alone cannot do (the user's location, a venue, a point along a shadow);
 *   - the source DEM is itself a ~90m raster, so sampling it on a ~90m grid
 *     loses essentially nothing compared to point queries.
 *
 * RESOLUTION CAVEAT (documented, not solved)
 * ------------------------------------------
 * Open-Meteo's /v1/elevation serves Copernicus DEM GLO-90 — roughly 90m ground
 * resolution. Lisbon's topography is much tighter than that: the drop from
 * Miradouro de Santa Catarina to Rua da Boavista is ~35m over ~120m of ground,
 * i.e. barely more than one DEM cell. Individual altitudes here are therefore
 * smoothed: cliff edges read too low, valley floors too high, by what can be
 * several metres. This is a useful approximation — it captures "the miradouro
 * is 40m above the riverfront", which is the error that matters — not a truth.
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '../src/data/lisbonTerrain.ts');
// Resume cache: Open-Meteo's free elevation endpoint rate-limits well below
// what 44 back-to-back requests need, and a 429 halfway through used to throw
// away every batch already paid for. Batches are cached to disk so a re-run
// picks up where it stopped. Not committed (scripts/.terrain-cache.json is
// gitignored) — it is scaffolding, the generated .ts file is the artefact.
const CACHE_FILE = join(__dirname, '.terrain-cache.json');

// Bounding box covering every cluster in fetch-lisbon-buildings.mjs plus the
// Caparica/Carcavelos venues' longitudes, with a small margin.
// NORTH EDGE, and why it is where it is.
// This wanted to reach 38.7290 to clear the Saldanha cluster's northern margin
// (38.7235 + 450m). Open-Meteo's free elevation tier bills per LOCATION, and a
// grid this size exhausts the daily quota before the last few hundred points
// land — every request, even a single coordinate, then answers 429 until the
// quota resets. Rather than pad the grid with invented values or splice in a
// second DEM (different vintage, visible seam at the join), the grid stops at
// the last fully-fetched row.
// CONSEQUENCE: points north of 38.722974 clamp to the edge row's altitude.
// That band is the northern half of Saldanha, a plateau at ~40-50m, so the
// clamp is close; it is still a clamp, not a measurement. Re-running this
// script after the quota resets with maxLat back at 38.7290 fixes it properly
// (delete scripts/.terrain-cache.json first — the cache is keyed by grid shape
// and will otherwise be ignored).
const BBOX = {
  minLat: 38.6900,
  maxLat: 38.722974,
  minLng: -9.2130,
  maxLng: -9.1220,
};

// ~90m spacing, matching the source DEM's own resolution.
const STEP_M = 90;
const API = 'https://api.open-meteo.com/v1/elevation';
const BATCH = 100; // API hard limit per request
// Open-Meteo's free tier bills per LOCATION, not per request: a 100-coordinate
// call costs ~100 units against a ~600-units/minute ceiling. That means at most
// ~6 of these requests per minute, so anything under a 10s gap gets 429s no
// matter how the retries are tuned — which is exactly what 350ms, 2.5s and 8s
// each ran into, always around batch 38. 12s leaves headroom.
const DELAY_MS = 12000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchBatch(coords, attempt = 0) {
  const lats = coords.map((c) => c.lat.toFixed(6)).join(',');
  const lngs = coords.map((c) => c.lng.toFixed(6)).join(',');
  const url = `${API}?latitude=${lats}&longitude=${lngs}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'SUNWAVE-dev-script/1.0 (one-shot terrain fetch)' },
  });
  if (!res.ok) {
    if (attempt < 7) {
      const backoff = 5000 * 2 ** attempt;
      console.warn(`  ${res.status} ${res.statusText} — retrying in ${backoff}ms`);
      await sleep(backoff);
      return fetchBatch(coords, attempt + 1);
    }
    throw new Error(`Open-Meteo elevation failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!Array.isArray(data.elevation) || data.elevation.length !== coords.length) {
    throw new Error(`Unexpected elevation payload (got ${data.elevation?.length} for ${coords.length} coords)`);
  }
  return data.elevation;
}

async function main() {
  const midLat = (BBOX.minLat + BBOX.maxLat) / 2;
  const latStep = STEP_M / 110540;
  const lngStep = STEP_M / (111320 * Math.cos((midLat * Math.PI) / 180));

  const rows = Math.ceil((BBOX.maxLat - BBOX.minLat) / latStep) + 1;
  const cols = Math.ceil((BBOX.maxLng - BBOX.minLng) / lngStep) + 1;

  const coords = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      coords.push({
        lat: BBOX.minLat + r * latStep,
        lng: BBOX.minLng + c * lngStep,
      });
    }
  }

  const batches = Math.ceil(coords.length / BATCH);
  console.log(
    `Grid ${rows} x ${cols} = ${coords.length} points at ~${STEP_M}m spacing (${batches} requests).`
  );

  // Cache is keyed by grid shape so a change to BBOX/STEP_M invalidates it
  // instead of silently mixing samples from two different grids.
  const cacheKey = `${BBOX.minLat},${BBOX.maxLat},${BBOX.minLng},${BBOX.maxLng},${STEP_M}`;
  let cache = { key: cacheKey, batches: {} };
  if (existsSync(CACHE_FILE)) {
    try {
      const loaded = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      if (loaded.key === cacheKey) {
        cache = loaded;
        console.log(`Resuming from cache: ${Object.keys(cache.batches).length}/${batches} batches already fetched.`);
      } else {
        console.log('Cache is for a different grid — ignoring it.');
      }
    } catch {
      console.log('Cache unreadable — ignoring it.');
    }
  }

  const elevations = [];
  for (let i = 0; i < coords.length; i += BATCH) {
    const done = Math.floor(i / BATCH) + 1;
    const cached = cache.batches[String(done)];
    if (cached) {
      elevations.push(...cached);
      continue;
    }
    const chunk = coords.slice(i, i + BATCH);
    const values = await fetchBatch(chunk);
    cache.batches[String(done)] = values;
    writeFileSync(CACHE_FILE, JSON.stringify(cache), 'utf-8');
    elevations.push(...values);
    if (done % 5 === 0 || done === batches) console.log(`  ${done}/${batches} batches`);
    if (i + BATCH < coords.length) await sleep(DELAY_MS);
  }

  // Round to whole metres — the source DEM's vertical accuracy is several
  // metres, so decimals here would be false precision and pure bundle weight.
  const grid = elevations.map((e) => Math.round(e));
  const min = Math.min(...grid);
  const max = Math.max(...grid);
  console.log(`Elevation range: ${min}m .. ${max}m`);

  const body = `// AUTO-GENERATED by scripts/fetch-lisbon-terrain.mjs — do not hand-edit.
// Source: Open-Meteo /v1/elevation (Copernicus DEM GLO-90, ~90m resolution).
// Regenerate with: node scripts/fetch-lisbon-terrain.mjs
//
// Ground elevation in metres above sea level on a regular lat/lng grid covering
// the Lisbon area used by lisbonVenues.ts. ${rows} rows x ${cols} cols at ~${STEP_M}m
// spacing (${grid.length} samples, range ${min}m..${max}m), row-major from the
// SOUTH-WEST corner (row 0 = minLat, col 0 = minLng).
//
// CAVEAT: the source DEM is ~90m resolution, coarser than Lisbon's topography.
// Altitudes near a sharp crest or a narrow valley are smoothed by several
// metres. Good enough to know a miradouro sits ~40m above the riverfront —
// not good enough to trust a single point to the metre.
// Generated: ${new Date().toISOString()}

export interface TerrainGrid {
  minLat: number;
  minLng: number;
  latStep: number;
  lngStep: number;
  rows: number;
  cols: number;
  /** Row-major, elevations in metres above sea level. */
  elevations: number[];
}

export const lisbonTerrain: TerrainGrid = {
  minLat: ${BBOX.minLat},
  minLng: ${BBOX.minLng},
  latStep: ${latStep},
  lngStep: ${lngStep},
  rows: ${rows},
  cols: ${cols},
  elevations: ${JSON.stringify(grid)},
};
`;

  writeFileSync(OUT_FILE, body, 'utf-8');
  console.log(`Wrote ${OUT_FILE} (${(body.length / 1024).toFixed(0)} KB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
