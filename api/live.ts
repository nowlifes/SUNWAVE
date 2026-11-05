import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

// Les réponses « il reste des places ? » partagées entre tous les appareils.
//
// Fichier volontairement autonome : aucun import relatif, pour que le
// runtime Node ESM de Vercel n'ait ni extension ni alias à résoudre.
//
//   GET  /api/live  → les réponses des 45 dernières minutes (sans identifiant d'appareil)
//   POST /api/live  → { venueId, answer, deviceId, lat, lng, pseudo?, avatar? } ; refusé si l'auteur
//                     est à plus de ZONE_M du lieu (contrôle refait ici, pas cru du client)

export const ANSWERS = ['plenty', 'few', 'none'] as const;
export type Answer = (typeof ANSWERS)[number];

/** Le client accepte 100 m ; le serveur laisse 150 m pour l'imprécision du GPS. */
export const ZONE_M = 150;
export const TTL_MIN = 45;

/** Garde-fous par adresse IP (le `deviceId` est inventé par le client, il ne
 *  protège de rien) : au plus IP_MAX_RECENT lieux répondus en IP_WINDOW_MIN
 *  minutes, et au plus IP_MAX_DEVICES_PER_VENUE appareils par lieu — deux
 *  téléphones sur le même wifi passent, trente « appareils » fabriqués non. */
export const IP_WINDOW_MIN = 10;
export const IP_MAX_RECENT = 10;
export const IP_MAX_DEVICES_PER_VENUE = 2;

const DEVICE_RE = /^d_[a-z0-9]{6,40}$/;
const VENUE_RE = /^[A-Za-z0-9_-]{1,80}$/;
/** Même règle que src/utils/pseudo.ts (copiée : ce fichier n'importe rien). */
const PSEUDO_MAX = 20;
const PSEUDO_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;

/** Un pseudo refusé ne fait pas perdre la réponse : elle part sans signature. */
export function parsePseudo(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.normalize('NFC').replace(/\s+/g, ' ').trim();
  return s.length > 0 && s.length <= PSEUDO_MAX && PSEUDO_RE.test(s) ? s : null;
}

/** Même règle que src/utils/avatar.ts : coiffure, couvre-chef, lunettes. */
const AVATAR_RE = /^[0-9ab][0-6][0-5]$/;

/** Un avatar refusé ne fait pas perdre la réponse non plus. */
export function parseAvatar(v: unknown): string | null {
  return typeof v === 'string' && AVATAR_RE.test(v) ? v : null;
}

export interface AnswerBody {
  venueId: string;
  answer: Answer;
  deviceId: string;
  lat: number;
  lng: number;
  pseudo: string | null;
  avatar: string | null;
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
  return { venueId, answer: answer as Answer, deviceId, lat, lng, pseudo: parsePseudo(b.pseudo), avatar: parseAvatar(b.avatar) };
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
  headers?: Record<string, string | string[] | undefined>;
}

/** Empreinte de l'IP de l'appelant, ou null si elle n'est pas lisible. Vercel
 *  pose `x-forwarded-for` à la frontière ; on prend la première adresse. Le
 *  jour UTC sert de sel : la même personne n'a pas la même empreinte demain,
 *  et l'adresse elle-même n'est jamais écrite en base. */
export function clientIpHash(headers: Req['headers'], now: Date = new Date()): string | null {
  const raw = headers?.['x-forwarded-for'];
  const first = (Array.isArray(raw) ? raw[0] : raw)?.split(',')[0]?.trim();
  if (!first) return null;
  return createHash('sha256').update(`${first}|${now.toISOString().slice(0, 10)}`).digest('hex').slice(0, 32);
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
          `select venue_id, answer, pseudo, avatar, device_id = $2 as mine,
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
            pseudo: typeof r.pseudo === 'string' ? r.pseudo : null,
            avatar: typeof r.avatar === 'string' ? r.avatar : null,
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

        // Fabriquer des voix : même IP, trop de lieux d'un coup, ou trop
        // d'« appareils » sur un seul lieu. Sans IP lisible (dev local), pas de garde.
        const ip = clientIpHash(req.headers);
        if (ip) {
          const [{ n: recent }] = await sql(
            `select count(*)::int as n from live_reports
              where ip_hash = $1 and reported_at > now() - ($2 || ' minutes')::interval
                and not (venue_id = $3 and device_id = $4)`,
            [ip, String(IP_WINDOW_MIN), body.venueId, body.deviceId]
          );
          const [{ n: others }] = await sql(
            `select count(distinct device_id)::int as n from live_reports
              where ip_hash = $1 and venue_id = $2 and device_id <> $3
                and reported_at > now() - ($4 || ' minutes')::interval`,
            [ip, body.venueId, body.deviceId, String(TTL_MIN)]
          );
          if (Number(recent) >= IP_MAX_RECENT || Number(others) >= IP_MAX_DEVICES_PER_VENUE) {
            return res.status(429).json({ error: 'rate_limited' });
          }
        }

        await sql(
          `insert into live_reports (venue_id, device_id, answer, pseudo, avatar, ip_hash)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (venue_id, device_id)
           do update set answer = excluded.answer, pseudo = excluded.pseudo,
                         avatar = excluded.avatar, ip_hash = excluded.ip_hash, reported_at = now()`,
          [body.venueId, body.deviceId, body.answer, body.pseudo, body.avatar, ip]
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
