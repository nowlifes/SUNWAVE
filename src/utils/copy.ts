import type { GeoPoint, Recommendation, SunMode } from '@/types';
import { MapService } from '@/services/MapService';
import { getLang, tr } from '@/utils/lang';
import { SunService } from '@/services/SunService';
import { isNightAt } from './ficheState';
import { formatLisbonTime, lisbonMinutesOfDay } from './lisbonTime';

// ---------------------------------------------------------------------------
// Les phrases que l'app dit sur un lieu — une seule source.
//
// Chaque écran recomposait les siennes à partir de champs différents : la
// fiche détail affichait « Sunny for 5H » là où l'accueil disait « Perd le
// soleil dans 4h 30m » pour le même lieu à la même minute. Un chiffre qui
// change d'un écran à l'autre, c'est un chiffre auquel on ne croit plus.
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<string, [fr: string, en: string]> = {
  rooftop: ['Rooftop', 'Rooftop'],
  terrace: ['Terrasse', 'Terrace'],
  miradouro: ['Belvédère', 'Viewpoint'],
  viewpoint: ['Belvédère', 'Viewpoint'],
  park: ['Parc', 'Park'],
  beach: ['Plage', 'Beach'],
  square: ['Place', 'Square'],
  cafe: ['Café', 'Café'],
  bar: ['Bar', 'Bar'],
  restaurant: ['Restaurant', 'Restaurant'],
};

export function categoryLabel(category: string): string {
  const label = CATEGORY_LABEL[category];
  return label ? tr(...label) : category.charAt(0).toUpperCase() + category.slice(1);
}

/** « 45 % » en français, « 45% » en anglais. */
export function pct(n: number): string {
  return getLang() === 'en' ? `${n}%` : `${n} %`;
}

/** Au-delà, « N min à pied » ne décrit plus un trajet que quelqu'un fera —
 *  depuis Caparica, un café de Lisbonne était à « 136 min à pied ». */
const MAX_WALK_MIN = 20;

/** Le trajet en deux morceaux, pour les écrans qui grossissent le chiffre. */
export function travelParts(rec: Pick<Recommendation, 'walkTimeMin' | 'distanceM'>): { value: string; unit: string } {
  if (rec.walkTimeMin <= MAX_WALK_MIN) return { value: String(rec.walkTimeMin), unit: tr('min à pied', 'min walk') };
  return { value: MapService.formatDistance(rec.distanceM), unit: tr('d\'ici', 'away') };
}

/** « 12 min à pied », ou « 11,1 km d'ici » quand ce n'est plus de la marche. */
export function travelLabel(rec: Pick<Recommendation, 'walkTimeMin' | 'distanceM'>): string {
  const { value, unit } = travelParts(rec);
  return `${value} ${unit}`;
}

/** La promesse de l'accueil. Un lieu relevé dans OSM sans visite ne compte
 *  pas dans « vérifiés à pied » : il est annoncé à part. */
export function venueCountLine(total: number, verified: number): string {
  if (verified === total) return tr(`${total} lieux, tous vérifiés à pied.`, `${total} places, all checked on foot.`);
  return tr(
    `${verified} lieux vérifiés à pied, ${total - verified} encore à vérifier.`,
    `${verified} places checked on foot, ${total - verified} still to check.`
  );
}

/** « 45 min », « 2h », « 5h 2m » — comme on le dit. */
export function formatGap(minutes: number): string {
  const min = Math.max(0, Math.round(minutes));
  if (min === 0) return '0 min';
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export interface StatusCopy {
  title: string;
  detail: string;
}

/** Ce qu'il faut savoir d'un lieu maintenant, en deux lignes. */
/** Le prochain lever : demain si le soleil est déjà couché. */
function nextSunrise(at: Date): Date {
  const afterSunset = lisbonMinutesOfDay(at) >= lisbonMinutesOfDay(SunService.getSunset(at));
  return SunService.getSunrise(afterSunset ? new Date(at.getTime() + 24 * 3600_000) : at);
}

/** `at` : l'instant décrit. La nuit en Ombre, « 100 % d'ombre » ou « à l'ombre
 *  jusqu'au coucher » seraient vrais mais à côté : il fait nuit pour tous. */
export function statusCopy(rec: Recommendation, mode: SunMode, at?: Date): StatusCopy {
  if (mode === 'SHADE' && at && isNightAt(at)) {
    const sunrise = formatLisbonTime(nextSunrise(at));
    return {
      title: tr('Il fait nuit', 'It’s night'),
      detail: tr(`Le soleil revient à ${sunrise}`, `The sun is back at ${sunrise}`),
    };
  }
  const isSun = mode === 'SUN';
  const exposure = pct(isSun ? rec.sunPercentage : rec.shadePercentage);
  const le = isSun ? tr('le soleil', 'the sun') : tr("l'ombre", 'the shade');
  const de = isSun ? tr('de soleil', 'sun') : tr("d'ombre", 'shade');

  if (rec.sunLeavesInMin !== null && rec.lastsUntilSunset) {
    return {
      title: tr("À l'ombre jusqu'au coucher du soleil", 'In the shade until sunset'),
      detail: tr(
        `${exposure} ${de} maintenant · encore ${formatGap(rec.sunLeavesInMin)}`,
        `${exposure} ${de} now · ${formatGap(rec.sunLeavesInMin)} left`
      ),
    };
  }
  // Rien ne cache le soleil d'ici le coucher : « perd le soleil dans 1h 47m »
  // ferait guetter un immeuble. Seule la carte le dit — les pastilles gardent
  // le temps restant.
  if (isSun && rec.sunLeavesInMin !== null && rec.endsAtSunset) {
    return {
      title: tr("Au soleil jusqu'au coucher", 'In the sun until sunset'),
      detail: tr(
        `${exposure} de soleil maintenant · dernier rayon à ${rec.sunWindowEnd}`,
        `${exposure} sun now · last light at ${rec.sunWindowEnd}`
      ),
    };
  }
  if (rec.sunLeavesInMin !== null) {
    return {
      title: tr(`Perd ${le} dans ${formatGap(rec.sunLeavesInMin)}`, `Loses ${le} in ${formatGap(rec.sunLeavesInMin)}`),
      detail: tr(
        `${exposure} ${de} maintenant${rec.sunWindowEnd ? ` · jusqu'à ${rec.sunWindowEnd}` : ''}`,
        `${exposure} ${de} now${rec.sunWindowEnd ? ` · until ${rec.sunWindowEnd}` : ''}`
      ),
    };
  }
  if (rec.sunArrivesInMin !== null && rec.arrivesTomorrow) {
    return {
      title: tr(`Soleil demain dès ${rec.sunWindowStart}`, `Sun tomorrow from ${rec.sunWindowStart}`),
      detail: tr(`Dans ${formatGap(rec.sunArrivesInMin)}`, `In ${formatGap(rec.sunArrivesInMin)}`),
    };
  }
  if (rec.sunArrivesInMin !== null) {
    const gap = formatGap(rec.sunArrivesInMin);
    return {
      title: isSun
        ? tr(`Le soleil arrive dans ${gap}`, `Sun arrives in ${gap}`)
        : tr(`L'ombre arrive dans ${gap}`, `Shade arrives in ${gap}`),
      detail: rec.sunWindowStart
        ? tr(`À partir de ${rec.sunWindowStart} · ${exposure} maintenant`, `From ${rec.sunWindowStart} · ${exposure} now`)
        : tr(`Plus tard · ${exposure} maintenant`, `Later · ${exposure} now`),
    };
  }
  return {
    title: tr(`${exposure} ${de} maintenant`, `${exposure} ${de} now`),
    detail: isSun
      ? tr("Pas de soleil franc d'ici ce soir", 'No full sun before this evening')
      : tr("Pas d'ombre franche d'ici le coucher", 'No real shade before sunset'),
  };
}

/** Version courte, pour une ligne de liste. */
export function statusShort(rec: Recommendation, mode: SunMode): string {
  const exposure = mode === 'SUN' ? rec.sunPercentage : rec.shadePercentage;
  if (rec.sunLeavesInMin !== null) {
    const gap = formatGap(rec.sunLeavesInMin);
    return rec.lastsUntilSunset ? tr("jusqu'au coucher", 'until sunset') : tr(`encore ${gap}`, `${gap} left`);
  }
  if (rec.sunArrivesInMin !== null) {
    const gap = formatGap(rec.sunArrivesInMin);
    return rec.arrivesTomorrow
      ? tr(`demain dès ${rec.sunWindowStart}`, `tomorrow from ${rec.sunWindowStart}`)
      : tr(`dans ${gap}`, `in ${gap}`);
  }
  return pct(exposure);
}

/** « 3h40 », « 2h », « 34 min » — là où la place manque (pastille de carte). */
function compactGap(minutes: number): string {
  const min = Math.max(0, Math.round(minutes));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** « 16:00 » → « 16h », « 09:00 » → « 9h ». En anglais, « 16:00 », « 9:00 »
 *  (« 16h » ne se lit pas en anglais). */
function hourLabel(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (getLang() === 'en') return `${h}:${String(m).padStart(2, '0')}`;
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** La pastille de carte : ce qui distingue un lieu de ses voisins. En plein
 *  ciel ils partagent tous le même pourcentage ; pas la même durée. */
export function markerLabel(rec: Recommendation, mode: SunMode): string {
  // À l'ombre jusqu'au coucher, tous partagent la même durée ; la
  // profondeur de l'ombre, elle, varie d'un lieu à l'autre.
  if (mode === 'SHADE' && rec.lastsUntilSunset && rec.sunLeavesInMin !== null) {
    return pct(rec.shadePercentage);
  }
  if (rec.sunLeavesInMin !== null) {
    const gap = compactGap(rec.sunLeavesInMin);
    return mode === 'SUN' ? `☀ ${gap}` : gap;
  }
  if (rec.sunArrivesInMin !== null) {
    const at = hourLabel(rec.sunWindowStart);
    return rec.arrivesTomorrow ? tr(`demain ${at}`, `tmrw ${at}`) : tr(`dès ${at}`, `from ${at}`);
  }
  return pct(mode === 'SUN' ? rec.sunPercentage : rec.shadePercentage);
}

/** La rive où l'on est, pour l'en-tête. Même découpe que les grilles de
 *  relief (scripts/fetch-lisbon-terrain-30m.mjs) : sous le Tage, Caparica à
 *  l'ouest de -9.2, Almada à l'est. */
export function placeName(p: GeoPoint, inSentence = false): string {
  const south = p.lat < 38.6925 || (p.lng > -9.185 && p.lat < 38.7);
  if (!south) return tr('Lisbonne', 'Lisbon');
  if (p.lng >= -9.2) return 'Almada';
  // « Le soleil quitte la Costa da Caparica », pas « quitte Costa da Caparica ».
  // L'anglais n'a pas d'article : « The sun leaves Costa da Caparica ».
  return inSentence ? tr('la Costa da Caparica', 'Costa da Caparica') : 'Costa da Caparica';
}
