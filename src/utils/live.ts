import type { LiveAnswer } from '@/services/LiveReportService';
import { SunService } from '@/services/SunService';

export const LIVE_ANSWERS: { answer: LiveAnswer; label: string; hint: string }[] = [
  { answer: 'plenty', label: 'Plein de places', hint: 'on peut arriver sans souci' },
  { answer: 'few', label: 'Quelques-unes', hint: 'mieux vaut se dépêcher' },
  { answer: 'none', label: 'Plus rien', hint: "tout est pris ou à l'ombre" },
];

export const LIVE_SHORT: Record<LiveAnswer, string> = {
  plenty: 'Des places',
  few: 'Presque plein',
  none: 'Complet',
};

/** « à l'instant », « il y a 6 min » — la fraîcheur fait partie de la réponse. */
export function liveAge(ageMin: number): string {
  return ageMin < 1 ? "à l'instant" : `il y a ${ageMin} min`;
}

export function liveWho(count: number): string {
  return count === 1 ? 'confirmé par 1 personne' : `confirmé par ${count} personnes`;
}

/** « Il reste des places au soleil ? » n'a de sens que de jour : la nuit, on ne demande pas. */
export function isDaylight(now: Date): boolean {
  return now >= SunService.getSunrise(now) && now < SunService.getSunset(now);
}
