// One-shot verification script (not part of the app) — loads the real venue
// module through Vite's SSR loader and checks the UNCERTAINTY BAND, not the
// central figure: a wide-open place must have a band of ~0 (no neighbour
// height can change its answer), a dense Alfama/Bairro Alto street must have a
// visibly wider one. If those two ever look alike, the band is decorative.
// The whole dataset is Lisbon. Sun position is computed with local-time Date
// objects, so running this on a machine set to another zone shifts every curve
// by that offset and the checks below fail for a reason that is not the code.
// Forced, not defaulted: an exported TZ in the shell would otherwise win and
// the script would silently check a city that is not the one in the data.
process.env.TZ = 'Europe/Lisbon';

import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const t0 = performance.now();
  const { lisbonVenues } = await server.ssrLoadModule('/src/data/lisbonVenues.ts');
  const t1 = performance.now();
  console.log(`Loaded ${lisbonVenues.length} venues in ${(t1 - t0).toFixed(0)}ms (3 physics passes x 24h each).`);

  const byName = Object.fromEntries(lisbonVenues.map((v) => [v.name, v]));
  let allOk = true;
  const fail = (msg) => { console.log(`  !! ${msg}`); allOk = false; };

  // --- 1. Structural invariants, every venue, every hour ---------------------
  for (const v of lisbonVenues) {
    const { low, mid, high } = v.sunBand;
    if (mid !== v.sunExposureByHour) fail(`${v.name}: sunBand.mid is not the same array as sunExposureByHour`);
    if (low.length !== 24 || mid.length !== 24 || high.length !== 24) fail(`${v.name}: band is not 24 values`);
    for (let h = 0; h < 24; h++) {
      if (!(low[h] <= mid[h] && mid[h] <= high[h])) fail(`${v.name} @${h}h: ${low[h]}/${mid[h]}/${high[h]} not ordered`);
      if (low[h] < 0 || high[h] > 100) fail(`${v.name} @${h}h: band out of 0-100`);
    }
    const { tagged, levels, estimated, total } = v.heightProvenance;
    if (tagged + levels + estimated !== total) fail(`${v.name}: provenance counts do not sum to total`);
  }
  console.log(`Invariants checked on ${lisbonVenues.length} venues x 24h (order, range, provenance sums).`);

  // --- 2. Width at 13:30, the hour the app is judged on ----------------------
  const widthAt = (v, h) => v.sunBand.high[h] - v.sunBand.low[h];
  const H = 13;

  const open = byName['Praia de Carcavelos'];
  const openWidth = widthAt(open, H);
  console.log(`\n${open.name} @${H}h -> ${open.sunBand.low[H]}-${open.sunBand.high[H]}% (width ${openWidth}, ${open.heightProvenance.total} neighbours)`);
  if (openWidth > 2) fail(`open beach band should be ~0, got ${openWidth}`);

  const dense = byName['Hello, Kristof'];
  const denseWidth = widthAt(dense, H);
  console.log(`${dense.name} @${H}h -> ${dense.sunBand.low[H]}-${dense.sunBand.high[H]}% (width ${denseWidth}, ${dense.heightProvenance.total} neighbours)`);

  // --- 3. The band must discriminate ----------------------------------------
  const daylight = [10, 11, 12, 13, 14, 15, 16, 17];
  const meanWidth = (v) => daylight.reduce((s, h) => s + widthAt(v, h), 0) / daylight.length;
  const ranked = [...lisbonVenues].map((v) => ({ v, w: meanWidth(v) })).sort((a, b) => b.w - a.w);
  console.log(`\nWidest mean band, 10h-17h:`);
  for (const { v, w } of ranked.slice(0, 5)) {
    const p = v.heightProvenance;
    console.log(`  ${w.toFixed(1)} pts  ${v.name} (${p.total} neighbours, ${p.estimated} estimated)`);
  }
  console.log(`Narrowest:`);
  for (const { v, w } of ranked.slice(-5)) {
    console.log(`  ${w.toFixed(1)} pts  ${v.name} (${v.heightProvenance.total} neighbours)`);
  }

  const widest = ranked[0].w;
  if (widest < 1) fail(`no venue has a band wider than 1 point — the bracket is not doing anything`);
  const nonZero = ranked.filter((r) => r.w > 0.5).length;
  console.log(`\n${nonZero}/${lisbonVenues.length} venues have a mean band wider than 0.5 pt.`);
  if (nonZero === lisbonVenues.length) fail(`every venue is uncertain — expected the open ones to be flat`);
  if (nonZero === 0) fail(`no venue is uncertain — expected the dense ones to move`);

  console.log(allOk ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  if (!allOk) process.exitCode = 1;
} finally {
  await server.close();
}
