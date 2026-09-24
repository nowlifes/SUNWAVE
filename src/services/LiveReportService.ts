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

export const LIVE_ZONE_M = 100;
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
    private readonly deviceId: string = localDeviceId()
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
    this.store.save(this.records);
    this.version++;
    for (const l of this.listeners) l();
    return true;
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

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Change à chaque réponse : sert d'instantané à useSyncExternalStore. */
  getVersion(): number {
    return this.version;
  }
}

export const liveReports = new LiveReportService();
