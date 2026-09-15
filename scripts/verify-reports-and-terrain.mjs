// Behaviour proof for the two non-geometric pieces of the premortem fixes:
// the report -> sun-curve correction, and the terrain lookup that the shadow
// engine now depends on. Loads the real modules through Vite's SSR loader.
//
// Run with: TZ=Europe/Lisbon node scripts/verify-reports-and-terrain.mjs
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let ok = true;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) ok = false;
};

try {
  const { TerrainService } = await server.ssrLoadModule('/src/services/TerrainService.ts');
  const { ReportService } = await server.ssrLoadModule('/src/services/ReportService.ts');

  // --- TERRAIN -------------------------------------------------------------
  console.log('--- TerrainService ---');
  const santaCatarina = TerrainService.altitudeAtRounded({ lat: 38.7105, lng: -9.1465 });
  const caisDoSodre = TerrainService.altitudeAtRounded({ lat: 38.7060, lng: -9.1455 });
  const baixa = TerrainService.altitudeAtRounded({ lat: 38.7118, lng: -9.1375 });
  const graca = TerrainService.altitudeAtRounded({ lat: 38.7160, lng: -9.1300 });
  console.log(`  Miradouro Santa Catarina: ${santaCatarina}m`);
  console.log(`  Cais do Sodré (riverfront): ${caisDoSodre}m`);
  console.log(`  Baixa (flat grid): ${baixa}m`);
  console.log(`  Graça (hilltop): ${graca}m`);

  // Ground truth an atlas agrees with: the miradouro is high, the riverfront
  // is near sea level, the Baixa is the flat valley between the hills.
  check('Santa Catarina is well above the riverfront', santaCatarina - caisDoSodre > 20,
    `${(santaCatarina - caisDoSodre).toFixed(1)}m gap`);
  check('Riverfront is near sea level', caisDoSodre >= 0 && caisDoSodre < 20, `${caisDoSodre}m`);
  check('Baixa sits below both miradouros', baixa < santaCatarina && baixa < graca,
    `baixa=${baixa} sc=${santaCatarina} graca=${graca}`);
  check('Graça is a hilltop', graca > 30, `${graca}m`);

  // Out-of-grid clamps instead of producing NaN.
  const far = TerrainService.altitudeAt({ lat: 0, lng: 0 });
  check('Out-of-grid point clamps to a real number', Number.isFinite(far), `${far}`);

  // --- REPORTS -------------------------------------------------------------
  console.log('\n--- ReportService ---');
  const flat = Array.from({ length: 24 }, (_, h) => (h >= 7 && h <= 19 ? 90 : 0));

  ReportService.clearForVenue('v_test');
  check('No reports leaves the curve untouched',
    JSON.stringify(ReportService.applyToCurve('v_test', flat)) === JSON.stringify(flat));

  // One shaded report: softened cap, still a real reduction.
  ReportService.submit('v_test', 'terrace_shaded');
  const one = ReportService.applyToCurve('v_test', flat);
  console.log(`  after 1 shaded report, midday = ${one[13]} (was ${flat[13]})`);
  check('One shaded report lowers midday sun', one[13] < flat[13]);
  check('One shaded report does not fully zero it', one[13] > 25, `${one[13]}`);
  check('Night hours untouched by a shaded report', one[3] === 0);

  // Consensus: full cap.
  ReportService.submit('v_test', 'terrace_shaded');
  ReportService.submit('v_test', 'terrace_shaded');
  const three = ReportService.applyToCurve('v_test', flat);
  console.log(`  after 3 shaded reports, midday = ${three[13]}`);
  check('Three shaded reports apply the full 25% ceiling', three[13] === 25, `${three[13]}`);
  check('Consensus is stronger than a single report', three[13] < one[13]);

  // Contradiction: back to none.
  ReportService.clearForVenue('v_test');
  ReportService.submit('v_test', 'terrace_shaded');
  ReportService.submit('v_test', 'terrace_sunny');
  check('Equal shaded/sunny reports cancel out',
    ReportService.getSunAdjustment('v_test').kind === 'none',
    ReportService.getSunAdjustment('v_test').kind);

  // Sunny consensus raises a shaded computed curve.
  ReportService.clearForVenue('v_test');
  const dim = Array.from({ length: 24 }, (_, h) => (h >= 7 && h <= 19 ? 10 : 0));
  for (let i = 0; i < 3; i++) ReportService.submit('v_test', 'terrace_sunny');
  const lifted = ReportService.applyToCurve('v_test', dim);
  console.log(`  after 3 sunny reports on a dim curve, midday = ${lifted[13]} (was ${dim[13]})`);
  check('Three sunny reports raise midday to the 60% floor', lifted[13] === 60, `${lifted[13]}`);
  check('Sunny reports do not invent night sun', lifted[3] === 0);

  // Irrelevant report types must not move the sun number.
  ReportService.clearForVenue('v_test');
  ReportService.submit('v_test', 'venue_closed');
  ReportService.submit('v_test', 'building_missing');
  check('Non-sun report types leave the curve alone',
    ReportService.getSunAdjustment('v_test').kind === 'none');

  // Expiry: a report older than the TTL stops counting.
  ReportService.clearForVenue('v_test');
  ReportService.submit('v_test', 'terrace_shaded');
  ReportService.submit('v_test', 'terrace_shaded');
  ReportService.submit('v_test', 'terrace_shaded');
  const in60Days = Date.now() + 60 * 24 * 3600 * 1000;
  check('Reports expire after the TTL',
    ReportService.getSunAdjustment('v_test', in60Days).kind === 'none',
    ReportService.getSunAdjustment('v_test', in60Days).kind);

  ReportService.clearForVenue('v_test');

  console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  if (!ok) process.exitCode = 1;
} finally {
  await server.close();
}
