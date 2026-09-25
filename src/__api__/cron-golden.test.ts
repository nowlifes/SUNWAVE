import { describe, it, expect } from 'vitest';
import * as cron from '../../api/cron-golden';
import * as client from '@/services/GoldenHourService';

const MIN = 60_000;
const SECRET = 's3cret-value';
const DAY = new Date('2026-09-25T10:00:00Z');
const SEND = cron.goldenSendTime(DAY) as Date;
const TODAY = cron.lisbonDayKey(SEND);

function fakeRes() {
  const out: { code: number; body: Record<string, unknown> | null; headers: Record<string, string> } = { code: 0, body: null, headers: {} };
  const res = {
    status(c: number) { out.code = c; return res; },
    setHeader(k: string, v: string) { out.headers[k] = v; },
    json(b: unknown) { out.body = b as Record<string, unknown>; return res; },
  };
  return { res, out };
}

type Row = Record<string, unknown>;

function setup(rows: Row[], sendImpl?: (endpoint: string) => Promise<void>, now: Date = SEND) {
  const writes: { q: string; p: unknown[] }[] = [];
  const sent: { endpoint: string; title: string; body: string }[] = [];
  let sqlCalled = false;
  const sql: cron.Sql = async (q, p = []) => {
    sqlCalled = true;
    if (q.trim().startsWith('select')) return rows;
    writes.push({ q: q.trim().split(/\s+/).slice(0, 3).join(' '), p });
    return [];
  };
  const handler = cron.createHandler({
    getSql: () => sql,
    send: async (t, payload) => {
      if (sendImpl) await sendImpl(t.endpoint);
      sent.push({ endpoint: t.endpoint, title: payload.title, body: payload.body });
    },
    now: () => now,
    secret: () => SECRET,
  });
  return { handler, writes, sent, sqlCalled: () => sqlCalled };
}

const sub = (endpoint: string, extra: Row = {}): Row => ({
  endpoint,
  p256dh: 'k',
  auth: 'a',
  pick_day: null,
  pick_name: null,
  pick_walk_min: null,
  pick_until: null,
  ...extra,
});
const authed = { method: 'GET', headers: { authorization: `Bearer ${SECRET}` } };

describe('api/cron-golden — copie fidèle de GoldenHourService', () => {
  it('même heure d’envoi, même jour, même décision sur toute une grille', () => {
    for (const day of ['2026-06-21', '2026-09-25', '2026-12-21', '2027-03-28']) {
      const base = new Date(`${day}T00:00:00Z`).getTime();
      for (let m = 0; m < 24 * 60; m += 5) {
        const t = new Date(base + m * MIN);
        expect(cron.shouldSendNow(t, null)).toBe(client.shouldSendNow(t, null));
        expect(cron.lisbonDayKey(t)).toBe(client.lisbonDayKey(t));
      }
      const a = cron.goldenSendTime(new Date(base + 10 * 60 * MIN)) as Date;
      const b = client.goldenSendTime(new Date(base + 10 * 60 * MIN)) as Date;
      expect(Math.abs(a.getTime() - b.getTime())).toBeLessThan(MIN);
    }
  });
  it('constantes et message identiques', () => {
    expect(cron.LEAD_MIN).toBe(client.LEAD_MIN);
    expect(cron.SEND_WINDOW_MIN).toBe(client.SEND_WINDOW_MIN);
    expect(cron.GOLDEN_ELEVATION_DEG).toBe(client.GOLDEN_ELEVATION_DEG);
    const pick = { name: 'A', walkMin: 5, until: '20:01' };
    expect(cron.goldenMessage(pick)).toEqual(client.goldenMessage(pick));
    expect(cron.goldenMessage(null)).toEqual(client.goldenMessage(null));
  });
});

describe('api/cron-golden — protection', () => {
  it('sans en-tête : 401, base non touchée', async () => {
    const { handler, sqlCalled } = setup([sub('https://e/1')]);
    const { res, out } = fakeRes();
    await handler({ method: 'GET', headers: {} }, res);
    expect(out.code).toBe(401);
    expect(sqlCalled()).toBe(false);
  });
  it('mauvais secret : 401', async () => {
    const { handler } = setup([sub('https://e/1')]);
    const { res, out } = fakeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer nope' } }, res);
    expect(out.code).toBe(401);
  });
  it('CRON_SECRET non configuré : fermé (500)', async () => {
    const handler = cron.createHandler({ getSql: () => async () => [], send: async () => {}, now: () => SEND, secret: () => undefined });
    const { res, out } = fakeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer ' } }, res);
    expect(out.code).toBe(500);
  });
  it('autre méthode : 405', async () => {
    const { handler } = setup([]);
    const { res, out } = fakeRes();
    await handler({ method: 'POST', headers: authed.headers }, res);
    expect(out.code).toBe(405);
  });
});

describe('api/cron-golden — envoi', () => {
  it('envoie dans la fenêtre, avec le lieu du jour, et marque le jour', async () => {
    const rows = [sub('https://e/1', { pick_day: TODAY, pick_name: 'Graça', pick_walk_min: 12, pick_until: '19:48' })];
    const { handler, sent, writes } = setup(rows);
    const { res, out } = fakeRes();
    await handler(authed, res);
    expect(out.code).toBe(200);
    expect(out.body).toMatchObject({ due: true, sent: 1, removed: 0, failed: 0 });
    expect(sent[0].title).toBe('Golden hour dans 20 min');
    expect(sent[0].body).toBe('Graça : 12 min à pied, soleil jusqu’à 19:48.');
    expect(writes).toEqual([{ q: 'update push_subscriptions set', p: [TODAY, 'https://e/1'] }]);
  });

  it('lieu périmé (autre jour) : message sans lieu', async () => {
    const rows = [sub('https://e/1', { pick_day: '2026-09-01', pick_name: 'Graça', pick_walk_min: 12, pick_until: '19:48' })];
    const { handler, sent } = setup(rows);
    const { res } = fakeRes();
    await handler(authed, res);
    expect(sent[0].body).toBe(client.goldenMessage(null).body);
  });

  it('hors fenêtre : rien envoyé, base non lue', async () => {
    const { handler, sent, sqlCalled } = setup([sub('https://e/1')], undefined, new Date(SEND.getTime() + 60 * MIN));
    const { res, out } = fakeRes();
    await handler(authed, res);
    expect(out.body).toMatchObject({ due: false, sent: 0 });
    expect(sent).toHaveLength(0);
    expect(sqlCalled()).toBe(false);
  });

  it('de nuit : rien envoyé', async () => {
    const { handler, sent } = setup([sub('https://e/1')], undefined, new Date('2026-09-25T02:00:00Z'));
    const { res } = fakeRes();
    await handler(authed, res);
    expect(sent).toHaveLength(0);
  });

  it('abonnement mort (410 / 404) : purgé, les autres partent', async () => {
    const rows = [sub('https://e/dead'), sub('https://e/gone'), sub('https://e/ok')];
    const { handler, sent, writes } = setup(rows, async (e) => {
      if (e === 'https://e/dead') throw Object.assign(new Error('gone'), { statusCode: 410 });
      if (e === 'https://e/gone') throw Object.assign(new Error('nf'), { statusCode: 404 });
    });
    const { res, out } = fakeRes();
    await handler(authed, res);
    expect(out.body).toMatchObject({ sent: 1, removed: 2, failed: 0 });
    expect(sent.map((s) => s.endpoint)).toEqual(['https://e/ok']);
    expect(writes.filter((w) => w.q.startsWith('delete')).map((w) => w.p[0])).toEqual(['https://e/dead', 'https://e/gone']);
  });

  it('erreur passagère : pas marqué envoyé, pas purgé (le tick suivant réessaie)', async () => {
    const { handler, writes } = setup([sub('https://e/1')], async () => {
      throw Object.assign(new Error('boom'), { statusCode: 503 });
    });
    const { res, out } = fakeRes();
    await handler(authed, res);
    expect(out.body).toMatchObject({ sent: 0, removed: 0, failed: 1 });
    expect(writes).toHaveLength(0);
  });

  it('ne relit que ceux qui n’ont rien reçu aujourd’hui', async () => {
    let query = '';
    const handler = cron.createHandler({
      getSql: () => async (q) => { query = q; return []; },
      send: async () => {},
      now: () => SEND,
      secret: () => SECRET,
    });
    const { res } = fakeRes();
    await handler(authed, res);
    expect(query).toContain('last_sent_day is distinct from $1');
  });
});
