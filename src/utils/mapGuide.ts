import type { GeoPoint, Recommendation, SunMode } from '@/types';
import { IN_IT_THRESHOLD } from '@/services/RecommendationService';

// ---------------------------------------------------------------------------
// Ce que la carte dit, et quand. Logique pure : la carte s'explique en
// jouant (une astuce, deux visites, puis silence), son titre suit le contexte
// sans répéter la même accroche, et un toucher n'importe où répond « ici ».
// ---------------------------------------------------------------------------

/** 10 minutes à pied, à la vitesse de MapService.walkTimeMinutes (1,35 m/s). */
export const WALK_RING_M = Math.round(10 * 60 * 1.35);

const hhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`;

// --- Astuce d'usage --------------------------------------------------------

/** Le compteur de visites lu dans le stockage ; illisible = première visite. */
export function nextVisit(stored: string | null): number {
  const n = Number.parseInt(stored ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n + 1 : 1;
}

/** Une phrase par visite, deux visites, puis plus rien : on apprend le geste
 *  une fois, on ne le relit pas à chaque ouverture. */
export function hintForVisit(visit: number, mode: SunMode): string | null {
  if (visit === 1) return `Glisse l'heure pour voir ${mode === 'SUN' ? 'le soleil' : "l'ombre"} bouger`;
  if (visit === 2) return "Touche la carte n'importe où";
  return null;
}

// --- Titre de la feuille ----------------------------------------------------

export interface HeadlineContext {
  mode: SunMode;
  /** Lieux dans ce qu'on cherche, à portée de pied. */
  count: number;
  nowMin: number;
  sunriseMin: number;
  sunsetMin: number;
  /** L'heure affichée est maintenant (et pas une heure glissée). */
  isNow: boolean;
}

/** Les accroches possibles, la plus juste d'abord. Toujours deux au moins :
 *  `pickHeadline` doit pouvoir éviter de redire la même. */
export function sheetHeadlines(ctx: HeadlineContext): string[] {
  const { mode, count, nowMin, sunriseMin, sunsetMin, isNow } = ctx;
  const sun = mode === 'SUN';
  if (nowMin < sunriseMin || nowMin >= sunsetMin) {
    return [`Nuit · le soleil revient à ${hhmm(sunriseMin)}`, `Le soleil est couché, retour à ${hhmm(sunriseMin)}`];
  }
  if (count === 0) {
    return sun
      ? ['Pas de soleil franc à pied', "Rien au soleil tout près pour l'instant"]
      : ["Pas d'ombre franche à pied", "Rien à l'ombre tout près pour l'instant"];
  }
  const lieux = count === 1 ? '1 lieu' : `${count} lieux`;
  const coins = count === 1 ? '1 coin' : `${count} coins`;
  const dans = sun ? 'au soleil' : "à l'ombre";
  const base = [`${lieux} ${dans} à pied`, `${coins} ${sun ? 'de soleil' : "d'ombre"} autour de toi`];
  if (!isNow) return [`À ${hhmm(nowMin)}, ${lieux} ${dans}`, ...base];
  if (sun && sunsetMin - nowMin <= 90) return [`Coucher à ${hhmm(sunsetMin)} · ${lieux} ${dans}`, ...base];
  return base;
}

/** La plus juste, sauf si c'est celle qu'on vient de lire. */
export function pickHeadline(candidates: string[], previous: string | null): string {
  return candidates.find((c) => c !== previous) ?? candidates[0];
}

// --- « Ici » : l'endroit touché ----------------------------------------------

export interface HereWindow {
  /** `in` : dans ce qu'on cherche (soleil en mode Soleil, ombre en mode Ombre). */
  state: 'in' | 'out' | 'night';
  /** in : quand ça s'arrête · out : quand ça arrive (null = pas avant le
   *  coucher) · night : le lever. */
  untilMin: number | null;
}

/** Même lecture au quart d'heure que la fenêtre des lieux
 *  (RecommendationService.computeSunWindow), pour un point quelconque. */
export function hereWindow(
  sunByQuarter: number[],
  mode: SunMode,
  nowMin: number,
  sunriseMin: number,
  sunsetMin: number
): HereWindow {
  if (nowMin < sunriseMin || nowMin >= sunsetMin) return { state: 'night', untilMin: sunriseMin };
  const threshold = IN_IT_THRESHOLD[mode];
  const exposure = (q: number) => (mode === 'SUN' ? sunByQuarter[q] ?? 0 : 100 - (sunByQuarter[q] ?? 0));
  const qualifies = (q: number) => q * 15 < sunsetMin && exposure(q) >= threshold;
  const nowQ = Math.floor(nowMin / 15);

  if (qualifies(nowQ)) {
    let q = nowQ;
    while (q + 1 < 96 && qualifies(q + 1)) q++;
    return { state: 'in', untilMin: Math.min((q + 1) * 15, sunsetMin) };
  }
  for (let q = nowQ + 1; q < 96 && q * 15 < sunsetMin; q++) {
    if (qualifies(q)) return { state: 'out', untilMin: q * 15 };
  }
  return { state: 'out', untilMin: null };
}

/** La bulle : une phrase et une heure (l'heure en chasse fixe, à part). */
export function hereSentence(w: HereWindow, mode: SunMode): { lead: string; time: string | null } {
  if (w.state === 'night') return { lead: 'Ici : nuit, soleil à', time: hhmm(w.untilMin ?? 0) };
  const what = (w.state === 'in') === (mode === 'SUN') ? 'soleil' : 'ombre';
  if (w.untilMin === null) return { lead: `Ici : ${what} jusqu'au coucher`, time: null };
  return { lead: `Ici : ${what} jusqu'à`, time: hhmm(w.untilMin) };
}

/** Au moins une demi-heure de mieux, sinon le détour ne vaut pas la peine. */
const WORTH_THE_WALK_MIN = 30;

/**
 * Le lieu voisin qui garde ce qu'on cherche plus longtemps qu'ici. `recs`
 * doivent être évaluées depuis le point touché (walkTimeMin compté de là).
 */
export function betterNeighbour(
  recs: Recommendation[],
  here: HereWindow,
  nowMin: number,
  maxWalkMin = 10
): Recommendation | null {
  if (here.state === 'night') return null;
  let best: Recommendation | null = null;
  let bestEnd = -1;
  for (const r of recs) {
    if (!r.isOpen || r.sunLeavesInMin === null || r.walkTimeMin > maxWalkMin) continue;
    const end = nowMin + r.sunLeavesInMin;
    if (here.state === 'in' && here.untilMin !== null && end < here.untilMin + WORTH_THE_WALK_MIN) continue;
    if (end > bestEnd || (end === bestEnd && best && r.walkTimeMin < best.walkTimeMin)) {
      best = r;
      bestEnd = end;
    }
  }
  return best;
}

// --- Cadrage initial ---------------------------------------------------------

const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

/**
 * Le cadre d'arrivée : l'anneau de 10 min à pied autour de soi, élargi
 * jusqu'aux `minCount` lieux les plus proches quand l'anneau en compte moins
 * (une carte vide n'explique rien). [[ouest, sud], [est, nord]].
 */
export function initialFrame(center: GeoPoint, points: GeoPoint[], minCount: number): [[number, number], [number, number]] {
  const dLat = WALK_RING_M / M_PER_DEG_LAT;
  const dLng = WALK_RING_M / mPerDegLng(center.lat);
  let w = center.lng - dLng;
  let e = center.lng + dLng;
  let s = center.lat - dLat;
  let n = center.lat + dLat;

  const dist = (p: GeoPoint) =>
    Math.hypot((p.lat - center.lat) * M_PER_DEG_LAT, (p.lng - center.lng) * mPerDegLng(center.lat));
  const inside = points.filter((p) => dist(p) <= WALK_RING_M).length;
  if (inside < minCount) {
    for (const p of [...points].sort((a, b) => dist(a) - dist(b)).slice(0, minCount)) {
      w = Math.min(w, p.lng);
      e = Math.max(e, p.lng);
      s = Math.min(s, p.lat);
      n = Math.max(n, p.lat);
    }
  }
  return [[w, s], [e, n]];
}

// --- Pastilles -----------------------------------------------------------------

const TYPE_PREFIX = /^(miradouro|jardim|largo|praça|praca|parque|terraço|terraco|esplanada|quiosque)\s+(d[aeo]s?\s+)?/i;
const MAX_PILL_CHARS = 14;
const DANGLING = new Set(['de', 'da', 'do', 'das', 'dos', 'e', '&', '-', '·']);

/** « Miradouro de Santa Catarina » → « Santa Catarina » : la pastille dit
 *  où, la carte montre déjà que c'est un belvédère. */
export function shortVenueName(name: string): string {
  const stripped = name.replace(TYPE_PREFIX, '').trim() || name;
  if (stripped.length <= MAX_PILL_CHARS) return stripped;
  const words = stripped.split(/\s+/);
  const kept: string[] = [];
  for (const word of words) {
    if ([...kept, word].join(' ').length > MAX_PILL_CHARS) break;
    kept.push(word);
  }
  while (kept.length > 1 && DANGLING.has(kept[kept.length - 1].toLowerCase())) kept.pop();
  return kept.length > 0 ? kept.join(' ') : `${stripped.slice(0, MAX_PILL_CHARS - 1)}…`;
}

/** Nom et heure de fin quand le lieu est dans ce qu'on cherche ; le nom seul
 *  sinon — une pastille discrète, pas une étiquette pleine. */
export function pillLabel(rec: Recommendation): { name: string; time: string | null; inIt: boolean } {
  const inIt = rec.sunLeavesInMin !== null;
  return { name: shortVenueName(rec.venue.name), time: inIt ? rec.sunWindowEnd : null, inIt };
}
