// ---------------------------------------------------------------------------
// Notifications push : enregistrement du service worker, abonnement, envoi de
// l'abonnement à /api/push, désabonnement.
//
// Aucune erreur n'est avalée : chaque méthode rend un PushResult dont `message`
// est prêt à être affiché tel quel dans l'interface.
//
// Variables (build) : VITE_VAPID_PUBLIC_KEY — la clé publique VAPID.
// Le navigateur est isolé derrière PushEnv pour que le service se teste sans DOM.
// ---------------------------------------------------------------------------

export type PushFailure = 'unsupported' | 'denied' | 'no_key' | 'no_device' | 'server' | 'error';
export type PushResult = { ok: true } | { ok: false; reason: PushFailure; message: string };

/** Le lieu du jour calculé sur l'appareil, transmis au serveur (voir api/push.ts). */
export interface PushPick {
  day: string;
  name: string;
  walkMin: number;
  until: string;
}

export interface SubscriptionLike {
  endpoint: string;
  toJSON(): { endpoint?: string; keys?: Record<string, string> };
  unsubscribe(): Promise<boolean>;
}
export interface RegistrationLike {
  pushManager: {
    getSubscription(): Promise<SubscriptionLike | null>;
    subscribe(options: { userVisibleOnly: boolean; applicationServerKey: Uint8Array }): Promise<SubscriptionLike>;
  };
}

export interface PushEnv {
  supported(): boolean;
  permission(): NotificationPermission;
  requestPermission(): Promise<NotificationPermission>;
  /** Enregistre /sw.js (une seule fois) et rend l'enregistrement actif. */
  registration(): Promise<RegistrationLike>;
  fetch(url: string, init: { method: string; headers: Record<string, string>; body: string }): Promise<{ ok: boolean; status: number }>;
  vapidKey(): string | undefined;
  deviceId(): string;
}

const MSG = {
  unsupported: 'Les notifications ne sont pas disponibles sur ce navigateur.',
  denied: 'Les notifications sont bloquées. Autorise-les dans les réglages du navigateur.',
  no_key: 'Les notifications ne sont pas encore configurées.',
  no_device: 'Appareil non identifié : recharge l’app et réessaie.',
  server: 'Le serveur n’a pas répondu. Réessaie dans un instant.',
  error: 'Impossible d’activer les notifications. Réessaie dans un instant.',
} as const;

const fail = (reason: PushFailure, message: string = MSG[reason]): PushResult => ({ ok: false, reason, message });

/** Clé VAPID publique (base64url) → octets attendus par pushManager.subscribe. */
export function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const DEVICE_KEY = 'sun_device_id';

function browserDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return '';
  }
}

export function browserEnv(): PushEnv {
  let registration: Promise<RegistrationLike> | null = null;
  return {
    supported: () =>
      typeof window !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window,
    permission: () => Notification.permission,
    requestPermission: () => Notification.requestPermission(),
    registration: () => {
      registration ??= navigator.serviceWorker
        .register('/sw.js')
        .then(() => navigator.serviceWorker.ready as unknown as Promise<RegistrationLike>);
      // Un échec d'enregistrement ne doit pas rester en cache : le prochain essai repart de zéro.
      registration.catch(() => {
        registration = null;
      });
      return registration;
    },
    fetch: (url, init) => fetch(url, init),
    vapidKey: () => import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined,
    deviceId: browserDeviceId,
  };
}

/** iPhone/iPad hors écran d'accueil : Safari n'y offre pas le push. */
export function needsInstallHint(nav: { userAgent: string; maxTouchPoints?: number; platform?: string; standalone?: boolean }, standaloneMedia: boolean): boolean {
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  return ios && !standaloneMedia && nav.standalone !== true;
}

export function browserNeedsInstallHint(): boolean {
  if (typeof navigator === 'undefined') return false;
  const standalone = typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  return needsInstallHint(navigator as unknown as Parameters<typeof needsInstallHint>[0], standalone);
}

const ENDPOINT = '/api/push';

export class PushService {
  constructor(private readonly env: PushEnv = browserEnv()) {}

  isSupported(): boolean {
    return this.env.supported();
  }

  /** 'unsupported' quand le navigateur n'a pas le push. */
  permission(): NotificationPermission | 'unsupported' {
    return this.env.supported() ? this.env.permission() : 'unsupported';
  }

  async isSubscribed(): Promise<boolean> {
    if (!this.env.supported() || this.env.permission() !== 'granted') return false;
    try {
      const reg = await this.env.registration();
      return (await reg.pushManager.getSubscription()) !== null;
    } catch {
      // Lecture seule : « pas abonné » est l'état sûr à afficher ; enable/disable, eux, remontent leurs erreurs.
      return false;
    }
  }

  async enable(getPick?: () => PushPick | null): Promise<PushResult> {
    if (!this.env.supported()) return fail('unsupported');
    const key = this.env.vapidKey();
    if (!key) return fail('no_key');
    const deviceId = this.env.deviceId();
    if (!deviceId) return fail('no_device');

    try {
      const permission = this.env.permission() === 'granted' ? 'granted' : await this.env.requestPermission();
      if (permission !== 'granted') return fail('denied');

      const reg = await this.env.registration();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));

      const sent = await this.post(sub, deviceId, getPick);
      if (!sent.ok) {
        // Le serveur ne connaît pas cet abonnement : on le retire du navigateur
        // pour que l'interrupteur ne mente pas.
        await sub.unsubscribe().catch(() => false);
        return sent;
      }
      return { ok: true };
    } catch (err) {
      return fail('error', err instanceof Error && err.message ? `${MSG.error} (${err.message})` : MSG.error);
    }
  }

  async disable(): Promise<PushResult> {
    if (!this.env.supported()) return fail('unsupported');
    try {
      const reg = await this.env.registration();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return { ok: true };
      let serverOk = true;
      try {
        const res = await this.env.fetch(ENDPOINT, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: this.env.deviceId(), endpoint: sub.endpoint }),
        });
        serverOk = res.ok;
      } catch {
        serverOk = false;
      }
      // On désabonne le navigateur quoi qu'il arrive : c'est ce que l'utilisateur a demandé.
      await sub.unsubscribe();
      return serverOk
        ? { ok: true }
        : fail('server', 'Coupé sur cet appareil, mais le serveur n’a pas confirmé. Tu ne devrais plus rien recevoir.');
    } catch (err) {
      return fail('error', err instanceof Error && err.message ? `${MSG.error} (${err.message})` : MSG.error);
    }
  }

  /** Renvoie le lieu du jour au serveur pour un appareil déjà abonné. */
  async refreshPick(getPick: () => PushPick | null): Promise<PushResult> {
    if (!(await this.isSubscribed())) return { ok: true };
    const deviceId = this.env.deviceId();
    if (!deviceId) return fail('no_device');
    try {
      const reg = await this.env.registration();
      const sub = await reg.pushManager.getSubscription();
      if (!sub) return { ok: true };
      return await this.post(sub, deviceId, getPick);
    } catch (err) {
      return fail('error', err instanceof Error && err.message ? `${MSG.error} (${err.message})` : MSG.error);
    }
  }

  private async post(sub: SubscriptionLike, deviceId: string, getPick?: () => PushPick | null): Promise<PushResult> {
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return fail('error');
    let pick: PushPick | null = null;
    try {
      pick = getPick ? getPick() : null;
    } catch {
      // Le lieu est un plus : sans lui, le serveur envoie un message sans lieu.
      pick = null;
    }
    try {
      const res = await this.env.fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId, endpoint: json.endpoint, keys: json.keys, ...(pick ? { pick } : {}) }),
      });
      return res.ok ? { ok: true } : fail('server');
    } catch {
      return fail('server');
    }
  }
}

export const pushService = new PushService();
