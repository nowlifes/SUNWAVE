import { describe, it, expect } from 'vitest';
import { createHandler, parseSubscribe, parseUnsubscribe, type Sql } from '../../api/push';

const good = {
  deviceId: 'd_abc123xyz',
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
  keys: { p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', auth: 'tBHItJI5svbpez7KI4CCXg' },
  pick: { day: '2026-09-25', name: 'Miradouro da Graça', walkMin: 12, until: '19:48' },
};

function fakeRes() {
  const out: { code: number; body: unknown; headers: Record<string, string> } = { code: 0, body: null, headers: {} };
  const res = {
    status(c: number) { out.code = c; return res; },
    setHeader(k: string, v: string) { out.headers[k] = v; },
    json(b: unknown) { out.body = b; return res; },
  };
  return { res, out };
}

function fakeDb(fail = false) {
  const calls: { q: string; p: unknown[] }[] = [];
  const sql: Sql = async (q, p = []) => {
    if (fail) throw new Error('password=secret');
    calls.push({ q: q.trim().replace(/\s+/g, ' '), p });
    return [];
  };
  return { sql, calls };
}

describe('api/push — validation', () => {
  it('accepte un abonnement bien formé', () => {
    expect(parseSubscribe(good)).toEqual({
      deviceId: good.deviceId,
      endpoint: good.endpoint,
      p256dh: good.keys.p256dh,
      auth: good.keys.auth,
      pick: good.pick,
    });
  });
  it('accepte un abonnement sans lieu', () => {
    expect(parseSubscribe({ ...good, pick: undefined })?.pick).toBeNull();
  });
  it('ignore un lieu mal formé sans refuser l’abonnement', () => {
    expect(parseSubscribe({ ...good, pick: { ...good.pick, walkMin: -3 } })?.pick).toBeNull();
  });
  it.each([
    ['appareil sans forme d_…', { ...good, deviceId: 'anonymous' }],
    ['endpoint http', { ...good, endpoint: 'http://push.example/x' }],
    ['endpoint absurde', { ...good, endpoint: 'pas une url' }],
    ['clés absentes', { ...good, keys: undefined }],
    ['clé avec injection', { ...good, keys: { p256dh: "x'; drop table t;--", auth: good.keys.auth } }],
    ['corps vide', null],
  ])('refuse : %s', (_, body) => {
    expect(parseSubscribe(body)).toBeNull();
  });
  it('désabonnement : appareil et endpoint requis', () => {
    expect(parseUnsubscribe({ deviceId: good.deviceId, endpoint: good.endpoint })).not.toBeNull();
    expect(parseUnsubscribe({ endpoint: good.endpoint })).toBeNull();
    expect(parseUnsubscribe({ deviceId: good.deviceId })).toBeNull();
  });
});

describe('api/push — handler', () => {
  it('POST enregistre l’abonnement avec son appareil', async () => {
    const { sql, calls } = fakeDb();
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good }, res);
    expect(out.code).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0].q).toContain('insert into push_subscriptions');
    expect(calls[0].p.slice(0, 2)).toEqual([good.endpoint, good.deviceId]);
  });

  it('POST ne reprend pas l’abonnement d’un autre appareil (clause device_id)', async () => {
    const { sql, calls } = fakeDb();
    const { res } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good }, res);
    expect(calls[0].q).toContain('where push_subscriptions.device_id = excluded.device_id');
  });

  it('POST mal formé : 400, rien d’écrit', async () => {
    const { sql, calls } = fakeDb();
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: { ...good, deviceId: 'x' } }, res);
    expect(out.code).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('DELETE retire l’abonnement de cet appareil seulement', async () => {
    const { sql, calls } = fakeDb();
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'DELETE', body: { deviceId: good.deviceId, endpoint: good.endpoint } }, res);
    expect(out.code).toBe(200);
    expect(calls[0].q).toContain('delete from push_subscriptions');
    expect(calls[0].q).toContain('device_id = $2');
    expect(calls[0].p).toEqual([good.endpoint, good.deviceId]);
  });

  it('autre méthode : 405', async () => {
    const { sql } = fakeDb();
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'GET' }, res);
    expect(out.code).toBe(405);
    expect(out.headers.Allow).toBe('POST, DELETE');
  });

  it('erreur base : 500 sans fuite du détail', async () => {
    const { sql } = fakeDb(true);
    const { res, out } = fakeRes();
    await createHandler(() => sql)({ method: 'POST', body: good }, res);
    expect(out.code).toBe(500);
    expect(JSON.stringify(out.body)).not.toContain('secret');
  });
});
