import { describe, it, expect } from 'vitest';
import { createHandler, parseBody, distanceM, clientIpHash, ZONE_M, IP_MAX_RECENT, IP_MAX_DEVICES_PER_VENUE, type Sql } from '../../api/live';

const good = { venueId: 'v1', answer: 'few', deviceId: 'd_abc123xyz', lat: 38.7139, lng: -9.1394 };

function fakeRes() {
  const out: { code: number; body: unknown; headers: Record<string, string> } = { code: 0, body: null, headers: {} };
  const res = {
    status(c: number) { out.code = c; return res; },
    setHeader(k: string, v: string) { out.headers[k] = v; },
    json(b: unknown) { out.body = b; return res; },
  };
  return { res, out };
}

/** Une base minimale : coordonnées des lieux + le journal des écritures. */
function fakeDb(venues: Record<string, { lat: number; lng: number }>) {
  const writes: string[] = [];
  const params: unknown[][] = [];
  const sql: Sql = async (q, p = []) => {
    if (q.includes('from live_venues')) {
      const v = venues[String(p[0])];
      return v ? [v] : [];
    }
    if (q.includes('from live_reports')) {
      return [{ venue_id: 'v1', answer: 'few', mine: true, at: 1700000000000, pseudo: 'Léa', avatar: 'b62' }];
    }
    writes.push(q.trim().split(/\s+/).slice(0, 2).join(' '));
    params.push(p);
    return [];
  };
  return { sql, writes, params };
}

describe('api/live — validation', () => {
  it('accepte une réponse bien formée', () => {
    expect(parseBody(good)).toEqual({ ...good, pseudo: null, avatar: null });
  });
  it.each([
    ['réponse inconnue', { ...good, answer: 'maybe' }],
    ['appareil sans forme d_…', { ...good, deviceId: 'anonymous' }],
    ['lieu avec injection', { ...good, venueId: "v1'; drop table x;--" }],
    ['latitude absurde', { ...good, lat: 400 }],
    ['coordonnées en texte', { ...good, lat: '38.7' }],
    ['corps vide', null],
  ])('refuse : %s', (_, body) => {
    expect(parseBody(body)).toBeNull();
  });
});

describe('api/live — handler', () => {
  const venues = { v1: { lat: 38.7139, lng: -9.1394 } };

  it('écrit une réponse venue de la zone', async () => {
    const { sql, writes } = fakeDb(venues);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good }, res);
    expect(out.code).toBe(200);
    expect(writes[0]).toBe('insert into');
  });

  it("refuse une réponse envoyée de loin, sans rien écrire", async () => {
    const { sql, writes } = fakeDb(venues);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: { ...good, lat: good.lat + (ZONE_M + 200) / 111_320 } }, res);
    expect(out.code).toBe(403);
    expect(writes).toHaveLength(0);
  });

  it('refuse un lieu inconnu', async () => {
    const { sql, writes } = fakeDb({});
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good }, res);
    expect(out.code).toBe(404);
    expect(writes).toHaveLength(0);
  });

  it("répond au GET sans jamais exposer d'identifiant d'appareil", async () => {
    const { sql } = fakeDb(venues);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'GET', query: { deviceId: 'd_abc123xyz' } }, res);
    expect(out.code).toBe(200);
    expect(JSON.stringify(out.body)).not.toContain('device');
    expect(out.headers['Cache-Control']).toBe('no-store');
  });

  it("n'expose pas l'erreur de la base", async () => {
    const boom: Sql = async () => { throw new Error('password authentication failed for npg_secret'); };
    const { res, out } = fakeRes();
    await createHandler(() => boom)({ method: 'GET' }, res);
    expect(out.code).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain('npg_secret');
  });

  it('refuse les autres méthodes', async () => {
    const { sql } = fakeDb(venues);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'DELETE' }, res);
    expect(out.code).toBe(405);
  });
});

describe('api/live — pseudo', () => {
  const venues = { v1: { lat: 38.7139, lng: -9.1394 } };

  it('accepte un pseudo propre, ignore un pseudo sale sans perdre la réponse', () => {
    expect(parseBody({ ...good, pseudo: 'Léa' })?.pseudo).toBe('Léa');
    expect(parseBody({ ...good, pseudo: '<script>' })?.pseudo).toBeNull();
    expect(parseBody({ ...good, pseudo: 'a'.repeat(21) })?.pseudo).toBeNull();
    expect(parseBody(good)?.pseudo).toBeNull();
  });

  it('écrit le pseudo avec la réponse', async () => {
    const { sql, params } = fakeDb(venues);
    const { res } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: { ...good, pseudo: 'Léa' } }, res);
    expect(params[0]).toContain('Léa');
  });

  it('renvoie le pseudo au GET', async () => {
    const { sql } = fakeDb(venues);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'GET', query: { deviceId: 'd_abc123xyz' } }, res);
    expect((out.body as { records: { pseudo: string | null }[] }).records[0].pseudo).toBe('Léa');
  });
});

describe('api/live — avatar', () => {
  const venues = { v1: { lat: 38.7139, lng: -9.1394 } };

  it('accepte un code avatar valide, ignore un code faux sans perdre la réponse', () => {
    expect(parseBody({ ...good, avatar: 'b62' })?.avatar).toBe('b62');
    expect(parseBody({ ...good, avatar: 'z99' })?.avatar).toBeNull();
    expect(parseBody({ ...good, avatar: '<svg>' })?.avatar).toBeNull();
    expect(parseBody({ ...good, avatar: 'z99' })?.answer).toBe('few');
  });

  it("écrit l'avatar avec la réponse", async () => {
    const { sql, params } = fakeDb(venues);
    const { res } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: { ...good, avatar: 'b62' } }, res);
    expect(params[0]).toContain('b62');
  });

  it("renvoie l'avatar au GET", async () => {
    const { sql } = fakeDb(venues);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'GET', query: { deviceId: 'd_abc123xyz' } }, res);
    expect((out.body as { records: { avatar: string | null }[] }).records[0].avatar).toBe('b62');
  });
});

describe('distanceM', () => {
  it('mesure ~111 m pour 0,001° de latitude', () => {
    expect(Math.round(distanceM(38.7, -9.1, 38.701, -9.1))).toBeGreaterThan(105);
    expect(Math.round(distanceM(38.7, -9.1, 38.701, -9.1))).toBeLessThan(117);
  });
});

describe('api/live — garde par adresse IP', () => {
  const venues = { v1: { lat: 38.7139, lng: -9.1394 } };
  const IP = '203.0.113.7';
  const headers = { 'x-forwarded-for': `${IP}, 10.0.0.1` };

  /** Une base où l'on règle ce que les deux requêtes de garde comptent. */
  function guardedDb(recent: number, others: number) {
    const writes: string[] = [];
    const params: unknown[][] = [];
    const guardQueries: string[] = [];
    const sql: Sql = async (q, p = []) => {
      if (q.includes('from live_venues')) return venues[String(p[0]) as 'v1'] ? [venues.v1] : [];
      if (q.includes('count(distinct')) { guardQueries.push('others'); return [{ n: others }]; }
      if (q.includes('count(*)')) { guardQueries.push('recent'); return [{ n: recent }]; }
      writes.push(q.trim().split(/\s+/).slice(0, 2).join(' '));
      params.push(p);
      return [];
    };
    return { sql, writes, params, guardQueries };
  }

  it("sans adresse lisible (dev local), aucune garde et la réponse passe", async () => {
    const { sql, writes, guardQueries } = guardedDb(99, 99);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good }, res);
    expect(out.code).toBe(200);
    expect(guardQueries).toEqual([]);
    expect(writes[0]).toBe('insert into');
  });

  it("une réponse normale passe, et seule l'empreinte de l'IP est écrite, jamais l'IP", async () => {
    const { sql, writes, params } = guardedDb(0, 0);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good, headers }, res);
    expect(out.code).toBe(200);
    expect(writes[0]).toBe('insert into');
    const last = params[0][params[0].length - 1];
    expect(last).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(params)).not.toContain(IP);
  });

  it(`refuse au-delà de ${IP_MAX_RECENT} lieux répondus en quelques minutes depuis la même IP`, async () => {
    const { sql, writes } = guardedDb(IP_MAX_RECENT, 0);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good, headers }, res);
    expect(out.code).toBe(429);
    expect(out.body).toEqual({ error: 'rate_limited' });
    expect(writes).toHaveLength(0);
  });

  it(`refuse un ${IP_MAX_DEVICES_PER_VENUE + 1}e appareil fabriqué sur le même lieu depuis la même IP`, async () => {
    const { sql, writes } = guardedDb(0, IP_MAX_DEVICES_PER_VENUE);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good, headers }, res);
    expect(out.code).toBe(429);
    expect(writes).toHaveLength(0);
  });

  it("laisse passer deux téléphones sur le même wifi (cas légitime)", async () => {
    const { sql, writes } = guardedDb(1, IP_MAX_DEVICES_PER_VENUE - 1);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good, headers }, res);
    expect(out.code).toBe(200);
    expect(writes[0]).toBe('insert into');
  });

  it("l'empreinte : première adresse de la liste, change d'un jour à l'autre, nulle sans adresse", () => {
    const d1 = new Date('2026-11-05T10:00:00Z');
    const d2 = new Date('2026-11-06T10:00:00Z');
    expect(clientIpHash(headers, d1)).toBe(clientIpHash({ 'x-forwarded-for': IP }, d1));
    expect(clientIpHash({ 'x-forwarded-for': [IP] }, d1)).toBe(clientIpHash({ 'x-forwarded-for': IP }, d1));
    expect(clientIpHash(headers, d1)).not.toBe(clientIpHash(headers, d2));
    expect(clientIpHash(headers, d1)).not.toBe(clientIpHash({ 'x-forwarded-for': '203.0.113.8' }, d1));
    expect(clientIpHash({}, d1)).toBeNull();
    expect(clientIpHash(undefined, d1)).toBeNull();
  });
});
