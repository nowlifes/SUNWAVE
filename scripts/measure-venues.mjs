// Before/after measurement harness. Dumps the 24h sun curve + daily totals for
// the venues that matter for the premortem fixes. Run with TZ=Europe/Lisbon.
import { createServer } from 'vite';

const TARGETS = [
  'Miradouro de Santa Catarina',
  'Miradouro das Portas do Sol',
  'Hello, Kristof',
  'Café Janis',
  'Rio Maravilha',
  'Praia de Carcavelos',
];

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { lisbonVenues } = await server.ssrLoadModule('/src/data/lisbonVenues.ts');
  const { lisbonBuildings } = await server.ssrLoadModule('/src/data/lisbonBuildings.ts');

  // Building height distribution
  const hist = {};
  for (const b of lisbonBuildings) hist[b.height] = (hist[b.height] || 0) + 1;
  const top = Object.entries(hist).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const n = lisbonBuildings.length;
  console.log(`BUILDINGS: ${n}`);
  console.log('  height histogram (top 8): ' + top.map(([h, c]) => `${h}m:${c} (${(100 * c / n).toFixed(1)}%)`).join('  '));
  const mean = lisbonBuildings.reduce((s, b) => s + b.height, 0) / n;
  console.log(`  mean height: ${mean.toFixed(2)}m`);
  if (lisbonBuildings[0].heightSource !== undefined) {
    const src = {};
    for (const b of lisbonBuildings) src[b.heightSource] = (src[b.heightSource] || 0) + 1;
    console.log('  heightSource: ' + Object.entries(src).map(([k, c]) => `${k}:${c} (${(100 * c / n).toFixed(1)}%)`).join('  '));
  }
  if (lisbonBuildings[0].altitude !== undefined) {
    const alts = lisbonBuildings.map((b) => b.altitude).sort((a, b) => a - b);
    console.log(`  altitude: min=${alts[0]}m median=${alts[Math.floor(alts.length / 2)]}m max=${alts[alts.length - 1]}m`);
  }

  const byName = Object.fromEntries(lisbonVenues.map((v) => [v.name, v]));
  console.log('\nVENUE SUN CURVES (daylight hours 6-21):');
  for (const name of TARGETS) {
    const v = byName[name];
    if (!v) { console.log(`  MISSING ${name}`); continue; }
    const c = v.sunExposureByHour;
    const total = c.reduce((s, x) => s + x, 0);
    const day = c.slice(6, 22);
    console.log(`\n  ${name}${v.altitude !== undefined ? ` [alt ${v.altitude}m]` : ''}`);
    console.log(`    total=${total}  midday(12-15)=${c.slice(12, 16).join(',')}`);
    console.log(`    ${day.map((x, i) => `${String(i + 6).padStart(2, '0')}:${String(x).padStart(3)}`).join(' ')}`);
  }
} finally {
  await server.close();
}
