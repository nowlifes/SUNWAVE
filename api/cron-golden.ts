import { neon } from '@neondatabase/serverless';
import { getPosition, getTimes } from 'suncalc';
import webpush from 'web-push';
import { timingSafeEqual } from 'node:crypto';

// Le cron « Golden hour dans 20 min » : appelé toutes les 15 min en fin d'après-midi,
// il envoie la notification aux abonnés dont l'heure est venue, une fois par jour.
//
// Fichier volontairement autonome : aucun import relatif ni alias, pour que le
// runtime Node ESM de Vercel n'ait rien à résoudre. La logique de
// src/services/GoldenHourService.ts y est donc COPIÉE (mêmes constantes).
// src/__api__/cron-golden.test.ts compare les deux sur une grille d'instants :
// si l'une change sans l'autre, le test casse.
//
//   GET /api/cron-golden   Authorization: Bearer $CRON_SECRET
//
// Variables : DATABASE_URL, CRON_SECRET, VITE_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// VAPID_SUBJECT (mailto:… ou https://…).

// --- copie de GoldenHourService (à garder identique) ------------------------
export const GOLDEN_ELEVATION_DEG = 6; // suncalc : goldenHour = soleil sous 6°
export const LEAD_MIN = 20;
export const SEND_WINDOW_MIN = 15;
const LISBON = { lat: 38.7223, lng: -9.1393 };
const MIN = 60_000;

const fmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Lisbon',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour12: false,
});

function lisbonYMD(date: Date): { y: number; m: number; d: number } {
  const parts = fmt.formatToParts(date);
  const read = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: read('year'), m: read('month'), d: read('day') };
}

export function lisbonDayKey(date: Date): string {
  const { y, m, d } = lisbonYMD(date);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function goldenSendTime(date: Date): Date | null {
  const { y, m, d } = lisbonYMD(date);
  const golden = getTimes(new Date(Date.UTC(y, m - 1, d, 12)), LISBON.lat, LISBON.lng).goldenHour;
  if (!golden || Number.isNaN(golden.getTime())) return null;
  return new Date(golden.getTime() - LEAD_MIN * MIN);
}

export function shouldSendNow(now: Date, lastSentDay: string | null): boolean {
  if (lastSentDay === lisbonDayKey(now)) return false;
  if (getPosition(now, LISBON.lat, LISBON.lng).altitude <= 0) return false;
  const at = goldenSendTime(now);
  if (!at) return false;
  const half = (SEND_WINDOW_MIN * MIN) / 2;
  const t = now.getTime() - at.getTime();
  return t >= -half && t < half;
}

export function goldenMessage(pick: { name: string; walkMin: number; until: string } | null): { title: string; body: string } {
  const title = `Golden hour dans ${LEAD_MIN} min`;
  if (!pick) return { title, body: 'La lumière dorée arrive sur Lisbonne. Vois où elle tombe.' };
  return { title, body: `${pick.name} : ${pick.walkMin} min à pied, soleil jusqu’à ${pick.until}.` };
}
// --- fin de la copie --------------------------------------------------------

export type Sql = (query: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}
export interface Payload {
  title: string;
  body: string;
  url: string;
}
/** Envoie un push ; rejette avec `statusCode` quand le service push répond en erreur. */
export type Send = (target: PushTarget, payload: Payload) => Promise<void>;

interface Req {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): unknown;
  json(body: unknown): unknown;
}

export interface Deps {
  getSql: () => Sql;
  send: Send;
  now: () => Date;
  secret: () => string | undefined;
}

function authorized(req: Req, secret: string): boolean {
  const raw = req.headers?.authorization;
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function createHandler(deps: Deps) {
  return async function handler(req: Req, res: Res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ error: 'method_not_allowed' });
    }
    const secret = deps.secret();
    // Sans secret configuré, l'endpoint reste fermé : jamais ouvert par défaut.
    if (!secret) return res.status(500).json({ error: 'server_error' });
    if (!authorized(req, secret)) return res.status(401).json({ error: 'unauthorized' });

    try {
      const now = deps.now();
      const today = lisbonDayKey(now);
      // Hors fenêtre pour tout le monde (aucun abonné n'a un autre horaire) : on sort avant la base.
      if (!shouldSendNow(now, null)) return res.status(200).json({ due: false, sent: 0, removed: 0, failed: 0 });

      const sql = deps.getSql();
      const rows = await sql(
        `select endpoint, p256dh, auth, pick_day, pick_name, pick_walk_min, pick_until
           from push_subscriptions
          where last_sent_day is distinct from $1`,
        [today]
      );

      let sent = 0;
      let removed = 0;
      let failed = 0;
      for (const r of rows) {
        const endpoint = String(r.endpoint);
        const fresh = r.pick_day === today && r.pick_name !== null && r.pick_walk_min !== null && r.pick_until !== null;
        const msg = goldenMessage(
          fresh ? { name: String(r.pick_name), walkMin: Number(r.pick_walk_min), until: String(r.pick_until) } : null
        );
        try {
          await deps.send({ endpoint, p256dh: String(r.p256dh), auth: String(r.auth) }, { ...msg, url: '/' });
          await sql('update push_subscriptions set last_sent_day = $1 where endpoint = $2', [today, endpoint]);
          sent++;
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) {
            // Abonnement mort (désinstallé, permission retirée) : on le purge.
            await sql('delete from push_subscriptions where endpoint = $1', [endpoint]);
            removed++;
          } else {
            // Pas marqué envoyé : le prochain passage dans la fenêtre réessaie.
            failed++;
          }
        }
      }
      return res.status(200).json({ due: true, sent, removed, failed });
    } catch {
      return res.status(500).json({ error: 'server_error' });
    }
  };
}

const handler = createHandler({
  getSql: () => {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL manquante');
    const client = neon(url);
    return (query, params = []) => client.query(query, params) as Promise<Record<string, unknown>[]>;
  },
  send: async (target, payload) => {
    const pub = process.env.VITE_VAPID_PUBLIC_KEY;
    const priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT;
    if (!pub || !priv || !subject) throw new Error('clés VAPID manquantes');
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      { vapidDetails: { subject, publicKey: pub, privateKey: priv }, TTL: 1800, urgency: 'normal' }
    );
  },
  now: () => new Date(),
  secret: () => process.env.CRON_SECRET,
});

export default handler;
