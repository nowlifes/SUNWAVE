import { neon } from '@neondatabase/serverless';

// Les réponses « il reste des places ? » partagées entre tous les appareils.
//
// Fichier volontairement autonome : aucun import relatif, pour que le
// runtime Node ESM de Vercel n'ait ni extension ni alias à résoudre.
//
//   GET  /api/live  → les réponses des 45 dernières minutes (sans identifiant d'appareil)
//   POST /api/live  → { venueId, answer, deviceId, lat, lng } ; refusé si l'auteur
//                     est à plus de ZONE_M du lieu (contrôle refait ici, pas cru du client)

export const ANSWERS = ['plenty', 'few', 'none'] as const;
export type Answer = (typeof ANSWERS)[number];

/** Le client accepte 100 m ; le serveur laisse 150 m pour l'imprécision du GPS. */
export const ZONE_M = 150;
export const TTL_MIN = 45;

const DEVICE_RE = /^d_[a-z0-9]{6,40}$/;
const VENUE_RE = /^[A-Za-z0-9_-]{1,80}$/;

export interface AnswerBody {
  venueId: string;
  answer: Answer;
  deviceId: string;
  lat: number;
  lng: number;
}

export function parseBody(body: unknown): AnswerBody | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const { venueId, answer, deviceId, lat, lng } = b;
  if (typeof venueId !== 'string' || !VENUE_RE.test(venueId)) return null;
  if (typeof answer !== 'string' || !(ANSWERS as readonly string[]).includes(answer)) return null;
  if (typeof deviceId !== 'string' || !DEVICE_RE.test(deviceId)) return null;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { venueId, answer: answer as Answer, deviceId, lat, lng };
}

export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLng = (bLng - aLng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/** Ce dont le handler a besoin de la base : deux requêtes SQL, rien d'autre. */
export type Sql = (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

interface Req {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
}

export function createHandler(getSql: () => Sql) {
  return async function handler(req: Req, res: Res) {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const sql = getSql();

      if (req.method === 'GET') {
        const device = typeof req.query?.deviceId === 'string' ? req.query.deviceId : '';
        const rows = await sql(
          `select venue_id, answer, device_id = $2 as mine,
                  (extract(epoch from reported_at) * 1000)::bigint as at
             from live_reports
            where reported_at > now() - ($1 || ' minutes')::interval`,
          [String(TTL_MIN), device]
        );
        return res.status(200).json({
          records: rows.map((r) => ({
            venueId: String(r.venue_id),
            answer: String(r.answer),
            mine: r.mine === true,
            at: Number(r.at),
          })),
        });
      }

      if (req.method === 'POST') {
        const body = parseBody(req.body);
        if (!body) return res.status(400).json({ error: 'bad_request' });

        const venue = await sql('select lat, lng from live_venues where id = $1', [body.venueId]);
        if (venue.length === 0) return res.status(404).json({ error: 'unknown_venue' });

        const d = distanceM(Number(venue[0].lat), Number(venue[0].lng), body.lat, body.lng);
        if (d > ZONE_M) return res.status(403).json({ error: 'too_far' });

        await sql(
          `insert into live_reports (venue_id, device_id, answer)
           values ($1, $2, $3)
           on conflict (venue_id, device_id)
           do update set answer = excluded.answer, reported_at = now()`,
          [body.venueId, body.deviceId, body.answer]
        );
        await sql(`delete from live_reports where reported_at < now() - interval '3 hours'`);
        return res.status(200).json({ ok: true });
      }

      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'method_not_allowed' });
    } catch {
      // Le détail (mot de passe, requête) ne sort jamais vers le navigateur.
      return res.status(500).json({ error: 'server_error' });
    }
  };
}

const handler = createHandler(() => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL manquante');
  const client = neon(url);
  return (query, params = []) => client.query(query, params) as Promise<Record<string, unknown>[]>;
});

export default handler;
