import { useMemo, type CSSProperties } from 'react';
import type { SunMode } from '@/types';
import { CYCLE, cardLight, circadian, textOn, type VenueLight } from '@/utils/circadian';
import { isNightAt } from '@/utils/ficheState';

/** Cycle circadien d'un écran `.cdj` (Explorer, Favoris) : le fond prend la
 *  teinte profonde de l'heure, chaque carte un liseré de la lumière de son
 *  lieu (variante C, validée le 2026-10-06). */
export function useCycleScreen(date: Date, mode: SunMode) {
  return useMemo(() => {
    if (!CYCLE) return { attrs: {}, vars: {} as CSSProperties, card: () => ({}) };
    const screen = circadian(date, mode);
    const sun = mode === 'SUN' ? screen : circadian(date, 'SUN');
    // La nuit de la fiche et de la carte : entre le coucher et le lever.
    const sunUp = !isNightAt(date);
    return {
      attrs: { 'data-cycle': '', 'data-fg': textOn(screen.deep) },
      vars: { '--cyc-ground': screen.deep } as CSSProperties,
      card: (inSun: boolean) => {
        const light: VenueLight = !sunUp ? 'night' : inSun ? 'sun' : 'shade';
        return { 'data-light': light, style: { '--cyc-edge': cardLight(sun, light) } as CSSProperties };
      },
    };
  }, [date, mode]);
}
