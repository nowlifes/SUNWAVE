// How many venue coordinates fall INSIDE an OSM building footprint?
//
// A terrace is not inside a building. A venue point that lands inside one is an
// address/geocode point, not the outdoor area, and every sun number computed
// from it describes a spot in the middle of a block. This check exists because
// fixing the shadow geometry made that error visible: while shadows were being
// cast toward the sun instead of away from it, almost nothing ever blocked, so
// bad coordinates still produced plausible-looking sunny curves.
//
// Run with: TZ=Europe/Lisbon node scripts/verify-venue-coordinates.mjs
// The whole dataset is Lisbon. Sun position is computed with local-time Date
// objects, so running this on a machine set to another zone shifts every curve
// by that offset and the checks below fail for a reason that is not the code.
// Forced, not defaulted: an exported TZ in the shell would otherwise win and
// the script would silently check a city that is not the one in the data.
process.env.TZ = 'Europe/Lisbon';

import { createServer } from 'vite';
const server = await createServer({ server:{middlewareMode:true}, appType:'custom' });
try{
  const { lisbonVenues } = await server.ssrLoadModule('/src/data/lisbonVenues.ts');
  const { lisbonBuildings } = await server.ssrLoadModule('/src/data/lisbonBuildings.ts');
  const { ShadowService } = await server.ssrLoadModule('/src/services/ShadowService.ts');
  const dist=(a,b)=>{const la=a.lat*Math.PI/180;return Math.hypot((b.lng-a.lng)*111320*Math.cos(la),(b.lat-a.lat)*110540);};
  const ctr=b=>{let la=0,ln=0;for(const p of b.points){la+=p.lat;ln+=p.lng;}return{lat:la/b.points.length,lng:ln/b.points.length};};

  const inside=[];
  for(const v of lisbonVenues){
    const q={lat:v.latitude,lng:v.longitude};
    const near=lisbonBuildings.filter(b=>dist(q,ctr(b))<=80);
    const hit=near.find(b=>ShadowService.pointInPolygon(q,b.points));
    if(hit) inside.push([v,hit]);
  }
  const n=lisbonVenues.length;
  console.log(`${inside.length} of ${n} venue coordinates (${(100*inside.length/n).toFixed(0)}%) fall INSIDE a building footprint.`);
  console.log(`Their sun curves describe a point inside a block, not a terrace.\n`);
  for(const [v,b] of inside.slice(0,15)){
    const total=v.sunExposureByHour.reduce((s,x)=>s+x,0);
    console.log(`  ${v.name.padEnd(34)} in ${b.id.padEnd(18)} daily sun total ${String(total).padStart(4)}`);
  }
  if(inside.length>15) console.log(`  ... and ${inside.length-15} more`);
  const okTotals=lisbonVenues.filter(v=>!inside.some(([iv])=>iv.id===v.id)).map(v=>v.sunExposureByHour.reduce((s,x)=>s+x,0));
  const badTotals=inside.map(([v])=>v.sunExposureByHour.reduce((s,x)=>s+x,0));
  const avg=a=>a.length?Math.round(a.reduce((s,x)=>s+x,0)/a.length):0;
  console.log(`\naverage daily sun total — coordinate outside buildings: ${avg(okTotals)} (n=${okTotals.length})`);
  console.log(`average daily sun total — coordinate inside a building:  ${avg(badTotals)} (n=${badTotals.length})`);
}finally{ await server.close(); }
