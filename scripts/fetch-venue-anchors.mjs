// Real OSM geometry for the venues that are a PLACE, not an address:
// miradouros, parks and squares. Their coordinate must sit on the open
// esplanade, not on the nearest free pavement — the generic
// fix-venue-coordinates.mjs pass gets that wrong for exactly these, because
// "nearest open ground" from inside a block is the alley next door.
//
// Fetches tourism=viewpoint / leisure=park|garden / place=square in the Lisbon
// bbox and caches the raw answer; apply-venue-anchors.mjs does the matching.
// Run with: node scripts/fetch-venue-anchors.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const CACHE = 'scripts/.anchors-cache.json';
const NAMED_CACHE = 'scripts/.named-cache.json';
const BBOX = '38.685,-9.235,38.760,-9.085';
const WIDE_BBOX = '38.680,-9.240,38.790,-9.080';

// The venues that are a place are named in Portuguese and often tagged under a
// different name than the app uses ("Rossio" is Praça Dom Pedro IV, "Jardim da
// Estrela" is also Jardim Guerra Junqueiro), so the bbox sweep above is not
// enough — this second pass finds them by name wherever they sit.
const NAME_PATTERN =
  'Miradouro|Jardim|Praça|Largo|Parque|Rossio|Tapada|Terreiro do Paço|Comércio|Eduardo VII|Guerra Junqueiro|Carmo|Alcântara|Sophia de Mello';
const NAMED_QUERY = `
[out:json][timeout:120];
(
  nwr["name"~"${NAME_PATTERN}"]["leisure"](${WIDE_BBOX});
  nwr["name"~"${NAME_PATTERN}"]["place"="square"](${WIDE_BBOX});
  nwr["name"~"${NAME_PATTERN}"]["tourism"="viewpoint"](${WIDE_BBOX});
  nwr["name"~"${NAME_PATTERN}"]["highway"="pedestrian"](${WIDE_BBOX});
);
out geom;
`;

const QUERY = `
[out:json][timeout:90];
(
  node["tourism"="viewpoint"](${BBOX});
  way["tourism"="viewpoint"](${BBOX});
  way["leisure"~"^(park|garden)$"](${BBOX});
  relation["leisure"~"^(park|garden)$"](${BBOX});
  way["place"="square"](${BBOX});
  relation["place"="square"](${BBOX});
  way["highway"="pedestrian"]["area"="yes"]["name"](${BBOX});
);
out geom;
`;

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

// Overpass answers 406 without a User-Agent, and any single mirror can be busy.
async function overpass(query, label) {
  for (const endpoint of ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'SUNWAVE-dev-script/1.0 (one-shot place-geometry fetch)',
        },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) {
        console.error(`  ${endpoint} -> ${res.status} ${res.statusText}`);
        continue;
      }
      return await res.json();
    } catch (err) {
      console.error(`  ${endpoint} -> ${err.message}`);
    }
  }
  throw new Error(`every Overpass mirror refused the ${label} query.`);
}

for (const [file, query, label] of [
  [CACHE, QUERY, 'area sweep'],
  [NAMED_CACHE, NAMED_QUERY, 'named places'],
]) {
  if (existsSync(file)) {
    console.log(`${file} already holds ${JSON.parse(readFileSync(file, 'utf8')).elements.length} elements — delete it to refetch.`);
    continue;
  }
  console.log(`querying Overpass (${label})…`);
  const json = await overpass(query, label);
  writeFileSync(file, JSON.stringify(json));
  console.log(`  ${json.elements.length} elements (${json.elements.filter((e) => e.tags?.name).length} named) cached in ${file}`);
}
