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

/** Le retour après le tap : ce que la réponse a produit, sans chiffre inventé. */
export function liveThanks(agreement: { same: number; total: number } | null, pseudo: string | null = null): string {
  const merci = pseudo ? `Merci ${pseudo}` : 'Merci';
  if (!agreement || agreement.total <= 1) {
    return `${merci} — tu es le premier ici. Ton avis sera vu pendant 45 min par ceux qui cherchent autour de toi.`;
  }
  const others = agreement.same - 1;
  if (others === 0) return `${merci} — ton avis compte : les autres réponses ici sont différentes. Il reste affiché 45 min.`;
  return `${merci} — ${others === 1 ? '1 autre personne a confirmé' : `${others} autres personnes ont confirmé`} la même chose. Ton avis reste affiché 45 min.`;
}

export function liveCount(total: number): string {
  return total <= 1 ? '1 confirmation : la tienne' : `Ce lieu compte maintenant ${total} confirmations`;
}

export const LIVE_SHORT: Record<LiveAnswer, string> = {
  plenty: 'Des places',
  few: 'Presque plein',
  none: 'Complet',
};

/** « à l'instant », « il y a 6 min » — la fraîcheur fait partie de la réponse. */
export function liveAge(ageMin: number): string {
  return ageMin < 1 ? "à l'instant" : `il y a ${ageMin} min`;
}

/** `by` : le pseudo de la voix la plus récente, s'il y en a un. */
export function liveWho(count: number, by: string | null = null): string {
  if (by) return count <= 1 ? `confirmé par ${by}` : `confirmé par ${by} et ${count - 1} autre${count > 2 ? 's' : ''}`;
  return count === 1 ? 'confirmé par 1 personne' : `confirmé par ${count} personnes`;
}

/** L'accueil de Maintenant, quand on a choisi un pseudo. */
export function liveHello(pseudo: string | null): string {
  return pseudo ? `Salut ${pseudo}.` : '';
}

/** « Il reste des places au soleil ? » n'a de sens que de jour : la nuit, on ne demande pas. */
export function isDaylight(now: Date): boolean {
  return now >= SunService.getSunrise(now) && now < SunService.getSunset(now);
}
