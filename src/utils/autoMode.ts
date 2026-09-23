import type { SunMode } from '@/types';

/** À partir de cette température, l'app ouvre sur l'ombre. Voir le test. */
export const HOT_THRESHOLD_C = 28;

/** Le mode proposé tant que la personne n'a pas choisi elle-même. */
export function autoMode(temperatureC: number): SunMode {
  return temperatureC >= HOT_THRESHOLD_C ? 'SHADE' : 'SUN';
}
