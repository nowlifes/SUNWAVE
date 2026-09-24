/**
 * Wall-clock helpers pinned to Europe/Lisbon.
 *
 * A `Date` is an absolute instant, so SunCalc and the shadow maths are already
 * correct for any visitor. What is NOT correct is `getHours()` / `setHours()`:
 * those read and write the *browser's* wall clock. A tourist whose phone is
 * still on Europe/Paris sees "0% sunny" at midday and windows that end at
 * "23:59", because the app indexes hourly exposure curves with a Paris hour.
 *
 * Every wall-clock read or write in the app goes through this module instead.
 */

export const APP_TIMEZONE = 'Europe/Lisbon';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: APP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

interface WallClockParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number;
  second: number;
}

/** Derniers instants décomposés. Un pas du curseur d'heure évalue ~970 lieux
 *  à la même minute, et chacun relisait l'heure plusieurs fois par Intl : c'était
 *  le plus gros coût du pas. Le résultat ne dépend que de l'instant. */
const PARTS_CACHE_MAX = 64;
const partsCache = new Map<number, Readonly<WallClockParts>>();

/** Decompose an instant into Lisbon wall-clock fields (gelé : partagé). */
export function lisbonParts(date: Date): Readonly<WallClockParts> {
  const t = date.getTime();
  const hit = partsCache.get(t);
  if (hit) return hit;
  const parts = partsFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((p) => p.type === type);
    return part ? Number(part.value) : 0;
  };
  const out = Object.freeze({
    year: read('year'),
    month: read('month'),
    day: read('day'),
    // Some engines render midnight as "24" under hour12:false.
    hour: read('hour') % 24,
    minute: read('minute'),
    second: read('second'),
  });
  if (partsCache.size >= PARTS_CACHE_MAX) partsCache.delete(partsCache.keys().next().value as number);
  partsCache.set(t, out);
  return out;
}

/** Offset of Europe/Lisbon from UTC, in ms, at the given instant. */
function lisbonOffsetMs(date: Date): number {
  const p = lisbonParts(date);
  const asIfUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Drop sub-second noise so the subtraction yields a clean offset.
  return asIfUTC - Math.floor(date.getTime() / 1000) * 1000;
}

/** Hour of day (0-23) in Lisbon. */
export function lisbonHour(date: Date): number {
  return lisbonParts(date).hour;
}

/** Minute of hour (0-59) in Lisbon. */
export function lisbonMinute(date: Date): number {
  return lisbonParts(date).minute;
}

/** Minutes elapsed since Lisbon midnight (0-1439). */
export function lisbonMinutesOfDay(date: Date): number {
  const p = lisbonParts(date);
  return p.hour * 60 + p.minute;
}

/** Day of week in Lisbon, 0 = Sunday, matching `Date.prototype.getDay()`. */
export function lisbonWeekday(date: Date): number {
  const p = lisbonParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/**
 * Instant corresponding to `hour:minute` Lisbon wall-clock on the same Lisbon
 * calendar day as `base`. The second pass re-reads the offset at the candidate
 * instant so the two DST switchovers a year land on the right side.
 */
export function setLisbonTime(base: Date, hour: number, minute = 0): Date {
  const p = lisbonParts(base);
  const wallClockAsUTC = Date.UTC(p.year, p.month - 1, p.day, hour, minute, 0);
  const firstGuess = wallClockAsUTC - lisbonOffsetMs(base);
  const refinedOffset = lisbonOffsetMs(new Date(firstGuess));
  return new Date(wallClockAsUTC - refinedOffset);
}

/** `HH:MM` in Lisbon. */
export function formatLisbonTime(date: Date): string {
  const p = lisbonParts(date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Minutes depuis minuit → heure et minute au quart d'heure le plus proche.
 *  Arrondir le TOTAL, pas les minutes seules : 17 h 59 donnait 17:00. */
export function snapToQuarter(totalMinutes: number): { hour: number; minute: number } {
  const snapped = Math.round(totalMinutes / 15) * 15;
  return { hour: Math.floor(snapped / 60), minute: snapped % 60 };
}
