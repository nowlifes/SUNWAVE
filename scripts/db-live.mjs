// Crée les tables des réponses « places au soleil » et y range les coordonnées
// des lieux (le serveur s'en sert pour vérifier que l'auteur est sur place).
//
// Usage : node scripts/db-live.mjs [NOM_DE_LA_VARIABLE]   (défaut : DATABASE_URL)
// La variable est lue dans l'environnement puis dans .env.local. Rejouable :
// tout est « if not exists » / « on conflict do update ».
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { createServer } from 'vite';

const name = process.argv[2] ?? 'DATABASE_URL';

function fromEnvFile(key) {
  try {
    const line = readFileSync('.env.local', 'utf8').split('\n').find((l) => l.startsWith(`${key}=`));
    return line ? line.slice(key.length + 1).trim() : undefined;
  } catch {
    return undefined;
  }
}

const url = process.env[name] ?? fromEnvFile(name);
if (!url) {
  console.error(`${name} introuvable (environnement ou .env.local).`);
  process.exit(1);
}
const sql = neon(url);
console.log(`Base visée : ${name} (hôte ${new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname})`);

const statements = readFileSync('db/001_live_reports.sql', 'utf8')
  .replace(/--.*$/gm, '')
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);
for (const s of statements) await sql.query(s);
console.log(`${statements.length} instructions de schéma appliquées.`);

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { lisbonVenues } = await server.ssrLoadModule('/src/data/lisbonVenues.ts');
  for (const v of lisbonVenues) {
    await sql.query(
      'insert into live_venues (id, lat, lng) values ($1, $2, $3) on conflict (id) do update set lat = excluded.lat, lng = excluded.lng',
      [v.id, v.latitude, v.longitude]
    );
  }
  const [{ n }] = await sql.query('select count(*)::int as n from live_venues');
  console.log(`${lisbonVenues.length} lieux envoyés, ${n} en base.`);
} finally {
  await server.close();
}
