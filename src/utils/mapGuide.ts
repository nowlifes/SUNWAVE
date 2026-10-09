import type { GeoPoint, Recommendation, SunMode } from '@/types';
import { IN_IT_THRESHOLD } from '@/services/RecommendationService';
import { tr } from '@/utils/lang';

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
  if (visit === 1) {
    return mode === 'SUN'
      ? tr("Glisse l'heure pour voir le soleil bouger", 'Drag the time to watch the sun move')
      : tr("Glisse l'heure pour voir l'ombre bouger", 'Drag the time to watch the shade move');
  }
  if (visit === 2) return tr("Touche la carte n'importe où", 'Tap anywhere on the map');
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
  const { mode, count, nowMin, sunriseMin, sunsetMin } = ctx;
  const sun = mode === 'SUN';
  if (nowMin < sunriseMin || nowMin >= sunsetMin) {
    const rise = hhmm(sunriseMin);
    return [
      tr(`Nuit · le soleil revient à ${rise}`, `Night · the sun is back at ${rise}`),
      tr(`Le soleil est couché, retour à ${rise}`, `The sun has set, back at ${rise}`),
    ];
  }
  if (count === 0) {
    return sun
      ? [tr('Pas de soleil franc à pied', 'No full sun within walking distance'), tr("Rien au soleil tout près pour l'instant", 'Nothing in the sun close by right now')]
      : [tr("Pas d'ombre franche à pied", 'No real shade within walking distance'), tr("Rien à l'ombre tout près pour l'instant", 'Nothing in the shade close by right now')];
  }
  const lieux = count === 1 ? tr('1 lieu', '1 place') : tr(`${count} lieux`, `${count} places`);
  const dans = sun ? tr('au soleil', 'in the sun') : tr("à l'ombre", 'in the shade');
  const coins = sun
    ? tr(count === 1 ? '1 coin de soleil' : `${count} coins de soleil`, count === 1 ? '1 sunny spot' : `${count} sunny spots`)
    : tr(count === 1 ? "1 coin d'ombre" : `${count} coins d'ombre`, count === 1 ? '1 shaded spot' : `${count} shaded spots`);
  const base = [tr(`${lieux} ${dans} à pied`, `${lieux} ${dans} within walking distance`), tr(`${coins} autour de toi`, `${coins} around you`)];
  if (sun && sunsetMin - nowMin <= 90) {
    const set = hhmm(sunsetMin);
    return [tr(`Coucher à ${set} · ${lieux} ${dans}`, `Sunset at ${set} · ${lieux} ${dans}`), ...base];
  }
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
  if (w.state === 'night') return { lead: tr('Ici : nuit, soleil à', 'Here: night, sun back at'), time: hhmm(w.untilMin ?? 0) };
  const sunny = (w.state === 'in') === (mode === 'SUN');
  const what = sunny ? tr('soleil', 'sun') : tr('ombre', 'shade');
  if (w.untilMin === null) return { lead: tr(`Ici : ${what} jusqu'au coucher`, `Here: ${what} until sunset`), time: null };
  return { lead: tr(`Ici : ${what} jusqu'à`, `Here: ${what} until`), time: hhmm(w.untilMin) };
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
const MAX_PILL_CHARS = 16;
const DANGLING = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'o', 'a', 'of', 'the', '&', '-', '·']);

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

// --- Bande de lumière de la carte -------------------------------------------

/**
 * La journée du quartier, pour le curseur d'heure : quart par quart, la part
 * des lieux proches dans ce qu'on cherche. Rendue au format que `ribbonCells`
 * attend (du soleil, qu'il retourne lui-même en mode Ombre) pour réutiliser
 * la même bande que les fiches.
 */
export function cityLightCurve(curves: number[][], mode: SunMode): number[] {
  const threshold = IN_IT_THRESHOLD[mode];
  return Array.from({ length: 96 }, (_, q) => {
    if (curves.length === 0) return 0;
    const inIt = curves.filter((c) => (mode === 'SUN' ? c[q] ?? 0 : 100 - (c[q] ?? 0)) >= threshold).length;
    const share = Math.round((inIt / curves.length) * 100);
    return mode === 'SUN' ? share : 100 - share;
  });
}
