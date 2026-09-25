import { SunService } from './SunService';
import { RecommendationService } from './RecommendationService';
import { lisbonParts } from '@/utils/lisbonTime';
import { shortVenueName } from '@/utils/mapGuide';
import type { GeoPoint } from '@/types';

// ---------------------------------------------------------------------------
// « Golden hour dans 20 min » — la notification quotidienne.
//
// Seuil : la golden hour commence quand le soleil descend sous 6° d'altitude
// (même définition que suncalc.getTimes().goldenHour). Sous 6° la lumière
// rase et se réchauffe ; au-dessus, c'est encore le plein jour.
//
// Le cron (api/cron-golden.ts) est une fonction Vercel autonome : elle ne peut
// pas importer ce fichier. Elle recalcule le même instant avec suncalc
// directement ; GoldenHourService.test.ts vérifie que les deux concordent.
// Ne changer une constante ici qu'avec sa copie dans api/cron-golden.ts.
//
// Règle produit : une notification par jour, jamais la nuit, jamais un texte
// qui pousse à quitter un lieu.
// ---------------------------------------------------------------------------

export const GOLDEN_ELEVATION_DEG = 6;
/** Prévenir 20 min avant le début de la golden hour. */
export const LEAD_MIN = 20;
/** Largeur de la fenêtre d'envoi (centrée sur l'heure d'envoi). */
export const SEND_WINDOW_MIN = 15;

const MIN = 60_000;
const LISBON_CENTER: GeoPoint = { lat: 38.7223, lng: -9.1393 };

export interface GoldenPick {
  /** Nom court du lieu recommandé. */
  name: string;
  walkMin: number;
  /** « HH:MM » à Lisbonne : jusqu'à quand le soleil y tient. */
  until: string;
}

/** Jour civil de Lisbonne, « AAAA-MM-JJ ». */
export function lisbonDayKey(date: Date): string {
  const p = lisbonParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Midi (UTC) du jour civil de Lisbonne : une référence sûre pour les calculs du jour. */
function lisbonNoon(date: Date): Date {
  const p = lisbonParts(date);
  return new Date(Date.UTC(p.year, p.month - 1, p.day, 12));
}

/** Début de la golden hour du soir, le jour de Lisbonne de `date`. Dichotomie
 *  sur l'altitude de SunService, entre midi et le coucher (altitude décroissante). */
export function goldenHourStart(date: Date): Date | null {
  const noon = lisbonNoon(date);
  let lo = noon.getTime();
  let hi = SunService.getSunset(noon).getTime();
  if (SunService.getSunElevation(new Date(lo)) <= GOLDEN_ELEVATION_DEG) return null;
  if (SunService.getSunElevation(new Date(hi)) >= GOLDEN_ELEVATION_DEG) return null;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (SunService.getSunElevation(new Date(mid)) > GOLDEN_ELEVATION_DEG) lo = mid;
    else hi = mid;
  }
  return new Date(hi);
}

/** Heure d'envoi : début de la golden hour − 20 min. */
export function goldenSendTime(date: Date): Date | null {
  const start = goldenHourStart(date);
  return start ? new Date(start.getTime() - LEAD_MIN * MIN) : null;
}

/** Vrai dans la fenêtre de 15 min autour de l'heure d'envoi, si rien n'est déjà
 *  parti aujourd'hui (jour de Lisbonne). Jamais de nuit : le soleil doit être levé. */
export function shouldSendNow(now: Date, lastSentDay: string | null): boolean {
  if (lastSentDay === lisbonDayKey(now)) return false;
  if (SunService.getSunElevation(now) <= 0) return false;
  const at = goldenSendTime(now);
  if (!at) return false;
  const half = (SEND_WINDOW_MIN * MIN) / 2;
  const t = now.getTime() - at.getTime();
  return t >= -half && t < half;
}

export function goldenMessage(pick: GoldenPick | null): { title: string; body: string } {
  const title = `Golden hour dans ${LEAD_MIN} min`;
  if (!pick) return { title, body: 'La lumière dorée arrive sur Lisbonne. Vois où elle tombe.' };
  return { title, body: `${pick.name} : ${pick.walkMin} min à pied, soleil jusqu’à ${pick.until}.` };
}

/** Le lieu de la prochaine notification : celle d'aujourd'hui si son heure n'est
 *  pas passée, sinon celle de demain. `day` dit à quel jour de Lisbonne il vaut. */
export function pickForNextGoldenHour(now: Date): (GoldenPick & { day: string }) | null {
  const today = goldenSendTime(now);
  const target = today && today.getTime() > now.getTime() ? now : new Date(now.getTime() + 24 * 60 * MIN);
  const pick = pickForGoldenHour(target);
  return pick ? { ...pick, day: lisbonDayKey(target) } : null;
}

/** La reco Soleil de Lisbonne centre à l'instant où la golden hour commence. */
export function pickForGoldenHour(date: Date): GoldenPick | null {
  const start = goldenHourStart(date);
  if (!start) return null;
  const rec = RecommendationService.getAnswerList('SUN', LISBON_CENTER, start, [], undefined, 1)[0];
  if (!rec) return null;
  const sunset = SunService.getSunset(start);
  const p = lisbonParts(sunset);
  const sunsetHHMM = `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
  return { name: shortVenueName(rec.venue.name), walkMin: rec.walkTimeMin, until: rec.sunWindowEnd ?? sunsetHHMM };
}
