// ---------------------------------------------------------------------------
// « La carte du jour » (Explorer) et « les horaires du jour » (Favoris) lisent
// la même règle : une case par heure, de 8 h à 21 h, et un trait qui dit
// maintenant. Tout ce qui se calcule sans React vit ici.
// ---------------------------------------------------------------------------

import type { Recommendation, SunMode } from '@/types';
import { IN_IT_THRESHOLD } from '@/services/RecommendationService';
import { tr } from './lang';

export const BAND_FROM = 8;
export const BAND_TO = 21;

export type BandCell = 'cool' | 's1' | 's2' | 's3' | 'night';

/** Une case par heure de la règle. L'heure est lue en son milieu : après le
 *  coucher, la case est la nuit, quelle que soit l'exposition calculée. */
export function bandCells(sunByHour: number[], sunsetMin: number): BandCell[] {
  const cells: BandCell[] = [];
  for (let h = BAND_FROM; h < BAND_TO; h++) {
    if (h * 60 + 30 > sunsetMin) {
      cells.push('night');
      continue;
    }
    const e = sunByHour[h] ?? 0;
    cells.push(e < 15 ? 'cool' : e < IN_IT_THRESHOLD.SUN ? 's1' : e < 70 ? 's2' : 's3');
  }
  return cells;
}

/** Position de « maintenant » sur la règle, de 0 (8 h) à 1 (21 h). */
export function nowFraction(minutesOfDay: number): number {
  const f = (minutesOfDay - BAND_FROM * 60) / ((BAND_TO - BAND_FROM) * 60);
  return Math.min(1, Math.max(0, f));
}

export type FavGroup = 'now' | 'later' | 'off';

/** Bons maintenant, plus tard (ou fini pour aujourd'hui), ou pas de soleil
 *  franc de toute la journée. */
export function favGroup(
  rec: Pick<Recommendation, 'sunPercentage' | 'sunLeavesInMin' | 'sunArrivesInMin'>,
  sunByHour: number[]
): FavGroup {
  if (rec.sunLeavesInMin !== null && rec.sunPercentage >= IN_IT_THRESHOLD.SUN) return 'now';
  const best = Math.max(...sunByHour.slice(BAND_FROM, BAND_TO));
  return best >= IN_IT_THRESHOLD.SUN ? 'later' : 'off';
}

export interface Until {
  label: string;
  value: string;
  /** Pas une heure de soleil : l'orange est réservé à la lumière. */
  cool: boolean;
}

/** Ce qu'une ligne de la carte annonce à la place du prix. */
export function untilOf(
  rec: Pick<
    Recommendation,
    | 'sunPercentage'
    | 'shadePercentage'
    | 'sunLeavesInMin'
    | 'sunArrivesInMin'
    | 'sunWindowStart'
    | 'sunWindowEnd'
    | 'arrivesTomorrow'
    | 'endsAtSunset'
    | 'lastsUntilSunset'
  >,
  mode: SunMode
): Until {
  const isSun = mode === 'SUN';
  const exposure = isSun ? rec.sunPercentage : rec.shadePercentage;
  if (rec.sunLeavesInMin !== null && exposure >= IN_IT_THRESHOLD[mode]) {
    const prefix = isSun ? '' : tr('au frais ', 'in the shade ');
    if (isSun ? rec.endsAtSunset : rec.lastsUntilSunset) {
      return { label: `${prefix}${tr("jusqu'au", 'until')}`, value: tr('coucher', 'sunset'), cool: !isSun };
    }
    return { label: `${prefix}${tr("jusqu'à", 'until')}`, value: rec.sunWindowEnd ?? '', cool: !isSun };
  }
  if (rec.sunArrivesInMin !== null && rec.sunWindowStart) {
    return { label: rec.arrivesTomorrow ? tr('demain dès', 'tomorrow from') : tr('dès', 'from'), value: rec.sunWindowStart, cool: true };
  }
  return { label: isSun ? tr('pas de soleil', 'no sun') : tr("pas d'ombre", 'no shade'), value: '—', cool: true };
}
