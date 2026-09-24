#!/usr/bin/env node
/**
 * One-shot script: fetch real Lisbon building footprints + heights from the
 * Overpass API (OpenStreetMap) for the neighbourhoods actually covered by
 * `src/data/lisbonVenues.ts`, and regenerate `src/data/lisbonBuildings.ts`.
 *
 * Usage: node scripts/fetch-lisbon-buildings.mjs
 *
 * Kept in scripts/ so it can be re-run later if venues expand to new areas.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = join(__dirname, '../src/data/lisbonBuildings.ts');

// ---------------------------------------------------------------------------
// Clusters — one per neighbourhood actually used by lisbonVenues.ts, radius
// sized to cover the venues in that cluster + ~300m margin so shadows cast
// onto/from the edges of the covered area are still correct.
// Open beaches (Carcavelos, the southern Caparica coast) stay excluded: open
// sand, no neighbour to cast a shadow. The Costa da Caparica front, Capuchos
// and Almada are in since 2026-09-23 — they carry cafés, bars and viewpoints.
// ---------------------------------------------------------------------------
const CLUSTERS = [
  { name: 'Chiado', lat: 38.7138, lng: -9.142, radiusM: 500 },
  { name: 'Baixa', lat: 38.7118, lng: -9.1375, radiusM: 500 },
  { name: 'Bairro Alto', lat: 38.7155, lng: -9.1445, radiusM: 400 },
  { name: 'Principe Real', lat: 38.717, lng: -9.148, radiusM: 400 },
  { name: 'Alfama', lat: 38.7125, lng: -9.1295, radiusM: 500 },
  { name: 'Cais do Sodre', lat: 38.7068, lng: -9.145, radiusM: 400 },
  { name: 'Santa Catarina', lat: 38.7105, lng: -9.1465, radiusM: 350 },
  { name: 'Estrela', lat: 38.7145, lng: -9.155, radiusM: 450 },
  { name: 'Santos / LX Factory', lat: 38.707, lng: -9.151, radiusM: 450 },
  { name: 'Avenida da Liberdade', lat: 38.719, lng: -9.1435, radiusM: 450 },
  { name: 'Saldanha', lat: 38.7235, lng: -9.145, radiusM: 450 },
  { name: 'Graca', lat: 38.714, lng: -9.1335, radiusM: 400 },
  { name: 'Belem', lat: 38.6975, lng: -9.205, radiusM: 600 },
  // Added 2026-09-15: no venues here yet, but flagged in the handoff as a
  // gap — fetching now so buildings are ready the day venues.ts expands here.
  { name: 'Arroios', lat: 38.7295, lng: -9.1335, radiusM: 450 },
  { name: 'Pena', lat: 38.723, lng: -9.135, radiusM: 400 },
  { name: 'Anjos', lat: 38.7245, lng: -9.1355, radiusM: 350 },
  // Added 2026-09-23: la rive sud, zone jugée importante. Chaque rayon couvre
  // ses lieux + les 150 m de voisins du moteur d'ombre (NEARBY_RADIUS_M).
  // Costa : front de mer, Rua dos Pescadores, Marcelino (480 m du centre).
  { name: 'Costa da Caparica', lat: 38.6445, lng: -9.2375, radiusM: 700, bank: 'south' },
  // Miradouro dos Capuchos, sur l'arriba, 1,2 km à l'est du front de mer.
  { name: 'Capuchos', lat: 38.6434, lng: -9.223, radiusM: 250, bank: 'south' },
  // Cristo Rei (640 m) et Casa da Cerca / Almada Velha (610 m).
  { name: 'Almada', lat: 38.6815, lng: -9.165, radiusM: 800, bank: 'south' },
];

/** Rive d'un cluster. Les médianes par type et la médiane globale se calculent
 *  PAR RIVE : les barres de Caparica et les maisons basses d'Almada tiraient
 *  « apartments » de 5 à 4 étages et « house » de 4 à 3 dans tout Lisbonne. */
const BANK_OF = new Map(CLUSTERS.map((c) => [c.name, c.bank ?? 'north']));
const bankOf = (cluster) => BANK_OF.get(cluster) ?? 'north';

// Adding `relation` to the query roughly doubled its cost and the main
// instance started returning 504s. Mirrors are tried in order.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const LEVEL_HEIGHT_M = 3;

// ---------------------------------------------------------------------------
// HEIGHTS — why the old 9m default was the single worst input in the engine
// ---------------------------------------------------------------------------
// The previous version of this script fell back to a flat 9m (3 floors) for
// every building OSM did not tag, which was 75.6% of the 8980 kept buildings.
// Shadow length is `height / tan(elevation)`, so that one constant set the
// length of three shadows out of four.
//
// First question asked: is the missing data really missing, or was the script
// just not reading it? Probed Overpass directly over Baixa+Chiado+Alfama
// (4382 elements): `height` on 8.5%, `building:levels` on 27.5%, and NOTHING
// at all under `building:levels:aboveground` or `est_height`. 71.8% carry
// neither height nor levels. So it is genuine absence, not a parsing bug.
// Two real (if small) gains were still available and are taken below:
//   - `relation` multipolygon buildings were never queried at all (179 of
//     9761 elements citywide, ~1.8%) — churches, courtyard blocks, the bigger
//     and therefore more shadow-relevant footprints;
//   - `roof:levels` / `roof:height` add a storey or so on 381 buildings.
//
// For what is genuinely absent, the replacement is NOT another constant. The
// tagged 28% is itself a sample of Lisbon, so the estimator is derived from it
// at generation time: median storeys per (neighbourhood cluster x building=
// value), falling back to the cluster median, then the global median. Measured
// on this dataset (2729 tagged samples) that gives, in storeys:
//     Baixa 5   Chiado 5   Saldanha 6   Alfama 4   Bairro Alto 3   Belem 2.7
//     apartments 4   commercial 5   retail 5   hotel 5   office 7   house 3
// which matches what the premortem said from the street: the pombaline Baixa
// is 4-5 floors, not 3, and the old 9m under-read it by ~40%.
//
// Deriving the table from the data rather than hard-coding my own numbers
// means a future re-run tracks OSM as it improves, and it is falsifiable —
// the script prints the table it derived.
const MIN_CLUSTER_TYPE_SAMPLES = 8; // below this, a (cluster,type) median is noise
const GLOBAL_FALLBACK_LEVELS = 4; // citywide median storeys, itself derived below
// Footprints this small are kiosks, sheds, stair huts and lift shafts — giving
// them the median storeys of their neighbourhood would invent tower blocks.
const SMALL_FOOTPRINT_M2 = 60;
const SMALL_FOOTPRINT_MAX_LEVELS = 2;
const MIN_AREA_M2 = 35; // drop footprints too small to meaningfully shadow anything
const SIMPLIFY_EPSILON_M = 2; // Douglas-Peucker tolerance in meters

function buildQuery() {
  // `relation` was missing here originally: OSM models courtyard blocks,
  // churches and any building with a hole as multipolygon relations, so the
  // way-only query silently dropped ~1.8% of footprints — and those are the
  // large ones that cast the longest shadows.
  const clauses = CLUSTERS.map(
    (c) =>
      `  way["building"](around:${c.radiusM},${c.lat},${c.lng});\n` +
      `  relation["building"](around:${c.radiusM},${c.lat},${c.lng});`
  ).join('\n');
  return `[out:json][timeout:300];
(
${clauses}
);
out geom;`;
}

// ---------------------------------------------------------------------------
// Geo helpers (equirectangular local projection, good enough at this scale)
// ---------------------------------------------------------------------------
function toLocalMeters(lat, lng, originLat, originLng) {
  const latRad = (originLat * Math.PI) / 180;
  const x = (lng - originLng) * 111320 * Math.cos(latRad);
  const y = (lat - originLat) * 110540;
  return { x, y };
}

function fromLocalMeters(x, y, originLat, originLng) {
  const latRad = (originLat * Math.PI) / 180;
  const lng = originLng + x / (111320 * Math.cos(latRad));
  const lat = originLat + y / 110540;
  return { lat, lng };
}

function polygonAreaM2(points) {
  // Shoelace on local-meter projection around the polygon's own centroid
  if (points.length < 3) return 0;
  const originLat = points[0].lat;
  const originLng = points[0].lng;
  const local = points.map((p) => toLocalMeters(p.lat, p.lng, originLat, originLng));
  let area = 0;
  for (let i = 0; i < local.length; i++) {
    const j = (i + 1) % local.length;
    area += local[i].x * local[j].y - local[j].x * local[i].y;
  }
  return Math.abs(area / 2);
}

function polygonCentroid(points) {
  let lat = 0;
  let lng = 0;
  for (const p of points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / points.length, lng: lng / points.length };
}

function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (len * len);
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

function douglasPeucker(points, epsilon) {
  if (points.length < 3) return points;
  let maxDist = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

function simplifyPolygon(points, epsilonM) {
  if (points.length <= 4) return points;
  const originLat = points[0].lat;
  const originLng = points[0].lng;
  const local = points.map((p) => toLocalMeters(p.lat, p.lng, originLat, originLng));
  // douglasPeucker expects an open path; polygons from Overpass are closed
  // (first === last). Simplify as an open ring, then re-close.
  const closed = local.length > 1 &&
    local[0].x === local[local.length - 1].x &&
    local[0].y === local[local.length - 1].y;
  const ring = closed ? local.slice(0, -1) : local;
  if (ring.length <= 4) return points;
  const simplified = douglasPeucker([...ring, ring[0]], epsilonM);
  const result = simplified.slice(0, -1); // drop the re-added closing point
  if (result.length < 3) return points; // simplification degenerated, keep original
  return result.map((p) => fromLocalMeters(p.x, p.y, originLat, originLng));
}

function num(value) {
  if (value === undefined || value === null) return null;
  const n = parseFloat(String(value).replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) || n <= 0 ? null : n;
}

/** Storeys above ground, from whichever tag carries them. */
function taggedLevels(tags) {
  if (!tags) return null;
  // `building:levels:aboveground` first: where both exist it is the one that
  // excludes basements, which is what a shadow cares about.
  return (
    num(tags['building:levels:aboveground']) ??
    num(tags['building:levels']) ??
    null
  );
}

/**
 * Height from OSM tags alone, or null if the data simply isn't there.
 * Returns { height, source } so the caller can record provenance.
 */
function taggedHeight(tags) {
  if (!tags) return null;

  const direct = num(tags.height) ?? num(tags['building:height']) ?? num(tags.est_height);
  if (direct !== null) {
    // `height` in OSM already includes the roof, so roof:height is not added.
    return { height: direct, source: 'tagged' };
  }

  const levels = taggedLevels(tags);
  if (levels !== null) {
    let height = levels * LEVEL_HEIGHT_M;
    // The roof sits on top of the storeys and does cast shadow. Prefer an
    // explicit roof:height; otherwise count roof:levels as storeys.
    const roofH = num(tags['roof:height']);
    const roofL = num(tags['roof:levels']);
    if (roofH !== null) height += roofH;
    else if (roofL !== null) height += roofL * LEVEL_HEIGHT_M;
    return { height, source: 'levels' };
  }

  // No storey count, but a roof described: rare, still better than a guess
  // only if it is plausible on its own. It isn't — a roof height says nothing
  // about the building under it — so fall through to estimation.
  return null;
}

function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Builds the typology table from the subset of THIS fetch that OSM did tag.
 * Keys: `${cluster}|${building=}` and `${cluster}`. Values: median storeys.
 */
function deriveLevelTable(samples) {
  const byClusterType = new Map();
  const byCluster = new Map();
  const byType = new Map();
  const byBank = new Map();
  const all = [];

  for (const s of samples) {
    const ct = `${s.cluster}|${s.buildingType}`;
    if (!byClusterType.has(ct)) byClusterType.set(ct, []);
    byClusterType.get(ct).push(s.levels);
    if (!byCluster.has(s.cluster)) byCluster.set(s.cluster, []);
    byCluster.get(s.cluster).push(s.levels);
    const bt = `${bankOf(s.cluster)}|${s.buildingType}`;
    if (!byType.has(bt)) byType.set(bt, []);
    byType.get(bt).push(s.levels);
    const bank = bankOf(s.cluster);
    if (!byBank.has(bank)) byBank.set(bank, []);
    byBank.get(bank).push(s.levels);
    all.push(s.levels);
  }

  const clusterType = new Map();
  for (const [k, v] of byClusterType) {
    if (v.length >= MIN_CLUSTER_TYPE_SAMPLES) clusterType.set(k, median(v));
  }
  const cluster = new Map();
  for (const [k, v] of byCluster) {
    if (v.length >= MIN_CLUSTER_TYPE_SAMPLES) cluster.set(k, median(v));
  }
  const type = new Map();
  for (const [k, v] of byType) {
    if (v.length >= MIN_CLUSTER_TYPE_SAMPLES) type.set(k, median(v));
  }

  const bankGlobal = new Map();
  for (const [k, v] of byBank) bankGlobal.set(k, median(v));

  return {
    clusterType,
    cluster,
    type,
    bankGlobal,
    global: median(all) ?? GLOBAL_FALLBACK_LEVELS,
    sampleCount: all.length,
  };
}

/** Nearest cluster by centroid — the "neighbourhood" dimension of the table. */
function nearestCluster(point) {
  let best = CLUSTERS[0].name;
  let bestDist = Infinity;
  for (const c of CLUSTERS) {
    const { x, y } = toLocalMeters(point.lat, point.lng, c.lat, c.lng);
    const d = Math.hypot(x, y);
    if (d < bestDist) {
      bestDist = d;
      best = c.name;
    }
  }
  return best;
}

/** Height for a building OSM left untagged, from the derived typology table. */
function estimateHeight(table, cluster, buildingType, areaM2) {
  let levels =
    table.clusterType.get(`${cluster}|${buildingType}`) ??
    table.type.get(`${bankOf(cluster)}|${buildingType}`) ??
    table.cluster.get(cluster) ??
    table.bankGlobal.get(bankOf(cluster)) ??
    table.global;

  // A 30m2 footprint with the neighbourhood's median 5 storeys would be a
  // tower in a courtyard. Cap the small stuff.
  if (areaM2 < SMALL_FOOTPRINT_M2) {
    levels = Math.min(levels, SMALL_FOOTPRINT_MAX_LEVELS);
  }

  return levels * LEVEL_HEIGHT_M;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Two passes over the mirror list, with a pause between — Overpass 504s and
 *  429s are load-dependent and usually clear on their own. */
async function queryOverpass(query) {
  let lastError;
  for (let round = 0; round < 2; round++) {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        console.log(`  trying ${new URL(endpoint).host}...`);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
            'User-Agent': 'SUNWAVE-dev-script/1.0 (one-shot building fetch)',
          },
          body: `data=${encodeURIComponent(query)}`,
        });
        if (!res.ok) {
          lastError = new Error(`${new URL(endpoint).host}: ${res.status} ${res.statusText}`);
          console.warn(`    ${res.status} ${res.statusText}`);
          await sleep(5000);
          continue;
        }
        return await res.json();
      } catch (err) {
        lastError = err;
        console.warn(`    ${err.message}`);
        await sleep(5000);
      }
    }
    if (round === 0) {
      console.log('  all mirrors busy — waiting 60s before a second pass');
      await sleep(60000);
    }
  }
  throw lastError ?? new Error('Overpass unreachable');
}

async function main() {
  console.log(`Querying Overpass for ${CLUSTERS.length} clusters...`);
  const query = buildQuery();
  const data = await queryOverpass(query);
  console.log(`Received ${data.elements.length} raw elements.`);

  const seen = new Set();
  const buildings = [];
  let droppedTiny = 0;
  let droppedDegenerate = 0;
  let relationsKept = 0;
  let relationsUnstitchable = 0;

  // Pass 1 — normalise ways and relations into a common {id, geometry, tags}
  // shape so the rest of the pipeline doesn't care which it came from.
  const normalised = [];
  for (const el of data.elements) {
    if (el.type === 'way') {
      if (!el.geometry || el.geometry.length < 3) continue;
      normalised.push({ key: `w${el.id}`, osmId: el.id, geometry: el.geometry, tags: el.tags });
      continue;
    }
    if (el.type === 'relation') {
      // Multipolygon outers can be split across several member ways. Properly
      // stitching them is real work for ~1.8% of the data, so we take the
      // largest member that is already a closed ring on its own and skip the
      // rest rather than inventing a polygon from fragments.
      const outers = (el.members || []).filter(
        (m) => m.role === 'outer' && Array.isArray(m.geometry) && m.geometry.length >= 4
      );
      const closed = outers.filter((m) => {
        const g = m.geometry;
        return g[0].lat === g[g.length - 1].lat && g[0].lon === g[g.length - 1].lon;
      });
      if (!closed.length) {
        relationsUnstitchable++;
        continue;
      }
      closed.sort((a, b) => b.geometry.length - a.geometry.length);
      relationsKept++;
      normalised.push({
        key: `r${el.id}`,
        osmId: el.id,
        geometry: closed[0].geometry,
        tags: el.tags,
        isRelation: true,
      });
    }
  }

  // Pass 2 — geometry + the tagged-height sample used to derive the estimator.
  const prepared = [];
  const levelSamples = [];

  for (const el of normalised) {
    const id = el.isRelation ? `b_osm_r${el.osmId}` : `b_osm_${el.osmId}`;
    if (seen.has(id)) continue;
    seen.add(id);

    let points = el.geometry.map((g) => ({ lat: g.lat, lng: g.lon }));
    // Drop the closing duplicate point if present (first === last)
    if (
      points.length > 1 &&
      points[0].lat === points[points.length - 1].lat &&
      points[0].lng === points[points.length - 1].lng
    ) {
      points = points.slice(0, -1);
    }
    if (points.length < 3) {
      droppedDegenerate++;
      continue;
    }

    const area = polygonAreaM2(points);
    if (area < MIN_AREA_M2) {
      droppedTiny++;
      continue;
    }

    const simplified = simplifyPolygon(points, SIMPLIFY_EPSILON_M);
    if (simplified.length < 3) {
      droppedDegenerate++;
      continue;
    }

    const centroid = polygonCentroid(simplified);
    const cluster = nearestCluster(centroid);
    const buildingType = (el.tags && el.tags.building) || 'yes';
    const tagged = taggedHeight(el.tags);

    if (tagged) {
      // Feed the estimator only from real tags, and normalise back to storeys
      // so a `height=15` sample and a `building:levels=5` sample are comparable.
      levelSamples.push({ cluster, buildingType, levels: tagged.height / LEVEL_HEIGHT_M });
    }

    prepared.push({
      id,
      osmId: el.isRelation ? -el.osmId : el.osmId,
      points: simplified,
      area,
      cluster,
      buildingType,
      tagged,
    });
  }

  // Pass 3 — derive the typology table from the tagged subset, then fill the
  // gaps. This has to happen after the whole set is read: the estimator is a
  // property of the dataset, not of any one building.
  const table = deriveLevelTable(levelSamples);
  console.log(
    `\nDerived height estimator from ${table.sampleCount} tagged buildings ` +
      `(global median ${table.global} storeys):`
  );
  console.log('  by cluster:  ' + [...table.cluster].map(([k, v]) => `${k}=${v}`).join('  '));
  console.log('  by type:     ' + [...table.type].map(([k, v]) => `${k}=${v}`).join('  '));
  console.log(`  ${table.clusterType.size} (cluster x type) cells with >= ${MIN_CLUSTER_TYPE_SAMPLES} samples.`);

  const sourceCounts = {};
  for (const p of prepared) {
    let height;
    let heightSource;
    if (p.tagged) {
      height = p.tagged.height;
      heightSource = p.tagged.source;
    } else {
      height = estimateHeight(table, p.cluster, p.buildingType, p.area);
      heightSource = 'estimated';
    }
    sourceCounts[heightSource] = (sourceCounts[heightSource] || 0) + 1;
    buildings.push({ osmId: p.osmId, points: p.points, height, heightSource });
  }

  console.log(
    `\nKept ${buildings.length} buildings (dropped ${droppedTiny} < ${MIN_AREA_M2}m2, ` +
      `${droppedDegenerate} degenerate; relations: ${relationsKept} kept, ${relationsUnstitchable} unstitchable).`
  );
  const total = buildings.length;
  console.log(
    '  heightSource: ' +
      Object.entries(sourceCounts)
        .map(([k, c]) => `${k}=${c} (${((100 * c) / total).toFixed(1)}%)`)
        .join('  ')
  );
  const meanH = buildings.reduce((s, b) => s + b.height, 0) / total;
  console.log(`  mean height: ${meanH.toFixed(2)}m`);

  const avgPointsBefore =
    data.elements.filter((e) => e.type === 'way' && e.geometry).reduce((s, e) => s + e.geometry.length, 0) /
    Math.max(1, data.elements.length);
  const avgPointsAfter = buildings.reduce((s, b) => s + b.points.length, 0) / Math.max(1, buildings.length);
  console.log(`Avg points/polygon: ${avgPointsBefore.toFixed(1)} -> ${avgPointsAfter.toFixed(1)} after simplification.`);

  // Compact encoding to keep bundle size down:
  //   [osmId, [[lat,lng],...], heightM, heightSourceIndex]
  // coordinates rounded to 6 decimals (~11cm precision — plenty for shadow calc),
  // heights rounded to 0.1m, provenance as a single digit. A negative osmId
  // means the footprint came from a multipolygon RELATION, not a way — OSM
  // way and relation ids live in separate namespaces and can collide.
  // Expanded to BuildingFootprint[] once at module load.
  const SOURCE_INDEX = { tagged: 0, levels: 1, estimated: 2 };
  const compact = buildings.map((b) => [
    b.osmId,
    b.points.map((p) => [Math.round(p.lat * 1e6) / 1e6, Math.round(p.lng * 1e6) / 1e6]),
    Math.round(b.height * 10) / 10,
    SOURCE_INDEX[b.heightSource],
  ]);

  const clusterLine = [...table.cluster].map(([k, v]) => `${k} ${v}`).join(', ');
  const typeLine = [...table.type].map(([k, v]) => `${k} ${v}`).join(', ');
  const srcLine = Object.entries(sourceCounts)
    .map(([k, c]) => `${k} ${c} (${((100 * c) / total).toFixed(1)}%)`)
    .join(', ');

  const header = `// AUTO-GENERATED by scripts/fetch-lisbon-buildings.mjs — do not hand-edit.
// Source: OpenStreetMap via Overpass API (https://overpass-api.de/api/interpreter).
// Regenerate with: node scripts/fetch-lisbon-buildings.mjs
//
// ${buildings.length} building footprints (ways + multipolygon relations) across
// ${CLUSTERS.length} Lisbon neighbourhood clusters — the ones actually covered by
// src/data/lisbonVenues.ts. Polygons simplified with a light Douglas-Peucker
// pass (tolerance ${SIMPLIFY_EPSILON_M}m), coordinates rounded to 6 decimals.
//
// HEIGHTS AND THEIR PROVENANCE
// Every building carries a \`heightSource\`, because most of these numbers are
// not measured and the app must never claim otherwise:
//   ${srcLine}
// - tagged     : OSM \`height\` / \`building:height\` / \`est_height\`.
// - levels     : OSM \`building:levels\` (or :aboveground) x ${LEVEL_HEIGHT_M}m, plus the
//                roof where \`roof:height\` / \`roof:levels\` says so.
// - estimated  : NO height data in OSM at all. Filled from a typology table
//                derived at generation time from the ${table.sampleCount} buildings in this
//                very dataset that ARE tagged — median storeys per
//                (neighbourhood x building= value), falling back to the type
//                median, then the cluster median, then ${table.global} storeys.
//                Footprints under ${SMALL_FOOTPRINT_M2}m2 are capped at ${SMALL_FOOTPRINT_MAX_LEVELS} storeys
//                (kiosks, sheds, lift shafts).
//   Median storeys by cluster: ${clusterLine}
//   Median storeys by type:    ${typeLine}
//
// This replaced a flat 9m (3 storeys) fallback that covered 75.6% of the
// previous dataset and under-read the pombaline Baixa — reliably 4-5 storeys —
// by roughly 40%. Since shadow length is height/tan(elevation), that error
// went straight into three shadows out of four.
//
// Ground ALTITUDE is not stored per building: it is looked up at module load
// from the shared ~90m terrain grid (src/data/lisbonTerrain.ts) via
// TerrainService, which is smaller and also serves venues and the user.
// Generated: ${new Date().toISOString()}

import type { BuildingFootprint, HeightSource } from '@/types';
import { TerrainService } from '@/services/TerrainService';

// [osmId (negative = relation), [[lat,lng],...], heightM, heightSourceIndex][]
type RawBuilding = [number, [number, number][], number, number];

const HEIGHT_SOURCES: HeightSource[] = ['tagged', 'levels', 'estimated'];

// One tuple per line, not a single JSON.stringify(compact) blob: a 1.1MB
// single line here made \`vite build\` (not \`vite\` dev/SSR, which is why this
// went unnoticed) hang for good — a regex somewhere in the Rollup/Vite
// pipeline backtracks catastrophically on a single line that long.
const RAW_BUILDINGS: RawBuilding[] = [
${compact.map((b) => JSON.stringify(b)).join(',\n')}
];

export const lisbonBuildings: BuildingFootprint[] = RAW_BUILDINGS.map(
  ([osmId, rawPoints, height, sourceIdx]) => {
    const points = rawPoints.map(([lat, lng]) => ({ lat, lng }));
    let lat = 0;
    let lng = 0;
    for (const p of points) {
      lat += p.lat;
      lng += p.lng;
    }
    const centroid = { lat: lat / points.length, lng: lng / points.length };
    return {
      id: osmId < 0 ? \`b_osm_r\${-osmId}\` : \`b_osm_\${osmId}\`,
      points,
      height,
      heightSource: HEIGHT_SOURCES[sourceIdx],
      altitude: TerrainService.altitudeAtRounded(centroid),
    };
  }
);
`;

  writeFileSync(OUT_FILE, header, 'utf-8');
  console.log(`Wrote ${OUT_FILE} (${(header.length / 1024).toFixed(0)} KB).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
