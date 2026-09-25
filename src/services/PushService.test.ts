import { describe, it, expect, vi } from 'vitest';
import { PushService, needsInstallHint, urlBase64ToUint8Array, type PushEnv, type SubscriptionLike } from './PushService';

const KEYS = { p256dh: 'BNcRdreALRFXTkOOUHK1', auth: 'tBHItJI5svbpez7K' };

function makeSub(over: Partial<SubscriptionLike> = {}): SubscriptionLike & { unsubscribe: ReturnType<typeof vi.fn> } {
  return {
    endpoint: 'https://push.example/abc',
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: KEYS }),
    unsubscribe: vi.fn(async () => true),
    ...over,
  } as SubscriptionLike & { unsubscribe: ReturnType<typeof vi.fn> };
}

function makeEnv(o: {
  supported?: boolean;
  permission?: NotificationPermission;
  requested?: NotificationPermission;
  existing?: SubscriptionLike | null;
  subscribeResult?: SubscriptionLike;
  subscribeError?: Error;
  status?: number;
  fetchError?: boolean;
  key?: string | undefined;
  device?: string;
} = {}) {
  const calls: { url: string; method: string; body: Record<string, unknown> }[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const subscribe = vi.fn(async (_options: unknown) => {
    if (o.subscribeError) throw o.subscribeError;
    return o.subscribeResult ?? makeSub();
  });
  const requestPermission = vi.fn(async () => o.requested ?? 'granted');
  const env: PushEnv = {
    supported: () => o.supported ?? true,
    permission: () => o.permission ?? 'default',
    requestPermission,
    registration: async () => ({ pushManager: { getSubscription: async () => o.existing ?? null, subscribe } }),
    fetch: async (url, init) => {
      if (o.fetchError) throw new Error('offline');
      calls.push({ url, method: init.method, body: JSON.parse(init.body) });
      const status = o.status ?? 200;
      return { ok: status >= 200 && status < 300, status };
    },
    vapidKey: () => ('key' in o ? o.key : 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'),
    deviceId: () => o.device ?? 'd_abc123xyz',
  };
  return { env, calls, subscribe, requestPermission };
}

describe('PushService — enable', () => {
  it('demande la permission, s’abonne avec la clé VAPID et envoie l’abonnement', async () => {
    const { env, calls, subscribe, requestPermission } = makeEnv();
    const pick = { day: '2026-09-25', name: 'Graça', walkMin: 12, until: '19:48' };
    const r = await new PushService(env).enable(() => pick);
    expect(r).toEqual({ ok: true });
    expect(requestPermission).toHaveBeenCalledOnce();
    const opts = subscribe.mock.calls[0][0] as { userVisibleOnly: boolean; applicationServerKey: Uint8Array };
    expect(opts.userVisibleOnly).toBe(true);
    expect(opts.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect(opts.applicationServerKey.length).toBe(65);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: '/api/push', method: 'POST' });
    expect(calls[0].body).toEqual({ deviceId: 'd_abc123xyz', endpoint: 'https://push.example/abc', keys: KEYS, pick });
  });

  it('ne redemande pas une permission déjà accordée, et réutilise l’abonnement existant', async () => {
    const { env, subscribe, requestPermission } = makeEnv({ permission: 'granted', existing: makeSub() });
    expect(await new PushService(env).enable()).toEqual({ ok: true });
    expect(requestPermission).not.toHaveBeenCalled();
    expect(subscribe).not.toHaveBeenCalled();
  });

  it('permission refusée : échec visible, rien envoyé', async () => {
    const { env, calls, subscribe } = makeEnv({ requested: 'denied' });
    const r = await new PushService(env).enable();
    expect(r).toMatchObject({ ok: false, reason: 'denied' });
    expect(r.ok === false && r.message).toMatch(/bloqu/);
    expect(subscribe).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
  });

  it('navigateur sans push : unsupported', async () => {
    const { env } = makeEnv({ supported: false });
    expect(await new PushService(env).enable()).toMatchObject({ ok: false, reason: 'unsupported' });
  });

  it('clé VAPID absente : no_key, sans demander la permission', async () => {
    const { env, requestPermission } = makeEnv({ key: undefined });
    expect(await new PushService(env).enable()).toMatchObject({ ok: false, reason: 'no_key' });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it('serveur en erreur : échec visible et abonnement du navigateur retiré', async () => {
    const sub = makeSub();
    const { env } = makeEnv({ status: 500, subscribeResult: sub });
    const r = await new PushService(env).enable();
    expect(r).toMatchObject({ ok: false, reason: 'server' });
    expect(sub.unsubscribe).toHaveBeenCalledOnce();
  });

  it('réseau coupé : échec visible', async () => {
    const { env } = makeEnv({ fetchError: true });
    expect(await new PushService(env).enable()).toMatchObject({ ok: false, reason: 'server' });
  });

  it('subscribe qui plante : échec visible avec le détail', async () => {
    const { env } = makeEnv({ subscribeError: new Error('AbortError') });
    const r = await new PushService(env).enable();
    expect(r).toMatchObject({ ok: false, reason: 'error' });
    expect(r.ok === false && r.message).toContain('AbortError');
  });

  it('un lieu qui plante n’empêche pas l’abonnement', async () => {
    const { env, calls } = makeEnv();
    const r = await new PushService(env).enable(() => {
      throw new Error('x');
    });
    expect(r).toEqual({ ok: true });
    expect(calls[0].body).not.toHaveProperty('pick');
  });
});

describe('PushService — disable', () => {
  it('prévient le serveur puis désabonne le navigateur', async () => {
    const sub = makeSub();
    const { env, calls } = makeEnv({ permission: 'granted', existing: sub });
    expect(await new PushService(env).disable()).toEqual({ ok: true });
    expect(calls[0]).toMatchObject({ method: 'DELETE', body: { deviceId: 'd_abc123xyz', endpoint: 'https://push.example/abc' } });
    expect(sub.unsubscribe).toHaveBeenCalledOnce();
  });

  it('serveur injoignable : désabonné en local, mais l’échec est rendu', async () => {
    const sub = makeSub();
    const { env } = makeEnv({ permission: 'granted', existing: sub, fetchError: true });
    const r = await new PushService(env).disable();
    expect(r).toMatchObject({ ok: false, reason: 'server' });
    expect(sub.unsubscribe).toHaveBeenCalledOnce();
  });

  it('pas d’abonnement : rien à faire', async () => {
    const { env, calls } = makeEnv({ permission: 'granted' });
    expect(await new PushService(env).disable()).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });
});

describe('PushService — état', () => {
  it('isSubscribed suit permission et abonnement', async () => {
    expect(await new PushService(makeEnv({ permission: 'granted', existing: makeSub() }).env).isSubscribed()).toBe(true);
    expect(await new PushService(makeEnv({ permission: 'granted' }).env).isSubscribed()).toBe(false);
    expect(await new PushService(makeEnv({ permission: 'default', existing: makeSub() }).env).isSubscribed()).toBe(false);
    expect(await new PushService(makeEnv({ supported: false }).env).isSubscribed()).toBe(false);
  });
  it('permission() dit unsupported sans push', () => {
    expect(new PushService(makeEnv({ supported: false }).env).permission()).toBe('unsupported');
    expect(new PushService(makeEnv({ permission: 'denied' }).env).permission()).toBe('denied');
  });
  it('refreshPick ne fait rien tant qu’on n’est pas abonné', async () => {
    const { env, calls } = makeEnv({ permission: 'granted' });
    expect(await new PushService(env).refreshPick(() => null)).toEqual({ ok: true });
    expect(calls).toHaveLength(0);
  });
  it('refreshPick renvoie le lieu quand on est abonné', async () => {
    const { env, calls } = makeEnv({ permission: 'granted', existing: makeSub() });
    const pick = { day: '2026-09-26', name: 'Graça', walkMin: 9, until: '19:45' };
    expect(await new PushService(env).refreshPick(() => pick)).toEqual({ ok: true });
    expect(calls[0].body.pick).toEqual(pick);
  });
});

describe('PushService — utilitaires', () => {
  it('urlBase64ToUint8Array décode le base64url', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });
  it('needsInstallHint : iPhone hors écran d’accueil seulement', () => {
    const iphone = { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' };
    expect(needsInstallHint(iphone, false)).toBe(true);
    expect(needsInstallHint(iphone, true)).toBe(false);
    expect(needsInstallHint({ ...iphone, standalone: true }, false)).toBe(false);
    expect(needsInstallHint({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }, false)).toBe(false);
    expect(needsInstallHint({ userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }, false)).toBe(true);
  });
});
