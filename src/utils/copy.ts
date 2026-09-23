import type { Recommendation, SunMode } from '@/types';

// ---------------------------------------------------------------------------
// Les phrases que l'app dit sur un lieu — une seule source.
//
// Chaque écran recomposait les siennes à partir de champs différents : la
// fiche détail affichait « Sunny for 5H » là où l'accueil disait « Perd le
// soleil dans 4h 30m » pour le même lieu à la même minute. Un chiffre qui
// change d'un écran à l'autre, c'est un chiffre auquel on ne croit plus.
// ---------------------------------------------------------------------------

const CATEGORY_LABEL: Record<string, string> = {
  rooftop: 'Rooftop',
  terrace: 'Terrasse',
  miradouro: 'Belvédère',
  viewpoint: 'Belvédère',
  park: 'Parc',
  beach: 'Plage',
  square: 'Place',
  cafe: 'Café',
  bar: 'Bar',
  restaurant: 'Restaurant',
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
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
export function statusCopy(rec: Recommendation, mode: SunMode): StatusCopy {
  const isSun = mode === 'SUN';
  const exposure = isSun ? rec.sunPercentage : rec.shadePercentage;
  const le = isSun ? 'le soleil' : "l'ombre";
  const de = isSun ? 'de soleil' : "d'ombre";

  if (rec.sunLeavesInMin !== null && rec.lastsUntilSunset) {
    return {
      title: "À l'ombre jusqu'au coucher du soleil",
      detail: `${exposure} % ${de} maintenant · encore ${formatGap(rec.sunLeavesInMin)}`,
    };
  }
  if (rec.sunLeavesInMin !== null) {
    return {
      title: `Perd ${le} dans ${formatGap(rec.sunLeavesInMin)}`,
      detail: `${exposure} % ${de} maintenant${rec.sunWindowEnd ? ` · jusqu'à ${rec.sunWindowEnd}` : ''}`,
    };
  }
  if (rec.sunArrivesInMin !== null && rec.arrivesTomorrow) {
    return { title: `Soleil demain dès ${rec.sunWindowStart}`, detail: `Dans ${formatGap(rec.sunArrivesInMin)}` };
  }
  if (rec.sunArrivesInMin !== null) {
    return {
      title: `${isSun ? 'Le soleil arrive' : "L'ombre arrive"} dans ${formatGap(rec.sunArrivesInMin)}`,
      detail: `${rec.sunWindowStart ? `À partir de ${rec.sunWindowStart}` : 'Plus tard'} · ${exposure} % maintenant`,
    };
  }
  return {
    title: `${exposure} % ${de} maintenant`,
    detail: isSun ? "Pas de soleil franc d'ici ce soir" : "Pas d'ombre franche d'ici le coucher",
  };
}

/** Version courte, pour une ligne de liste. */
export function statusShort(rec: Recommendation, mode: SunMode): string {
  const exposure = mode === 'SUN' ? rec.sunPercentage : rec.shadePercentage;
  if (rec.sunLeavesInMin !== null) {
    return rec.lastsUntilSunset ? "jusqu'au coucher" : `encore ${formatGap(rec.sunLeavesInMin)}`;
  }
  if (rec.sunArrivesInMin !== null) {
    return rec.arrivesTomorrow ? `demain dès ${rec.sunWindowStart}` : `dans ${formatGap(rec.sunArrivesInMin)}`;
  }
  return `${exposure} %`;
}

/** « 3h40 », « 2h », « 34 min » — là où la place manque (pastille de carte). */
function compactGap(minutes: number): string {
  const min = Math.max(0, Math.round(minutes));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** « 16:00 » → « 16h », « 09:00 » → « 9h ». */
function hourLabel(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

/** La pastille de carte : ce qui distingue un lieu de ses voisins. En plein
 *  ciel ils partagent tous le même pourcentage ; pas la même durée. */
export function markerLabel(rec: Recommendation, mode: SunMode): string {
  if (rec.sunLeavesInMin !== null) {
    const gap = compactGap(rec.sunLeavesInMin);
    return mode === 'SUN' ? `☀ ${gap}` : gap;
  }
  if (rec.sunArrivesInMin !== null) {
    return rec.arrivesTomorrow ? `demain ${hourLabel(rec.sunWindowStart)}` : `dès ${hourLabel(rec.sunWindowStart)}`;
  }
  return `${mode === 'SUN' ? rec.sunPercentage : rec.shadePercentage} %`;
}
