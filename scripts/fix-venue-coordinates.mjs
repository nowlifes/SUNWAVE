// Moves venue coordinates that land INSIDE an OSM building footprint out to the
// nearest open ground (street / courtyard / square), keeping a 3 m clearance
// from every wall.
//
// Why the nearest open point: a venue point inside a block is a geocoded
// address centroid, not the terrace. The terrace is on the street the address
// opens onto, which — with no street geometry in the dataset — is by
// construction the closest point outside the footprint. The search is a
// deterministic spiral (36 bearings x 1 m rings), so the result is stable.
//
// Rewrites src/data/lisbonVenues.ts in place (both `lat:`/`lng:` and the
// duplicated pair inside `poly(...)`), and prints a before/after report.
//
// Run with: TZ=Europe/Lisbon node scripts/fix-venue-coordinates.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const CLEARANCE_M = 3;
const MAX_RADIUS_M = 80;
const BEARINGS = 36;

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { lisbonVenues } = await server.ssrLoadModule('/src/data/lisbonVenues.ts');
  const { lisbonBuildings } = await server.ssrLoadModule('/src/data/lisbonBuildings.ts');
  const { ShadowService } = await server.ssrLoadModule('/src/services/ShadowService.ts');

  const M_PER_DEG_LAT = 110540;
  const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
  const dist = (a, b) =>
    Math.hypot((b.lng - a.lng) * mPerDegLng(a.lat), (b.lat - a.lat) * M_PER_DEG_LAT);
  const ctr = (b) => {
    let la = 0, ln = 0;
    for (const p of b.points) { la += p.lat; ln += p.lng; }
    return { lat: la / b.points.length, lng: ln / b.points.length };
  };
  const offset = (p, dxM, dyM) => ({
    lat: p.lat + dyM / M_PER_DEG_LAT,
    lng: p.lng + dxM / mPerDegLng(p.lat),
  });

  // Distance from q to a polygon's boundary, in metres (local flat projection).
  function distToEdges(q, points) {
    const kx = mPerDegLng(q.lat), ky = M_PER_DEG_LAT;
    const px = (p) => [(p.lng - q.lng) * kx, (p.lat - q.lat) * ky];
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const [ax, ay] = px(points[i]);
      const [bx, by] = px(points[(i + 1) % points.length]);
      const vx = bx - ax, vy = by - ay;
      const len2 = vx * vx + vy * vy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * vx + ay * vy) / len2));
      best = Math.min(best, Math.hypot(ax + t * vx, ay + t * vy));
    }
    return best;
  }

  const neighbours = (q, r) => lisbonBuildings.filter((b) => dist(q, ctr(b)) <= r);

  function isFree(q, near) {
    for (const b of near) {
      if (ShadowService.pointInPolygon(q, b.points)) return false;
      if (distToEdges(q, b.points) < CLEARANCE_M) return false;
    }
    return true;
  }

  const results = [];
  const rooftops = [];
  for (const v of lisbonVenues) {
    const q = { lat: v.latitude, lng: v.longitude };
    const near80 = neighbours(q, 80);
    const hit = near80.find((b) => ShadowService.pointInPolygon(q, b.points));
    if (!hit) continue;

    // A rooftop bar IS inside the footprint — that is where it stands. Moving
    // it to the street would be a fabricated fix. Its real error is vertical
    // (the engine reads it at ground level), which is a separate problem.
    if (v.category === 'rooftop') { rooftops.push({ v, hit }); continue; }

    let found = null;
    for (let r = 1; r <= MAX_RADIUS_M && !found; r++) {
      const near = neighbours(q, 80 + r);
      for (let i = 0; i < BEARINGS; i++) {
        const th = (2 * Math.PI * i) / BEARINGS;
        const cand = offset(q, r * Math.sin(th), r * Math.cos(th));
        if (isFree(cand, near)) { found = { p: cand, r }; break; }
      }
    }
    results.push({ v, hit, found });
  }

  const moved = results.filter((r) => r.found);
  const stuck = results.filter((r) => !r.found);

  const round6 = (n) => Number(n.toFixed(6));
  let src = readFileSync('src/data/lisbonVenues.ts', 'utf8');
  let patched = 0;

  for (const { v, found } of moved) {
    const oldLat = v.latitude, oldLng = v.longitude;
    const nLat = round6(found.p.lat), nLng = round6(found.p.lng);
    // Locate this venue's spec block by its name, then patch inside it only.
    if (v.name.includes("'")) throw new Error(`name needs escaping: ${v.name}`);
    const nameLit = `name: '${v.name}'`;
    const idx = src.indexOf(nameLit);
    if (idx === -1) throw new Error(`venue spec not found in source: ${v.name}`);
    if (src.indexOf(nameLit, idx + 1) !== -1) throw new Error(`ambiguous venue name: ${v.name}`);
    const end = src.indexOf('\n  }),', idx);
    if (end === -1) throw new Error(`unterminated venue spec: ${v.name}`);
    let block = src.slice(idx, end);

    // Source literals carry trailing zeros (`38.7160`) that the parsed number
    // does not, so match the literal and compare numerically instead of
    // textually.
    const NUM = '(-?\\d+\\.?\\d*)';
    // Test the match separately: a venue that only moved north/south keeps the
    // same rounded lng, so "text changed" is not a valid success signal.
    const swap = (re, build) => {
      if (!re.test(block)) throw new Error(`no ${re} in spec for ${v.name}`);
      block = block.replace(re, (...m) => build(m));
    };
    swap(new RegExp(`lat: ${NUM},`), ([, a]) => {
      if (Number(a) !== oldLat) throw new Error(`lat mismatch for ${v.name}`);
      return `lat: ${nLat},`;
    });
    swap(new RegExp(`lng: ${NUM},`), ([, a]) => {
      if (Number(a) !== oldLng) throw new Error(`lng mismatch for ${v.name}`);
      return `lng: ${nLng},`;
    });
    if (/poly\(/.test(block)) {
      swap(new RegExp(`poly\\(${NUM}, ${NUM},`), ([, a, b]) => {
        if (Number(a) !== oldLat || Number(b) !== oldLng)
          throw new Error(`poly mismatch for ${v.name}`);
        return `poly(${nLat}, ${nLng},`;
      });
    }
    src = src.slice(0, idx) + block + src.slice(end);
    patched++;
  }

  console.log(`${results.length} venue coordinates were inside a building footprint.`);
  console.log(`moved: ${moved.length}   unresolvable: ${stuck.length}   patched in source: ${patched}\n`);
  for (const { v, hit, found } of results) {
    const d = found ? `${found.r} m` : 'NO FREE POINT';
    console.log(
      `  ${v.name.padEnd(34)} ${String(v.latitude)},${String(v.longitude)}` +
        (found ? ` -> ${round6(found.p.lat)},${round6(found.p.lng)}` : '') +
        `  (${hit.id}, moved ${d})`
    );
  }

  if (rooftops.length) {
    console.log(`\nNOT moved — rooftops, legitimately above their footprint:`);
    for (const { v, hit } of rooftops) console.log(`  ${v.name.padEnd(34)} (${hit.id})`);
  }

  if (!DRY && patched) {
    writeFileSync('src/data/lisbonVenues.ts', src);
    console.log(`\nsrc/data/lisbonVenues.ts rewritten (${patched} venues).`);
  } else {
    console.log('\ndry run — nothing written.');
  }
} finally {
  await server.close();
}
