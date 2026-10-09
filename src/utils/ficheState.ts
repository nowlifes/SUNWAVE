import { SunService } from '@/services/SunService';
import { lisbonMinutesOfDay } from './lisbonTime';
import { tr } from './lang';

/** Avant le lever ou après le coucher : la nuit, pour tout le monde. */
export function isNightAt(d: Date): boolean {
  const m = lisbonMinutesOfDay(d);
  return m >= lisbonMinutesOfDay(SunService.getSunset(d)) || m < lisbonMinutesOfDay(SunService.getSunrise(d));
}

/** Le mot d'une ligne de la fiche. La nuit, ni « Soleil » ni « Ombre » : un
 *  lieu qui n'est « pas à l'ombre » la nuit n'est pas au soleil pour autant. */
export function stateWord(inIt: boolean, isSun: boolean, night: boolean): 'Soleil' | 'Ombre' | 'Nuit' {
  if (night) return 'Nuit';
  return inIt === isSun ? 'Soleil' : 'Ombre';
}

/** Le mot à afficher pour `stateWord` : celui-ci reste l'identifiant (comparé
 *  ailleurs à 'Soleil'), le libellé suit la langue. */
export function stateLabel(word: 'Soleil' | 'Ombre' | 'Nuit'): string {
  if (word === 'Soleil') return tr('Soleil', 'Sun');
  if (word === 'Ombre') return tr('Ombre', 'Shade');
  return tr('Nuit', 'Night');
}
