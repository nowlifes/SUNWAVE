import { MapService } from './MapService';
import type { GeoPoint } from '@/types';

// ---------------------------------------------------------------------------
// « Il reste des places au soleil ? » — la réponse de ceux qui sont là.
//
// Le calcul dit où le soleil devrait être ; quelqu'un assis sur la terrasse
// dit s'il y est et s'il reste de la place. Trois réponses, un tap, valables
// 45 minutes : au-delà, personne ne sait plus — le drapeau redevient gris
// plutôt que de mentir.
//
// Une réponse ne compte que si son auteur est à moins de LIVE_ZONE_M du lieu.
// Le contrôle est ici, côté client, faute de serveur : quand les réponses
// seront partagées (LiveStore distant), il devra être refait côté serveur.
// Une voix par appareil et par lieu : répondre deux fois remplace, ne cumule pas.
// ---------------------------------------------------------------------------

export type LiveAnswer = 'plenty' | 'few' | 'none';

export interface LiveRecord {
  venueId: string;
  answer: LiveAnswer;
  at: number;
  deviceId: string;
}

export interface LiveState {
  level: LiveAnswer;
  /** Nombre de personnes qui ont répondu (voix valides, une par appareil). */
  count: number;
  /** Minutes depuis la réponse la plus récente. */
  ageMin: number;
}

/** Où sont rangées les réponses. Aujourd'hui l'appareil ; demain un serveur. */
export interface LiveStore {
  load(): LiveRecord[];
  save(records: LiveRecord[]): void;
}

/** Le serveur partagé : ce que le service lui demande, rien de plus. */
export interface LiveRemote {
  fetchAll(deviceId: string): Promise<LiveRecord[]>;
  send(record: LiveRecord, user: GeoPoint): Promise<void>;
}

export const LIVE_ZONE_M = 100;
/** Une de nos réponses pas encore relue sur le serveur reste affichée ce temps-là. */
const PENDING_GRACE_MS = 60_000;
const POLL_MS = 45_000;
export const LIVE_TTL_MS = 45 * 60 * 1000;

const STORAGE_KEY = 'sun_live_reports';
const DEVICE_KEY = 'sun_device_id';

class LocalLiveStore implements LiveStore {
  load(): LiveRecord[] {
    try {
      if (typeof localStorage === 'undefined') return [];
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  save(records: LiveRecord[]): void {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch {
      // Stockage plein ou interdit : la session en cours garde ses réponses en mémoire.
    }
  }
}

/** L'API Vercel `/api/live`. Les identifiants des autres appareils n'y figurent
 *  pas : chacun devient une voix distincte, la nôtre est reconnue par `mine`. */
export class HttpLiveRemote implements LiveRemote {
  constructor(private readonly base = '/api/live') {}

  async fetchAll(deviceId: string): Promise<LiveRecord[]> {
    const res = await fetch(`${this.base}?deviceId=${encodeURIComponent(deviceId)}`);
    if (!res.ok) throw new Error(`live ${res.status}`);
    const body = (await res.json()) as { records?: { venueId: string; answer: LiveAnswer; at: number; mine: boolean }[] };
    return (body.records ?? []).map((r, i) => ({
      venueId: r.venueId,
      answer: r.answer,
      at: r.at,
      deviceId: r.mine ? deviceId : `other:${i}`,
    }));
  }

  async send(record: LiveRecord, user: GeoPoint): Promise<void> {
    const res = await fetch(this.base, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        venueId: record.venueId,
        answer: record.answer,
        deviceId: record.deviceId,
        lat: user.lat,
        lng: user.lng,
      }),
    });
    if (!res.ok) throw new Error(`live ${res.status}`);
  }
}

function localDeviceId(): string {
  try {
    if (typeof localStorage === 'undefined') return 'anonymous';
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `d_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

export class LiveReportService {
  private records: LiveRecord[];
  private listeners = new Set<() => void>();
  private version = 0;

  constructor(
    private readonly store: LiveStore = new LocalLiveStore(),
    private readonly deviceId: string = localDeviceId(),
    private readonly remote?: LiveRemote
  ) {
    this.records = store.load();
  }

  isInZone(venue: { latitude: number; longitude: number }, user: GeoPoint): boolean {
    const here = { lat: venue.latitude, lng: venue.longitude };
    return MapService.haversineDistance(here, user) <= LIVE_ZONE_M;
  }

  /** Renvoie faux quand l'auteur n'est pas sur place : la réponse est ignorée. */
  submit(
    venue: { id: string; latitude: number; longitude: number },
    answer: LiveAnswer,
    user: GeoPoint,
    now: number = Date.now()
  ): boolean {
    if (!this.isInZone(venue, user)) return false;
    this.records = this.records
      .filter((r) => !(r.venueId === venue.id && r.deviceId === this.deviceId))
      .filter((r) => now - r.at <= LIVE_TTL_MS);
    this.records.push({ venueId: venue.id, answer, at: now, deviceId: this.deviceId });
    this.commit();
    // La réponse s'affiche tout de suite ; le serveur la valide de son côté
    // (zone refaite là-bas) et `refresh` remet chacun d'accord.
    const record = this.records[this.records.length - 1];
    void this.remote
      ?.send(record, user)
      .then(() => this.refresh())
      .catch(() => {});
    return true;
  }

  private commit(): void {
    this.store.save(this.records);
    this.version++;
    for (const l of this.listeners) l();
  }

  /** Relit les réponses de tout le monde. Sans réseau, l'état local reste tel quel. */
  async refresh(now: number = Date.now()): Promise<void> {
    if (!this.remote) return;
    try {
      const fetched = await this.remote.fetchAll(this.deviceId);
      const pending = this.records.filter(
        (r) =>
          r.deviceId === this.deviceId &&
          now - r.at < PENDING_GRACE_MS &&
          !fetched.some((f) => f.deviceId === this.deviceId && f.venueId === r.venueId)
      );
      this.records = [...fetched, ...pending];
      this.commit();
    } catch {
      // Hors ligne ou serveur absent (vite dev) : on garde ce qu'on sait.
    }
  }

  /** Relit toutes les 45 s tant que l'onglet est visible ; renvoie l'arrêt. */
  startPolling(intervalMs: number = POLL_MS): () => void {
    if (!this.remote || typeof document === 'undefined') return () => {};
    void this.refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void this.refresh();
    }, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void this.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }

  private active(venueId: string, now: number): LiveRecord[] {
    return this.records.filter((r) => r.venueId === venueId && now - r.at <= LIVE_TTL_MS);
  }

  hasAnswered(venueId: string, now: number = Date.now()): boolean {
    return this.active(venueId, now).some((r) => r.deviceId === this.deviceId);
  }

  /** L'avis du moment : majorité des voix valides, à égalité la plus récente. */
  getState(venueId: string, now: number = Date.now()): LiveState | null {
    const rows = this.active(venueId, now);
    if (rows.length === 0) return null;
    const tally = new Map<LiveAnswer, { n: number; last: number }>();
    for (const r of rows) {
      const t = tally.get(r.answer) ?? { n: 0, last: 0 };
      tally.set(r.answer, { n: t.n + 1, last: Math.max(t.last, r.at) });
    }
    const [level] = [...tally.entries()].sort((a, b) => b[1].n - a[1].n || b[1].last - a[1].last)[0];
    const latest = Math.max(...rows.map((r) => r.at));
    return { level, count: rows.length, ageMin: Math.floor((now - latest) / 60_000) };
  }

  /** Combien de voix valides disent comme nous sur ce lieu (la nôtre comprise),
   *  et combien de voix en tout. Sert au retour après le tap : « 2 autres ont
   *  confirmé la même chose » est vrai, « tu as aidé 14 personnes » ne l'est pas. */
  getAgreement(venueId: string, now: number = Date.now()): { same: number; total: number } | null {
    const rows = this.active(venueId, now);
    const mine = rows.find((r) => r.deviceId === this.deviceId);
    if (!mine) return null;
    return { same: rows.filter((r) => r.answer === mine.answer).length, total: rows.length };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Change à chaque réponse : sert d'instantané à useSyncExternalStore. */
  getVersion(): number {
    return this.version;
  }
}

export const liveReports = new LiveReportService(undefined, undefined, new HttpLiveRemote());
// Démarre à l'import, dans le navigateur seulement (ni tests ni scripts Node).
if (typeof window !== 'undefined') liveReports.startPolling();
