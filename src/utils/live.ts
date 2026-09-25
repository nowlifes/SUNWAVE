import type { LiveAnswer } from '@/services/LiveReportService';
import type { SunMode, VenueCategory } from '@/types';
import { SunService } from '@/services/SunService';

export const LIVE_ANSWERS: { answer: LiveAnswer; hint: string }[] = [
  { answer: 'plenty', hint: 'on peut arriver sans souci' },
  { answer: 'few', hint: 'mieux vaut se dépêcher' },
  { answer: 'none', hint: "tout est pris ou à l'ombre" },
];

/** « places » se lit « place publique » sur une carte de Lisbonne : on nomme
 *  ce qu'on cherche vraiment — une table en terrasse, un coin ailleurs. */
const SEATED: VenueCategory[] = ['cafe', 'restaurant', 'bar', 'rooftop'];

export function liveQuestion(category: VenueCategory, mode: SunMode): string {
  const what = SEATED.includes(category) ? 'des tables' : 'des coins';
  return `Il reste ${what} ${mode === 'SUN' ? 'au soleil' : "à l'ombre"} ?`;
}

/** Répond à « Il reste des tables/coins ? » sans accorder : « Quelques-unes »
 *  passait sur deux lignes dans un tiers de carte. */
export function liveLabel(answer: LiveAnswer): string {
  if (answer === 'plenty') return 'Oui, plein';
  if (answer === 'few') return 'Il en reste';
  return 'Tout est pris';
}

/** Pourquoi on demande : sans cette ligne, la question a l'air d'un sondage. */
export const LIVE_WHY = 'Ta réponse aide ceux qui hésitent à venir.';

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
