// Smoke test de la cible réellement déployée — ce que tsc et le build local
// ne voient pas. Usage : node scripts/smoke-deploy.mjs [url]
// Par défaut : l'alias de prod. `sunwave.vercel.app` est un site tiers, et les
// URL sunwave-<hash>-… sont derrière le login Vercel.
const url = (process.argv[2] ?? 'https://sunwave-olive.vercel.app').replace(/\/$/, '');
const fails = [];
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails.push(msg); };

const res = await fetch(url, { redirect: 'manual' });
check(res.status === 200, `${url} répond 200 (reçu ${res.status}${res.status === 302 || res.status === 401 ? ' — protection Vercel ?' : ''})`);
const html = res.status === 200 ? await res.text() : '';
check(/<title>SUNWAVE/.test(html), "le HTML servi est bien SUNWAVE (pas un autre site, pas une page d'erreur)");
check(html.includes('id="root"'), 'le point de montage React est présent');

// Chaque asset référencé doit exister : un 404 ici = écran blanc en prod.
const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
check(assets.length > 0, `${assets.length} assets référencés`);
let js = '';
for (const a of assets) {
  const r = await fetch(url + a);
  const body = await r.text();
  if (a.endsWith('.js')) js += body;
  check(r.ok && !body.trimStart().startsWith('<'), `${a} → ${r.status}${body.trimStart().startsWith('<') ? ' (HTML servi à la place du JS)' : ''}`);
}

// Les morceaux chargés à la demande (ex. l'écran Carte, React.lazy) ne sont
// cités que par le JS : un 404 ici = l'onglet reste vide alors que l'accueil marche.
const chunks = [...new Set([...js.matchAll(/assets\/([A-Za-z0-9_-]+-[A-Za-z0-9_-]{6,}\.js)/g)].map((m) => `/assets/${m[1]}`))]
  .filter((c) => !assets.includes(c) && !c.includes('maplibre-gl-worker'));
for (const c of chunks) {
  const r = await fetch(url + c);
  const body = await r.text();
  js += body;
  check(r.ok && !body.trimStart().startsWith('<'), `morceau à la demande ${c} → ${r.status}`);
}

// Le worker maplibre n'est pas référencé par le HTML mais par le JS (désormais
// dans le morceau Carte) ; sans lui, aucune ombre ne s'affiche (bug déjà vu en prod).
const worker = js.match(/\/?assets\/maplibre-gl-worker[^"'`]+\.js/);
check(Boolean(worker), 'le bundle référence le worker maplibre');
if (worker) {
  const r = await fetch(`${url}/${worker[0].replace(/^\//, '')}`);
  check(r.ok, `worker ${worker[0]} → ${r.status}`);
}

console.log(fails.length ? `\n${fails.length} échec(s) sur ${url}` : `\nCible OK : ${url}`);
process.exit(fails.length ? 1 : 0);
