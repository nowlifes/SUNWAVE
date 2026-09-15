// One-shot verification script (not part of the app) — loads the real venue
// module through Vite's SSR loader (so @-alias + TS just work exactly like
// in the app) and sanity-checks the physics-based sun curves.
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
  console.log(`Loaded ${lisbonVenues.length} venues in ${(t1 - t0).toFixed(0)}ms (module eval, incl. real physics calc for all 64 venues x 24h).`);

  const byName = Object.fromEntries(lisbonVenues.map((v) => [v.name, v]));

  const checks = [
    // Fully open viewpoint, high on a hill, no polygon-blocking neighbours -> should be near-fully sun-exposed at midday.
    { name: 'Miradouro das Portas do Sol', hour: 13, expect: 'high' },
    // Beach, buildingHeight 0, no dense city buildings nearby -> fully exposed at midday.
    { name: 'Praia da Costa da Caparica', hour: 13, expect: 'high' },
    // Indoor-only bar in dense Saldanha backstreets -> should be shaded most of the day (venue itself may have hasOutdoor=false but curve is still about the point's sky exposure).
    { name: 'Café da Garagem', hour: 6, expect: 'low-or-mid' }, // just after 6am sunrise-ish, low sun angle
    // Rooftop, 26m up, LX Factory -> high midday exposure.
    { name: 'Rio Maravilha', hour: 13, expect: 'high' },
  ];

  let allOk = true;
  for (const c of checks) {
    const v = byName[c.name];
    if (!v) { console.log(`MISSING venue: ${c.name}`); allOk = false; continue; }
    const pct = v.sunExposureByHour[c.hour];
    console.log(`${c.name} @ ${c.hour}:30 -> sun=${pct}% shade=${v.shadeExposureByHour[c.hour]}% (expect ${c.expect})`);
    if (c.expect === 'high' && pct < 50) { console.log(`  !! expected high exposure, got ${pct}`); allOk = false; }
  }

  // Night hours must always be 0% sun.
  const midnightPct = lisbonVenues[0].sunExposureByHour[0];
  console.log(`${lisbonVenues[0].name} @ 00:30 -> sun=${midnightPct}% (expect 0)`);
  if (midnightPct !== 0) { console.log('  !! expected 0 at midnight'); allOk = false; }

  // Full curve dump for one dense-street venue to eyeball a realistic morning-shade / midday-sun / evening-shade shape.
  const denseVenue = byName['Hello, Kristof'];
  console.log(`\nFull sun curve for "${denseVenue.name}" (Bairro Alto slope, dense street):`);
  console.log(denseVenue.sunExposureByHour.map((v, h) => `${String(h).padStart(2, '0')}h:${v}`).join('  '));

  const openVenue = byName['Praia de Carcavelos'];
  console.log(`\nFull sun curve for "${openVenue.name}" (open beach):`);
  console.log(openVenue.sunExposureByHour.map((v, h) => `${String(h).padStart(2, '0')}h:${v}`).join('  '));

  console.log(allOk ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  if (!allOk) process.exitCode = 1;
} finally {
  await server.close();
}
