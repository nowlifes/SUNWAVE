#!/usr/bin/env node
/**
 * Diagnostic-only: how much do the TYPOLOGY-ESTIMATED building heights in
 * lisbonBuildings.ts (72.8% of the dataset, per its own header) actually
 * agree with the independent GHSL measurement in
 * lisbonBuildingHeightsGHSL.ts?
 *
 * This does NOT touch ShadowService or any runtime height. GHSL is a ~90m
 * pixel grid — several buildings routinely share one cell, and rounding a
 * shadow-casting height to a coarse area average would be a worse input than
 * the typology estimate it "corrects", not a better one. So instead of
 * feeding GHSL into the physics, this produces a report: where does the
 * typology estimator hold up, and where is it worth a manual look?
 *
 * Usage: node scripts/ghsl-confidence-report.mjs [--json out.json]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILDINGS_FILE = join(__dirname, '../src/data/lisbonBuildings.ts');
const GHSL_FILE = join(__dirname, '../src/data/lisbonBuildingHeightsGHSL.ts');

// Both source files store their payload as a plain JS array/object literal
// (numbers and short strings only) — same trick the generation scripts use
// to stay readable without a TS loader in the pipeline. No arbitrary code in
// either file, both are AUTO-GENERATED headers we wrote ourselves.
function extractLiteral(src, marker) {
  const declStart = src.indexOf(marker);
  if (declStart === -1) throw new Error(`marker not found: ${marker}`);
  // Skip past any type annotation (e.g. `: RawBuilding[]`) by starting the
  // bracket search at the `=` sign, not at the marker itself — a type like
  // `RawBuilding[]` contains a `[` that is not the literal's opening one.
  const eq = src.indexOf('=', declStart);
  if (eq === -1) throw new Error(`no '=' after marker: ${marker}`);
  const start = eq;
  const bracket = src.indexOf('[', start);
  const brace = src.indexOf('{', start);
  const open = bracket !== -1 && (brace === -1 || bracket < brace) ? bracket : brace;
  if (open === -1) throw new Error(`no literal opener after: ${marker}`);
  const openChar = src[open];
  const closeChar = openChar === '[' ? ']' : '}';
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === openChar) depth++;
    else if (src[i] === closeChar) {
      depth--;
      if (depth === 0) return new Function(`return ${src.slice(open, i + 1)};`)();
    }
  }
  throw new Error(`unbalanced literal after: ${marker}`);
}

const buildingsSrc = readFileSync(BUILDINGS_FILE, 'utf8');
const HEIGHT_SOURCES = extractLiteral(buildingsSrc, 'const HEIGHT_SOURCES');
const RAW_BUILDINGS = extractLiteral(buildingsSrc, 'const RAW_BUILDINGS');

const ghslSrc = readFileSync(GHSL_FILE, 'utf8');
const ghsl = extractLiteral(ghslSrc, 'export const lisbonBuildingHeightsGHSL');

console.log(`Loaded ${RAW_BUILDINGS.length} buildings, GHSL grid ${ghsl.rows}x${ghsl.cols}.`);

/** Nearest-cell sample — NOT bilinear. 0 means "no building at this 90m
 *  pixel", and averaging that with a neighbouring rooftop value would invent
 *  a height that is not in the source data either way. */
function sampleGHSLNearest(lat, lng) {
  const r = Math.round((lat - ghsl.minLat) / ghsl.latStep);
  const c = Math.round((lng - ghsl.minLng) / ghsl.lngStep);
  if (r < 0 || r >= ghsl.rows || c < 0 || c >= ghsl.cols) return null;
  return ghsl.elevations[r * ghsl.cols + c];
}

function centroid(points) {
  let lat = 0, lng = 0;
  for (const [pLat, pLng] of points) { lat += pLat; lng += pLng; }
  return [lat / points.length, lng / points.length];
}

const AGREE_THRESHOLD_M = 3; // ~1 storey — the same bracket ShadowService already treats as "within the guess"

let noReference = 0;
let agree = 0;
let disagree = 0;
let taggedOrLevels = 0;
const disagreements = [];

for (const [osmId, points, heightM, heightSourceIdx] of RAW_BUILDINGS) {
  const heightSource = HEIGHT_SOURCES[heightSourceIdx];
  if (heightSource !== 'estimated') { taggedOrLevels++; continue; } // only auditing the guesses

  const [lat, lng] = centroid(points);
  const ghslHeight = sampleGHSLNearest(lat, lng);

  if (ghslHeight === null || ghslHeight === 0) { noReference++; continue; }

  const diff = heightM - ghslHeight;
  if (Math.abs(diff) <= AGREE_THRESHOLD_M) {
    agree++;
  } else {
    disagree++;
    disagreements.push({ osmId, lat, lng, estimated: heightM, ghsl: Math.round(ghslHeight * 10) / 10, diff: Math.round(diff * 10) / 10 });
  }
}

const audited = agree + disagree;
console.log('');
console.log(`Tagged/levels (not audited, already OSM-derived): ${taggedOrLevels}`);
console.log(`Estimated, no GHSL reference at that pixel:        ${noReference}`);
console.log(`Estimated, GHSL reference available:               ${audited}`);
if (audited > 0) {
  console.log(`  agree (within ${AGREE_THRESHOLD_M}m):    ${agree} (${(100 * agree / audited).toFixed(1)}%)`);
  console.log(`  disagree (> ${AGREE_THRESHOLD_M}m):      ${disagree} (${(100 * disagree / audited).toFixed(1)}%)`);
}

disagreements.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
console.log('');
console.log(`Top 10 disagreements (estimated vs GHSL, metres):`);
for (const d of disagreements.slice(0, 10)) {
  console.log(`  osmId ${d.osmId} @ ${d.lat.toFixed(5)},${d.lng.toFixed(5)}: estimated=${d.estimated}m ghsl=${d.ghsl}m diff=${d.diff > 0 ? '+' : ''}${d.diff}m`);
}

const jsonFlagIdx = process.argv.indexOf('--json');
if (jsonFlagIdx !== -1) {
  const outPath = process.argv[jsonFlagIdx + 1];
  writeFileSync(outPath, JSON.stringify({
    generatedAt: new Date().toISOString(),
    agreeThresholdM: AGREE_THRESHOLD_M,
    taggedOrLevels,
    noReference,
    audited,
    agree,
    disagree,
    disagreements,
  }, null, 2));
  console.log(`\nWrote ${outPath}`);
}
