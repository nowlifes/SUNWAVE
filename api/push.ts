import { neon } from '@neondatabase/serverless';

// Les abonnements Web Push pour la notification « Golden hour dans 20 min ».
//
// Fichier volontairement autonome : aucun import relatif, pour que le
// runtime Node ESM de Vercel n'ait ni extension ni alias à résoudre.
//
//   POST   /api/push → { deviceId, endpoint, keys: {p256dh, auth}, pick? }
//                      enregistre (ou met à jour) l'abonnement de cet appareil ;
//                      `pick` = le lieu calculé sur l'appareil pour aujourd'hui.
//   DELETE /api/push → { deviceId, endpoint } ; seul l'appareil abonné peut retirer
//                      son abonnement.

const DEVICE_RE = /^d_[a-z0-9]{6,40}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;
const KEY_RE = /^[A-Za-z0-9_-]{8,200}={0,2}$/;

export interface Pick {
  day: string;
  name: string;
  walkMin: number;
  until: string;
}

export interface SubscribeBody {
  deviceId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  pick: Pick | null;
}

function parsePick(raw: unknown): Pick | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const p = raw as Record<string, unknown>;
  if (typeof p.day !== 'string' || !DAY_RE.test(p.day)) return null;
  if (typeof p.name !== 'string' || p.name.length < 1 || p.name.length > 80) return null;
  if (typeof p.walkMin !== 'number' || !Number.isInteger(p.walkMin) || p.walkMin < 0 || p.walkMin > 240) return null;
  if (typeof p.until !== 'string' || !TIME_RE.test(p.until)) return null;
  return { day: p.day, name: p.name, walkMin: p.walkMin, until: p.until };
}

function validEndpoint(v: unknown): v is string {
  if (typeof v !== 'string' || v.length > 600) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseSubscribe(body: unknown): SubscribeBody | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.deviceId !== 'string' || !DEVICE_RE.test(b.deviceId)) return null;
  if (!validEndpoint(b.endpoint)) return null;
  const keys = b.keys as Record<string, unknown> | undefined;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return null;
  if (!KEY_RE.test(keys.p256dh) || !KEY_RE.test(keys.auth)) return null;
  // Un `pick` mal formé est ignoré : l'abonnement, lui, reste valable.
  const pick = b.pick === undefined ? null : parsePick(b.pick);
  return { deviceId: b.deviceId, endpoint: b.endpoint, p256dh: keys.p256dh, auth: keys.auth, pick };
}

export function parseUnsubscribe(body: unknown): { deviceId: string; endpoint: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.deviceId !== 'string' || !DEVICE_RE.test(b.deviceId)) return null;
  if (!validEndpoint(b.endpoint)) return null;
  return { deviceId: b.deviceId, endpoint: b.endpoint };
}

/** Ce dont le handler a besoin de la base : des requêtes SQL, rien d'autre. */
export type Sql = (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

interface Req {
  method?: string;
  body?: unknown;
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
      if (req.method === 'POST') {
        const body = parseSubscribe(req.body);
        if (!body) return res.status(400).json({ error: 'bad_request' });
        const sql = getSql();
        // Un endpoint déjà connu d'un autre appareil n'est pas repris : sinon
        // n'importe qui pourrait détourner l'abonnement d'un autre.
        await sql(
          `insert into push_subscriptions
             (endpoint, device_id, p256dh, auth, pick_day, pick_name, pick_walk_min, pick_until)
           values ($1, $2, $3, $4, $5, $6, $7, $8)
           on conflict (endpoint) do update
             set p256dh = excluded.p256dh, auth = excluded.auth,
                 pick_day = excluded.pick_day, pick_name = excluded.pick_name,
                 pick_walk_min = excluded.pick_walk_min, pick_until = excluded.pick_until
           where push_subscriptions.device_id = excluded.device_id`,
          [
            body.endpoint,
            body.deviceId,
            body.p256dh,
            body.auth,
            body.pick?.day ?? null,
            body.pick?.name ?? null,
            body.pick?.walkMin ?? null,
            body.pick?.until ?? null,
          ]
        );
        return res.status(200).json({ ok: true });
      }

      if (req.method === 'DELETE') {
        const body = parseUnsubscribe(req.body);
        if (!body) return res.status(400).json({ error: 'bad_request' });
        await getSql()('delete from push_subscriptions where endpoint = $1 and device_id = $2', [
          body.endpoint,
          body.deviceId,
        ]);
        return res.status(200).json({ ok: true });
      }

      res.setHeader('Allow', 'POST, DELETE');
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
