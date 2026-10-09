import type { LiveAnswer } from '@/services/LiveReportService';
import type { SunMode, VenueCategory } from '@/types';
import { SunService } from '@/services/SunService';
import { tr } from './lang';

// Les textes affichés se lisent au moment de l'appel (getters, fonctions) :
// une constante de module figerait la langue du chargement.

export const LIVE_ANSWERS: { answer: LiveAnswer; readonly hint: string }[] = [
  { answer: 'plenty', get hint() { return tr('on peut arriver sans souci', 'just turn up'); } },
  { answer: 'few', get hint() { return tr('mieux vaut se dépêcher', 'better hurry'); } },
  { answer: 'none', get hint() { return tr("tout est pris ou à l'ombre", 'all taken or in the shade'); } },
];

/** « places » se lit « place publique » sur une carte de Lisbonne : on nomme
 *  ce qu'on cherche vraiment — une table en terrasse, un coin ailleurs. */
const SEATED: VenueCategory[] = ['cafe', 'restaurant', 'bar', 'rooftop'];

export function liveQuestion(category: VenueCategory, mode: SunMode): string {
  const seated = SEATED.includes(category);
  if (mode === 'SUN') return seated ? tr('Il reste des tables au soleil ?', 'Any tables left in the sun?') : tr('Il reste des coins au soleil ?', 'Any spots left in the sun?');
  return seated ? tr("Il reste des tables à l'ombre ?", 'Any tables left in the shade?') : tr("Il reste des coins à l'ombre ?", 'Any spots left in the shade?');
}

/** Répond à « Il reste des tables/coins ? » sans accorder : « Quelques-unes »
 *  passait sur deux lignes dans un tiers de carte. */
export function liveLabel(answer: LiveAnswer): string {
  if (answer === 'plenty') return tr('Oui, plein', 'Yes, loads');
  if (answer === 'few') return tr('Il en reste', 'A few left');
  return tr('Tout est pris', 'All taken');
}

/** Pourquoi on demande : sans cette ligne, la question a l'air d'un sondage. */
export function liveWhy(): string {
  return tr('Ta réponse aide ceux qui hésitent à venir.', 'Your answer helps anyone wondering whether to come.');
}

/** Le retour après le tap : ce que la réponse a produit, sans chiffre inventé. */
export function liveThanks(agreement: { same: number; total: number } | null, pseudo: string | null = null): string {
  const merci = pseudo ? tr(`Merci ${pseudo}`, `Thanks, ${pseudo}`) : tr('Merci', 'Thanks');
  if (!agreement || agreement.total <= 1) {
    return tr(
      `${merci} — tu es le premier ici. Ton avis sera vu pendant 45 min par ceux qui cherchent autour de toi.`,
      `${merci} — you’re the first here. People looking nearby will see your answer for 45 min.`
    );
  }
  const others = agreement.same - 1;
  if (others === 0) {
    return tr(
      `${merci} — ton avis compte : les autres réponses ici sont différentes. Il reste affiché 45 min.`,
      `${merci} — your answer counts: the other answers here say something else. It stays up for 45 min.`
    );
  }
  return tr(
    `${merci} — ${others === 1 ? '1 autre personne a confirmé' : `${others} autres personnes ont confirmé`} la même chose. Ton avis reste affiché 45 min.`,
    `${merci} — ${others === 1 ? '1 other person' : `${others} other people`} confirmed the same thing. Your answer stays up for 45 min.`
  );
}

export function liveCount(total: number): string {
  return total <= 1
    ? tr('1 confirmation : la tienne', '1 confirmation: yours')
    : tr(`Ce lieu compte maintenant ${total} confirmations`, `This place now has ${total} confirmations`);
}

export const LIVE_SHORT: Readonly<Record<LiveAnswer, string>> = {
  get plenty() { return tr('Des places', 'Seats free'); },
  get few() { return tr('Presque plein', 'Nearly full'); },
  get none() { return tr('Complet', 'Full'); },
};

/** « à l'instant », « il y a 6 min » — la fraîcheur fait partie de la réponse. */
export function liveAge(ageMin: number): string {
  return ageMin < 1 ? tr("à l'instant", 'just now') : tr(`il y a ${ageMin} min`, `${ageMin} min ago`);
}

/** `by` : le pseudo de la voix la plus récente, s'il y en a un. */
export function liveWho(count: number, by: string | null = null): string {
  if (by) {
    return count <= 1
      ? tr(`confirmé par ${by}`, `confirmed by ${by}`)
      : tr(`confirmé par ${by} et ${count - 1} autre${count > 2 ? 's' : ''}`, `confirmed by ${by} and ${count - 1} other${count > 2 ? 's' : ''}`);
  }
  return count === 1 ? tr('confirmé par 1 personne', 'confirmed by 1 person') : tr(`confirmé par ${count} personnes`, `confirmed by ${count} people`);
}

/** L'accueil de Maintenant, quand on a choisi un pseudo. */
export function liveHello(pseudo: string | null): string {
  return pseudo ? tr(`Salut ${pseudo}.`, `Hi ${pseudo}.`) : '';
}

/** « Il reste des places au soleil ? » n'a de sens que de jour : la nuit, on ne demande pas. */
export function isDaylight(now: Date): boolean {
  return now >= SunService.getSunrise(now) && now < SunService.getSunset(now);
}
