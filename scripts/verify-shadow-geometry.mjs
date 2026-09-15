// Permanent geometry regression test for ShadowService.
//
// It exists because three bugs in the occlusion path were invisible end-to-end
// — the curves looked plausible the whole time:
//   1. a north/south mirror (bearings built as (sin, -cos) instead of
//      (sin, cos), and read back with atan2(x, -y)), so shadows were cast
//      TOWARD the sun. A wall between the point and the sun shaded nothing;
//      a wall behind the point shaded it.
//   2. the shadow polygon was the footprint TRANSLATED to the far end of the
//      shadow rather than SWEPT along it, so the ground right next to a
//      building — where terraces are — came out sunny.
//   3. the cheap "is it tall enough from here" early-out measured to the
//      building's CENTROID, which is not conservative: along a long facade the
//      nearest wall is close while the centroid is far, so real shade was
//      discarded before the polygon test ever ran.
//
// Run with: TZ=Europe/Lisbon node scripts/verify-shadow-geometry.mjs
import { createServer } from 'vite';

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
let ok = true;
const check = (label, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!cond) ok = false;
};

try {
  const { ShadowService } = await server.ssrLoadModule('/src/services/ShadowService.ts');
  const { SunService } = await server.ssrLoadModule('/src/services/SunService.ts');
  const { TerrainService } = await server.ssrLoadModule('/src/services/TerrainService.ts');

  const P = { lat: 38.7108, lng: -9.1470 };
  const GROUND = TerrainService.altitudeAt(P);
  const M_LAT = 1 / 110540;
  const M_LNG = 1 / (111320 * Math.cos((P.lat * Math.PI) / 180));

  /** A block `dist` m away on `bearing`, `width` m across, 10 m deep, `h` m tall. */
  function block(bearingDeg, h, dist, width) {
    const br = (bearingDeg * Math.PI) / 180;
    const cx = Math.sin(br) * dist;
    const cy = Math.cos(br) * dist;
    const ax = Math.cos(br);
    const ay = -Math.sin(br);
    const half = width / 2;
    const pts = [];
    for (const [u, v] of [[-half, -5], [half, -5], [half, 5], [-half, 5]]) {
      const ex = cx + ax * u + Math.sin(br) * v;
      const ny = cy + ay * u + Math.cos(br) * v;
      pts.push({ lat: P.lat + ny * M_LAT, lng: P.lng + ex * M_LNG });
    }
    // Same ground as the point, so this test isolates GEOMETRY from terrain.
    return { id: 'w', height: h, altitude: GROUND, heightSource: 'tagged', points: pts };
  }

  const noon = new Date();
  noon.setHours(13, 30, 0, 0);
  const sun = SunService.getSunPosition(noon, P.lat, P.lng);
  console.log(
    `sun 13:30 -> azimuth ${sun.azimuth.toFixed(1)}deg, elevation ${sun.elevation.toFixed(1)}deg ` +
      `(northern hemisphere: near solar noon the sun is SOUTH)\n`
  );
  const cov = (b) => ShadowService.computeShadowCoverage(P, 180, [b], noon, P.lat, P.lng);

  // --- 1. Orientation: shade falls AWAY from the sun, not toward it ---------
  const south = cov(block(180, 60, 30, 200));
  const north = cov(block(0, 60, 30, 200));
  const east = cov(block(90, 60, 30, 200));
  const west = cov(block(270, 60, 30, 200));
  console.log(`  60m wall 30m away — S:${south}%  N:${north}%  E:${east}%  W:${west}%`);
  check('A wall between the point and the sun shades it', south > 50, `${south}%`);
  check('A wall on the far side of the point does not', north === 0, `${north}%`);
  check('Shade is cast away from the sun, not toward it', south > north, `S ${south}% vs N ${north}%`);
  check('Side walls at midday shade little', east < 30 && west < 30, `E ${east}% W ${west}%`);

  // --- 2. Sweep: the ground right against a building is in its shadow -------
  // A 20m building 8m south: its shadow reaches ~14m, so the point is inside
  // it. Under the translate-only model this came out sunny.
  const adjacent = cov(block(180, 20, 8, 60));
  console.log(`\n  20m building 8m to the south -> ${adjacent}%`);
  check('A terrace hard against a building to its south is shaded', adjacent > 50, `${adjacent}%`);

  // --- 3. A building too short to reach still leaves the point sunny --------
  const farLow = cov(block(180, 6, 120, 60));
  console.log(`  6m building 120m to the south -> ${farLow}%`);
  check('A low building far away does not shade the point', farLow === 0, `${farLow}%`);

  // --- 4. Terrain: a building whose ROOF is below the point cannot shade ----
  // 8m away, not 25m: at a 54-degree sun a 20m building only throws ~14m of
  // shadow, so from 25m it genuinely would not reach the point and the test
  // would be asserting something false.
  const below = { ...block(180, 20, 8, 200), altitude: GROUND - 40 };
  const above = { ...block(180, 20, 8, 200), altitude: GROUND };
  console.log(`\n  same 20m building, base 40m BELOW the point -> ${cov(below)}%`);
  console.log(`  same 20m building, base level with the point -> ${cov(above)}%`);
  check('A building whose roof sits below the point never shades it', cov(below) === 0, `${cov(below)}%`);
  check('The same building at the point\'s own level does shade it', cov(above) > 50, `${cov(above)}%`);

  console.log(ok ? '\nALL CHECKS PASSED' : '\nSOME CHECKS FAILED');
  if (!ok) process.exitCode = 1;
} finally {
  await server.close();
}
