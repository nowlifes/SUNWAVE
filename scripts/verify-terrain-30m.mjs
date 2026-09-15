// One-shot verification script (not part of the app): does the 30m terrain grid
// actually cover what it claims, does it un-clamp the venues the 90m grid
// truncated, and are its altitudes plausible for places anyone can check?
process.env.TZ = 'Europe/Lisbon';
// Forced, not defaulted: an exported TZ in the shell would otherwise win and
// the script would silently check a city that is not the one in the data.

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { lisbonTerrain } = await server.ssrLoadModule('/src/data/lisbonTerrain.ts');
  const { lisbonTerrain30 } = await server.ssrLoadModule('/src/data/lisbonTerrain30.ts');
  const { TerrainService } = await server.ssrLoadModule('/src/services/TerrainService.ts');
  const { lisbonVenues } = await server.ssrLoadModule('/src/data/lisbonVenues.ts');

  let allOk = true;
  const fail = (m) => { console.log(`  !! ${m}`); allOk = false; };

  const box = (g) => ({
    s: g.minLat, n: g.minLat + (g.rows - 1) * g.latStep,
    w: g.minLng, e: g.minLng + (g.cols - 1) * g.lngStep,
  });
  const fine = box(lisbonTerrain30);
  const coarse = box(lisbonTerrain);
  console.log(`Fine   grid ${lisbonTerrain30.rows}x${lisbonTerrain30.cols} @${(lisbonTerrain30.latStep * 110540).toFixed(0)}m: lat ${fine.s.toFixed(4)}..${fine.n.toFixed(4)}, lng ${fine.w.toFixed(4)}..${fine.e.toFixed(4)}`);
  console.log(`Coarse grid ${lisbonTerrain.rows}x${lisbonTerrain.cols} @${(lisbonTerrain.latStep * 110540).toFixed(0)}m: lat ${coarse.s.toFixed(4)}..${coarse.n.toFixed(4)}, lng ${coarse.w.toFixed(4)}..${coarse.e.toFixed(4)}`);

  // --- 1. Sanity of the grid itself ----------------------------------------
  if (lisbonTerrain30.elevations.length !== lisbonTerrain30.rows * lisbonTerrain30.cols) fail('fine grid length != rows*cols');
  if (lisbonTerrain30.elevations.some((e) => !Number.isFinite(e))) fail('fine grid contains a non-finite elevation');
  const lo = Math.min(...lisbonTerrain30.elevations);
  const hi = Math.max(...lisbonTerrain30.elevations);
  console.log(`Fine grid range: ${lo}m..${hi}m`);
  // Lisbon's high point (Monsanto) is ~226m; anything past 260m or below -10m is a data error.
  if (lo < -10 || hi > 260) fail(`implausible elevation range ${lo}..${hi}`);

  // --- 2. Landmarks anyone can check ---------------------------------------
  // Wide windows on purpose: these are sanity bounds, not survey data.
  // Venues are looked up BY NAME rather than by a hand-typed coordinate: their
  // lat/lng were anchored on the OSM geometry, and a guessed coordinate 100m
  // down the Alfama slope reads 25m lower than the viewpoint itself — which is
  // how this check first failed against data that was right.
  const byName = Object.fromEntries(lisbonVenues.map((v) => [v.name, v]));
  const at = (name, lat, lng) => {
    const v = byName[name];
    return v ? { lat: v.latitude, lng: v.longitude, anchored: true } : { lat, lng, anchored: false };
  };
  const landmarks = [
    { name: 'Praça do Comércio', ...at('Praça do Comércio', 38.7075, -9.1364), min: 0, max: 20 },
    { name: 'Miradouro das Portas do Sol', ...at('Miradouro das Portas do Sol', 38.712, -9.129), min: 35, max: 75 },
    { name: 'Miradouro da Senhora do Monte', ...at('Miradouro da Senhora do Monte', 38.7186, -9.1317), min: 80, max: 130 },
    { name: 'Parque Eduardo VII', ...at('Parque Eduardo VII', 38.7301, -9.1533), min: 50, max: 120 },
    { name: 'Cais do Sodré (riverfront, fixed point)', lat: 38.7062, lng: -9.1449, min: 0, max: 15 },
  ];
  console.log('');
  for (const l of landmarks) {
    const alt = TerrainService.altitudeAtRounded({ lat: l.lat, lng: l.lng });
    const ok = alt >= l.min && alt <= l.max;
    console.log(`${ok ? ' ok ' : ' !! '}${l.name}: ${alt}m (expected ${l.min}-${l.max}m)${l.anchored ? ' [OSM-anchored coords]' : ''}`);
    if (!ok) allOk = false;
  }

  // --- 3. The truncation the 90m grid suffered ------------------------------
  // Venues north of the coarse grid's top row used to read its edge value.
  const truncated = lisbonVenues.filter((v) => v.latitude > coarse.n);
  console.log(`\n${truncated.length} venues sat NORTH of the 90m grid (clamped onto its edge row):`);
  for (const v of truncated.slice(0, 8)) {
    const insideFine = v.latitude >= fine.s && v.latitude <= fine.n && v.longitude >= fine.w && v.longitude <= fine.e;
    console.log(`  ${insideFine ? 'now covered' : 'STILL OUTSIDE'}  ${v.name} (${v.latitude}) -> ${v.altitude}m`);
    if (!insideFine) fail(`${v.name} is still outside the fine grid`);
  }

  // --- 4. Every building vertex must be inside the fine grid ----------------
  const { lisbonBuildings } = await server.ssrLoadModule('/src/data/lisbonBuildings.ts');
  let outside = 0;
  for (const b of lisbonBuildings) {
    for (const p of b.points) {
      if (p.lat < fine.s || p.lat > fine.n || p.lng < fine.w || p.lng > fine.e) outside++;
    }
  }
  console.log(`\nBuilding vertices outside the fine grid: ${outside} (expected 0)`);
  if (outside > 0) fail(`${outside} building vertices fall outside the fine grid`);

  // --- 5. What changed, venue by venue -------------------------------------
  const sample = (g, lat, lng) => {
    const fr = (lat - g.minLat) / g.latStep, fc = (lng - g.minLng) / g.lngStep;
    const r0 = Math.min(g.rows - 1, Math.max(0, Math.floor(fr))), c0 = Math.min(g.cols - 1, Math.max(0, Math.floor(fc)));
    const r1 = Math.min(g.rows - 1, r0 + 1), c1 = Math.min(g.cols - 1, c0 + 1);
    const tr = Math.min(1, Math.max(0, fr - r0)), tc = Math.min(1, Math.max(0, fc - c0));
    const e00 = g.elevations[r0 * g.cols + c0], e01 = g.elevations[r0 * g.cols + c1];
    const e10 = g.elevations[r1 * g.cols + c0], e11 = g.elevations[r1 * g.cols + c1];
    return (e00 + (e01 - e00) * tc) + ((e10 + (e11 - e10) * tc) - (e00 + (e01 - e00) * tc)) * tr;
  };
  const diffs = lisbonVenues.map((v) => ({
    name: v.name,
    old: Math.round(sample(lisbonTerrain, v.latitude, v.longitude)),
    now: v.altitude,
  })).map((d) => ({ ...d, delta: d.now - d.old }));
  diffs.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  console.log('\nBiggest altitude changes (90m grid -> 30m grid):');
  for (const d of diffs.slice(0, 8)) console.log(`  ${String(d.delta > 0 ? '+' : '') + d.delta.toFixed(1)}m  ${d.name}: ${d.old}m -> ${d.now}m`);
  const median = [...diffs].map((d) => Math.abs(d.delta)).sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
  console.log(`Median absolute change across ${diffs.length} venues: ${median.toFixed(1)}m`);

  console.log(allOk ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  if (!allOk) process.exitCode = 1;
} finally {
  await server.close();
}
