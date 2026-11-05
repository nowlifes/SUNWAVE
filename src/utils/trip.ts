import type { SunMode } from '@/types';

// ---------------------------------------------------------------------------
// « Tu étais à … ». « M'y emmener » mémorise le lieu visé et l'heure ; à la
// réouverture suivante, entre 20 min et 4 h plus tard, l'app demande en un tap
// si c'était comme promis. Rangé sur l'appareil, rien n'est envoyé.
// ---------------------------------------------------------------------------

export type TripAnswer = 'yes' | 'partly' | 'no';

export interface Trip {
  venueId: string;
  mode: SunMode;
  at: number;
}

/** Avant 20 min, la personne est encore en route ; après 4 h, elle ne s'en souvient plus. */
export const TRIP_MIN_MS = 20 * 60 * 1000;
export const TRIP_MAX_MS = 4 * 60 * 60 * 1000;

const KEY = 'sun_trip';
const LOG_KEY = 'sun_trip_log';
const LOG_MAX = 20;

function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Stockage interdit : la sortie n'est simplement pas mémorisée.
  }
}

/** Le dernier lieu visé remplace le précédent : une sortie à la fois. */
export function rememberTrip(venueId: string, mode: SunMode, now: number = Date.now()): void {
  const trip: Trip = { venueId, mode, at: now };
  write(KEY, JSON.stringify(trip));
}

export function clearTrip(): void {
  write(KEY, null);
}

/** La sortie à demander maintenant, ou null (rien de mémorisé, trop tôt, trop tard). */
export function pendingTrip(now: number = Date.now()): Trip | null {
  const raw = read(KEY);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as Partial<Trip>;
    if (typeof t.venueId !== 'string' || typeof t.at !== 'number' || (t.mode !== 'SUN' && t.mode !== 'SHADE')) {
      clearTrip();
      return null;
    }
    const age = now - t.at;
    if (age > TRIP_MAX_MS || age < 0) {
      clearTrip();
      return null;
    }
    if (age < TRIP_MIN_MS) return null;
    return { venueId: t.venueId, mode: t.mode, at: t.at };
  } catch {
    clearTrip();
    return null;
  }
}

/** Clôt la sortie. Une réponse (pas un « pas maintenant ») est gardée sur l'appareil. */
export function closeTrip(trip: Trip, answer: TripAnswer | null, now: number = Date.now()): void {
  clearTrip();
  if (!answer) return;
  try {
    const log = JSON.parse(read(LOG_KEY) ?? '[]');
    const rows = Array.isArray(log) ? log : [];
    rows.push({ venueId: trip.venueId, mode: trip.mode, answer, at: now });
    write(LOG_KEY, JSON.stringify(rows.slice(-LOG_MAX)));
  } catch {
    // Journal illisible : la réponse est perdue, la question est quand même close.
  }
}
