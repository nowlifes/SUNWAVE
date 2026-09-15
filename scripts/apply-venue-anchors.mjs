// Re-anchors the venues that are a PLACE (miradouro, park, square) onto their
// real OSM geometry.
//
// Why this exists, and why the generic pass was not enough: those venues'
// coordinates were not off by a few metres, they were off by 50-250 m. The OSM
// node for Miradouro das Portas do Sol sits 115 m from the coordinate in the
// file; Santa Catarina's is 161 m away; "Rossio Square" pointed 165 m from
// Praça Dom Pedro IV. fix-venue-coordinates.mjs moved each one to the nearest
// open ground, which for a viewpoint hemmed in by a block is the alley next
// door, not the esplanade.
//
// The mapping below is deliberately HAND-WRITTEN, one line per venue, rather
// than fuzzy name matching: Lisbon has three "Largo das Portas do Sol" ways
// and a "Parque Santa Catarina" 8 km away in Oeiras. Each entry is an OSM
// id someone checked.
//
// The anchor inside each polygon is its pole of inaccessibility WITH RESPECT
// TO BUILDINGS: on a 4 m grid, the interior point whose nearest building wall
// is furthest away. That is the open middle of the esplanade — which is what
// a sun app should describe — not the centroid, which on an L-shaped square
// can fall outside it or against a facade.
//
// Run with: TZ=Europe/Lisbon node scripts/apply-venue-anchors.mjs [--dry]
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const DRY = process.argv.includes('--dry');
const GRID_STEP_M = 4;
/** Clearance beyond which a point counts as "open"; more is not better. */
const CLEAR_TARGET_M = 30;

// venue name -> OSM element ("type/id"), with the reason it is that element.
const ANCHORS = {
  'Miradouro das Portas do Sol': 'way/98323044',        // Largo das Portas do Sol, the esplanade itself
  'Miradouro de Santa Luzia': 'way/169007610',          // Jardim Júlio de Castilho, the terrace garden
  'Miradouro de Santa Catarina': 'relation/8065262',    // Jardim do Alto de Santa Catarina
  'Miradouro da Senhora do Monte': 'way/526129020',     // tagged leisure=park + tourism=viewpoint
  'Miradouro da Graça': 'relation/19112367',            // Miradouro Sophia de Mello Breyner Andresen
  'Jardim da Estrela': 'way/23697561',
  'Estrela Park': 'way/23697561',                       // same garden — see the duplicate note printed below
  'Parque Eduardo VII': 'relation/13137361',
  'Jardim da São Pedro de Alcântara': 'way/40705509',   // Jardim de São Pedro de Alcântara
  'Praça do Comércio': 'relation/9218842',
  'Rossio Square': 'way/1317749306',                    // Praça Dom Pedro IV — the Rossio's actual name
  'Praça da Figueira': 'way/1301226315',
  'Praça do Príncipe Real': 'way/160122832',            // Jardim do Príncipe Real
  'Príncipe Real Garden': 'way/160122832',              // same garden — duplicate
  'Praça do Império': 'relation/9227991',               // Jardim da Praça do Império
};

// Venues left alone on purpose, with the reason.
const SKIPPED = {
  'Largo do Carmo': 'no OSM area carries this name — the square in front of the Convento do Carmo is untagged',
  'Santa Justa': 'the Elevador is a structure, not an open area; its coordinate is already outside the footprints',
  'Tapada das Mercês': 'Tapada das Mercês is in Sintra, 15 km away — this venue does not exist in Lisbon',
  'Belém Riverside': 'no OSM area carries this name; the nearest one (Jardim do Rio, way/1182799453) has a degenerate ring with no interior. Its coordinate is already outside every footprint.',
};

const osm = JSON.parse(readFileSync('scripts/.named-cache.json', 'utf8')).elements;
const extra = JSON.parse(readFileSync('scripts/.anchors-cache.json', 'utf8')).elements;
const byKey = new Map();
for (const e of [...osm, ...extra]) byKey.set(`${e.type}/${e.id}`, e);

function ringOf(el) {
  if (el.geometry) return el.geometry.map((p) => ({ lat: p.lat, lng: p.lon }));
  const outer = (el.members || []).filter((m) => m.role === 'outer' && m.geometry);
  const flat = (outer.length ? outer : el.members || []).flatMap((m) => m.geometry || []);
  return flat.map((p) => ({ lat: p.lat, lng: p.lon }));
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { lisbonVenues } = await server.ssrLoadModule('/src/data/lisbonVenues.ts');
  const { lisbonBuildings } = await server.ssrLoadModule('/src/data/lisbonBuildings.ts');
  const { ShadowService } = await server.ssrLoadModule('/src/services/ShadowService.ts');

  const M_LAT = 110540;
  const mLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
  const dist = (a, b) => Math.hypot((b.lng - a.lng) * mLng(a.lat), (b.lat - a.lat) * M_LAT);
  const ctr = (pts) => {
    let la = 0, ln = 0;
    for (const p of pts) { la += p.lat; ln += p.lng; }
    return { lat: la / pts.length, lng: ln / pts.length };
  };
  function distToEdges(q, points) {
    const kx = mLng(q.lat), ky = M_LAT;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i], b = points[(i + 1) % points.length];
      const ax = (a.lng - q.lng) * kx, ay = (a.lat - q.lat) * ky;
      const bx = (b.lng - q.lng) * kx, by = (b.lat - q.lat) * ky;
      const vx = bx - ax, vy = by - ay;
      const l2 = vx * vx + vy * vy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * vx + ay * vy) / l2));
      best = Math.min(best, Math.hypot(ax + t * vx, ay + t * vy));
    }
    return best;
  }

  const round6 = (n) => Number(n.toFixed(6));
  let src = readFileSync('src/data/lisbonVenues.ts', 'utf8');
  const report = [];
  const usedAnchors = new Map();

  for (const [venueName, key] of Object.entries(ANCHORS)) {
    const v = lisbonVenues.find((x) => x.name === venueName);
    if (!v) throw new Error(`venue not in dataset: ${venueName}`);
    const el = byKey.get(key);
    if (!el) throw new Error(`OSM element not in cache: ${key} (${venueName})`);
    const ring = ringOf(el);
    if (ring.length < 3) throw new Error(`${key} has no usable ring (${ring.length} points)`);

    const lats = ring.map((p) => p.lat), lngs = ring.map((p) => p.lng);
    const c = ctr(ring);
    const stepLat = GRID_STEP_M / M_LAT, stepLng = GRID_STEP_M / mLng(c.lat);
    // Radius must follow the polygon: Parque Eduardo VII is 700 m long, so a
    // fixed 250 m around its centroid finds no building at all and every
    // interior point ties at "infinitely clear".
    let radius = 250;
    for (const p of ring) radius = Math.max(radius, dist(c, p) + 250);
    const near = lisbonBuildings.filter((b) => dist(c, ctr(b.points)) <= radius);

    // Keep the previous winner for a duplicate venue so two venues sharing a
    // polygon do not land on the exact same point.
    const taken = usedAnchors.get(key) || [];
    // A narrow strip (a riverside walk) can be thinner than the grid step and
    // contain no sample at all — retry finer before giving up, and only then
    // relax the spacing that keeps duplicate venues apart.
    const search = (stepM, minApart) => {
      const sLat = stepM / M_LAT, sLng = stepM / mLng(c.lat);
      let found = null;
      for (let la = Math.min(...lats); la <= Math.max(...lats); la += sLat) {
        for (let ln = Math.min(...lngs); ln <= Math.max(...lngs); ln += sLng) {
          const q = { lat: la, lng: ln };
          if (!ShadowService.pointInPolygon(q, ring)) continue;
          if (near.some((b) => ShadowService.pointInPolygon(q, b.points))) continue;
          if (taken.some((t) => dist(q, t) < minApart)) continue;
          let clear = Infinity;
          for (const b of near) clear = Math.min(clear, distToEdges(q, b.points));
          // Not "as far from buildings as possible": that maximises distance
          // from the DATA, and the footprint dataset only covers 13
          // neighbourhood clusters — the winner would drift into whichever
          // corner has no buildings mapped. Once a point is clear enough to
          // be open ground, prefer the one nearest the middle of the place,
          // which is where the place actually is.
          const score = Math.min(clear, CLEAR_TARGET_M);
          const fromCentre = dist(q, c);
          if (!found || score > found.score || (score === found.score && fromCentre < found.fromCentre)) {
            found = { q, clear, score, fromCentre };
          }
        }
      }
      return found;
    };
    const best = search(GRID_STEP_M, 25) || search(1, 25) || search(1, 0);
    if (!best) throw new Error(`no open interior point found in ${key} for ${venueName}`);
    usedAnchors.set(key, [...taken, best.q]);

    const oldLat = v.latitude, oldLng = v.longitude;
    const nLat = round6(best.q.lat), nLng = round6(best.q.lng);
    const movedM = dist({ lat: oldLat, lng: oldLng }, best.q);

    if (v.name.includes("'")) throw new Error(`name needs escaping: ${v.name}`);
    const nameLit = `name: '${v.name}'`;
    const idx = src.indexOf(nameLit);
    if (idx === -1) throw new Error(`venue spec not found in source: ${v.name}`);
    if (src.indexOf(nameLit, idx + 1) !== -1) throw new Error(`ambiguous venue name: ${v.name}`);
    const end = src.indexOf('\n  }),', idx);
    let block = src.slice(idx, end);
    const NUM = '(-?\\d+\\.?\\d*)';
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
        if (Number(a) !== oldLat || Number(b) !== oldLng) throw new Error(`poly mismatch for ${v.name}`);
        return `poly(${nLat}, ${nLng},`;
      });
    }
    src = src.slice(0, idx) + block + src.slice(end);
    const countWithin = (q, r) => lisbonBuildings.filter((b) => dist(q, ctr(b.points)) <= r).length;
    report.push({
      venueName, key, name: el.tags?.name, oldLat, oldLng, nLat, nLng, movedM,
      clear: best.clear,
      bldBefore: countWithin({ lat: oldLat, lng: oldLng }, 150),
      bldAfter: countWithin(best.q, 150),
    });
  }

  console.log(`Re-anchored ${report.length} place-venues onto their OSM geometry.\n`);
  console.log('  venue                              moved  clearance  bldgs@150m  OSM element');
  for (const r of report) {
    const flag = r.bldAfter === 0 ? '  <-- NO FOOTPRINTS NEARBY' : '';
    console.log(
      `  ${r.venueName.padEnd(34)} ${String(Math.round(r.movedM)).padStart(4)}m ${r.clear.toFixed(0).padStart(7)}m   ${String(r.bldBefore).padStart(4)} -> ${String(r.bldAfter).padStart(4)}   ${r.key} (${r.name})${flag}`
    );
  }
  console.log('\nLeft alone on purpose:');
  for (const [n, why] of Object.entries(SKIPPED)) console.log(`  ${n.padEnd(34)} ${why}`);
  console.log('\nDuplicate venues sharing one real place (data issue, not a coordinate issue):');
  console.log('  Estrela Park          == Jardim da Estrela      (way/23697561)');
  console.log('  Príncipe Real Garden  == Praça do Príncipe Real (way/160122832)');
  console.log('  Anchored at least 25 m apart so they are not literally the same point.');

  if (!DRY) {
    writeFileSync('src/data/lisbonVenues.ts', src);
    console.log(`\nsrc/data/lisbonVenues.ts rewritten (${report.length} venues).`);
  } else {
    console.log('\ndry run — nothing written.');
  }
} finally {
  await server.close();
}
