import { describe, it, expect } from 'vitest';
import { createHandler, parseBody, distanceM, ZONE_M, type Sql } from '../../api/live';

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
  const sql: Sql = async (q, p = []) => {
    if (q.includes('from live_venues')) {
      const v = venues[String(p[0])];
      return v ? [v] : [];
    }
    if (q.includes('from live_reports')) {
      return [{ venue_id: 'v1', answer: 'few', mine: true, at: 1700000000000 }];
    }
    writes.push(q.trim().split(/\s+/).slice(0, 2).join(' '));
    return [];
  };
  return { sql, writes };
}

describe('api/live — validation', () => {
  it('accepte une réponse bien formée', () => {
    expect(parseBody(good)).toEqual(good);
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

describe('distanceM', () => {
  it('mesure ~111 m pour 0,001° de latitude', () => {
    expect(Math.round(distanceM(38.7, -9.1, 38.701, -9.1))).toBeGreaterThan(105);
    expect(Math.round(distanceM(38.7, -9.1, 38.701, -9.1))).toBeLessThan(117);
  });
});
