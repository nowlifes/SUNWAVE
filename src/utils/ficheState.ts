import { SunService } from '@/services/SunService';
import { lisbonMinutesOfDay } from './lisbonTime';

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
