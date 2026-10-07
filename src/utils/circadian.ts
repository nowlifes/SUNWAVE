import type { SunMode } from '@/types';
import { SunService } from '@/services/SunService';

// ---------------------------------------------------------------------------
// Le cycle circadien : la couleur de l'écran suit le vrai soleil de Lisbonne.
//
// Mode Soleil (« la feuille suit le ciel ») : rose à l'aube, abricot le matin,
// paille à midi, miel l'après-midi. L'orange plein n'arrive qu'à l'heure dorée
// — il devient un moment, plus un fond permanent. Puis la nuit.
//
// Mode Ombre (« le ciel en fond ») : un dégradé de ciel réel derrière une
// carte crème.
//
// Dans les deux, l'ombre portée des éléments en relief (sticker, bouton, carte)
// tombe du côté opposé au soleil et s'allonge quand il descend.
//
// Les heures clés sont relatives au lever et au coucher du jour : la palette
// reste juste en décembre comme en juin. Maquette validée le 2026-10-06.
// ---------------------------------------------------------------------------

/** Désactivable pour comparer avec l'ancienne DA : `?sanscycle`. */
export const CYCLE = !(typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('sanscycle'));

export interface Circadian {
  /** Fond de la feuille en mode Soleil. */
  sheet: string;
  /** Fond sous une carte crème (fiche, Explorer, Favoris) : la teinte de
   *  l'heure, assez profonde pour que la carte se détache. */
  deep: string;
  /** Ciel du mode Ombre, haut puis bas. */
  sky: [string, string];
  /** Couleur du texte posé en haut du fond du mode courant. */
  fg: 'ink' | 'cream';
  /** Idem en bas de l'écran : le ciel du soir est sombre en haut, pêche en bas. */
  fgLow: 'ink' | 'cream';
  /** Le texte unique d'une feuille courte posée en bas (carte) sur tout le
   *  dégradé du ciel : celui qui tient le mieux aux deux bouts. */
  fgMid: 'ink' | 'cream';
  /** Le ciel de cette feuille, haut puis bas : `sky`, ou en aplat le bout qui
   *  porte `fgMid` quand l'autre ne le porte pas. Identique à `sky` le plus souvent. */
  skySheet: [string, string];
  /** La carte : un voile de l'heure posé sur le fond, l'eau, les ombres, la lumière. */
  map: { tint: string; tintOpacity: number; water: string; shadow: string; sun: string };
  /** Décalage de l'ombre portée, en px ; null quand le soleil est couché. */
  shadow: { x: number; y: number } | null;
}

type Key<T> = [minutes: number, value: T];

// Les 6 nuanciers de la maquette validée (2026-10-06), au hex près. Rien
// d'autre : pas de corail, pas de mauve, pas de marron.
export const NUANCIERS = {
  aube: '#C894A9',
  matin: '#FFCB88',
  midi: '#FFDF73',
  apresMidi: '#FFB54D',
  doree: '#FB7341',
  nuit: '#1E2A66',
} as const;

// Fondu seulement entre teintes chaudes voisines (matin → dorée) : le mélange
// reste dans la famille jaune-orange. Partout ailleurs, bascule nette — un
// fondu nuit ↔ aube ou dorée → nuit invente du violet ou du marron.
const SUN_KEYS = (sr: number, noon: number, ss: number): Key<string>[] => {
  const N = NUANCIERS;
  return [
    [sr - 30, N.nuit],
    [sr - 30, N.aube],
    [sr + 20, N.aube],
    [sr + 20, N.matin],
    [sr + 120, N.matin],
    [noon, N.midi],
    [ss - 130, N.apresMidi],
    [ss - 35, N.doree],
    [ss + 45, N.doree],
    [ss + 45, N.nuit],
  ];
};

const SKY_KEYS = (sr: number, noon: number, ss: number): Key<[string, string]>[] => [
  [sr - 60, ['#0E1640', '#26306E']],
  [sr - 10, ['#3D4F9E', '#F2A7A0']],
  [sr + 90, ['#8FC1F5', '#FFE3C2']],
  [noon, ['#5EA4F2', '#CFE6FF']],
  [ss - 50, ['#6F8FD8', '#FFB46A']],
  [ss, ['#43458F', '#F4766A']],
  [ss + 35, ['#22285E', '#8A62C2']],
  [ss + 75, ['#0E1640', '#26306E']],
];

// La carte : le voile des nuanciers, quasi nul à midi (la carte claire
// validée), plus épais à l'heure dorée, bleu nuit la nuit.
const TINT_KEYS = (sr: number, noon: number, ss: number): Key<string>[] => {
  // Le voile prend les nuanciers validés, avec les mêmes bascules que la
  // feuille ; la nuit, un bleu plus profond que la feuille pour la carte.
  const N = NUANCIERS;
  return [
    [sr - 30, '#141C4A'],
    [sr - 30, N.aube],
    [sr + 20, N.aube],
    [sr + 20, N.matin],
    [sr + 120, N.matin],
    [noon, N.midi],
    [ss - 130, N.apresMidi],
    [ss - 35, N.doree],
    [ss + 45, N.doree],
    [ss + 45, '#141C4A'],
  ];
};
const TINT_OPACITY = (sr: number, noon: number, ss: number): [number, number][] => [
  [sr - 60, 0.6], [sr - 10, 0.35], [sr + 30, 0.14], [sr + 120, 0.05], [noon, 0],
  [ss - 120, 0.05], [ss - 50, 0.16], [ss, 0.22], [ss + 30, 0.38], [ss + 75, 0.6],
];
const WATER_KEYS = (sr: number, noon: number, ss: number): Key<string>[] => [
  [sr - 60, '#26306E'], [sr + 30, '#9AA6DA'], [noon, '#8EA6E0'], [ss - 50, '#9D9BD8'], [ss, '#8A7BC8'], [ss + 75, '#26306E'],
];
const SHADOW_KEYS = (sr: number, noon: number, ss: number): Key<string>[] => [
  [sr, '#B9B2DE'], [sr + 120, '#AEBDE3'], [noon, '#AEBDE3'], [ss - 120, '#AEBDE3'], [ss - 30, '#B3A6D9'], [ss, '#A99AD2'],
];
const LIGHT_KEYS = (sr: number, noon: number, ss: number): Key<string>[] => [
  [sr, '#FFC9B0'], [sr + 120, '#FFD9A8'], [noon, '#FFD28A'], [ss - 120, '#FFC870'], [ss - 40, '#FFA552'], [ss, '#FF8A5C'],
];

function alongNum(keys: [number, number][], m: number): number {
  if (m <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (m <= keys[i][0]) {
      const [m0, v0] = keys[i - 1];
      const [m1, v1] = keys[i];
      return v0 + (v1 - v0) * ((m - m0) / (m1 - m0));
    }
  }
  return keys[keys.length - 1][1];
}

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a: string, b: string, t: number) => {
  const ca = rgb(a);
  const cb = rgb(b);
  return hex(ca.map((v, i) => v + (cb[i] - v) * t));
};

/** Deux clés à la même minute font une bascule nette, sans fondu. */
function along<T extends string | [string, string]>(keys: Key<T>[], m: number): T {
  if (m <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (m <= keys[i][0]) {
      const [m0, c0] = keys[i - 1];
      const [m1, c1] = keys[i];
      const t = (m - m0) / (m1 - m0);
      return (Array.isArray(c0) ? [mix(c0[0], (c1 as string[])[0], t), mix(c0[1], (c1 as string[])[1], t)] : mix(c0 as string, c1 as string, t)) as T;
    }
  }
  return keys[keys.length - 1][1];
}

/** Luminance relative WCAG. */
export function luminance(h: string): number {
  const [r, g, b] = rgb(h).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const INK_LUM = luminance('#0B1A45');
const CREAM_LUM = luminance('#FFF1D6');
const hsl = (h: string): [number, number, number] => {
  const [r, g, b] = rgb(h).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const sat = d / (1 - Math.abs(2 * l - 1));
  const x = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(x * 60 + 360) % 360, sat, l];
};
const fromHsl = (hh: number, sat: number, l: number) => {
  const c = (1 - Math.abs(2 * l - 1)) * sat;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] = hh < 60 ? [c, x, 0] : hh < 120 ? [x, c, 0] : hh < 180 ? [0, c, x] : hh < 240 ? [0, x, c] : hh < 300 ? [x, 0, c] : [c, 0, x];
  return hex([r, g, b].map((v) => (v + m) * 255));
};

/** Fond sous une carte crème : la couleur validée elle-même, foncée juste
 *  assez (même teinte, même saturation) pour un ratio de 1.4 contre le crème.
 *  Un pastel noyait la carte ; une palette inventée trahissait le cycle. */
const DEEP_RATIO = 1.4;
function deepen(h: string): string {
  const [hh, sat, l0] = hsl(h);
  let out = h;
  for (let l = l0; l > 0 && (CREAM_LUM + 0.05) / (luminance(out) + 0.05) < DEEP_RATIO; l -= 0.005) out = fromHsl(hh, sat, l);
  return out;
}

/** Encre ou crème : celui qui contraste le plus avec le fond (ratio WCAG). */
export function textOn(bg: string): 'ink' | 'cream' {
  return ratioOn('ink', bg) >= ratioOn('cream', bg) ? 'ink' : 'cream';
}

function ratioOn(text: 'ink' | 'cream', bg: string): number {
  const l = luminance(bg);
  return text === 'ink' ? (l + 0.05) / (INK_LUM + 0.05) : (CREAM_LUM + 0.05) / (l + 0.05);
}

/** Le fond poussé juste assez (même teinte, même saturation) pour que `text`
 *  y tienne 4.5 : plus sombre sous le crème, plus clair sous l'encre. Au
 *  crépuscule, ni l'un ni l'autre n'y arrivait sur le ciel brut.
 *
 *  Le texte secondaire (`--b-soft`, `--sub`) pose le même `text` en 74-86 %
 *  d'opacité, jamais en aplat : un fond qui tient juste 4.5 en aplat retombe
 *  sous 4.5 une fois le texte éclairci par la transparence. On pousse donc le
 *  fond pour que la version la plus faible (encre 86 %, crème 74 %, la pire
 *  des deux) tienne déjà 4.5 ; l'aplat n'en tient alors que davantage. */
const TEXT_RATIO = 4.5;
const SOFT_ALPHA: Record<'ink' | 'cream', number> = { ink: 0.86, cream: 0.74 };
function softRatio(bg: string, text: 'ink' | 'cream'): number {
  const blended = mix(bg, text === 'ink' ? '#0B1A45' : '#FFF1D6', SOFT_ALPHA[text]);
  const l1 = luminance(blended);
  const l2 = luminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
// Marge au-delà de 4.5 : `fromHsl` arrondit chaque canal à l'entier le plus
// proche (hex), ce qui peut faire retomber sous la cible le pas où on
// s'arrête ; la marge absorbe cet arrondi.
const ROUNDING_MARGIN = 0.05;
function legibleFor(bg: string, text: 'ink' | 'cream'): string {
  const [hh, sat, l0] = hsl(bg);
  const step = text === 'cream' ? -0.005 : 0.005;
  let out = bg;
  for (let l = l0; l > 0 && l < 1 && softRatio(out, text) < TEXT_RATIO + ROUNDING_MARGIN; ) {
    l += step;
    out = fromHsl(hh, sat, l);
  }
  return out;
}

/** Le ciel en strates, du haut vers l'horizon : le ciel de la fiche d'un lieu.
 *  Identique dans les deux modes — c'est le ciel du lieu, pas un fond d'écran. */
export function skyBands(c: Circadian, n: number): string[] {
  return Array.from({ length: n }, (_, i) => mix(c.sky[0], c.sky[1], n === 1 ? 1 : i / (n - 1)));
}

export type VenueLight = 'sun' | 'shade' | 'night';

/** Le liseré d'une carte de lieu (Explorer, Favoris) : la lumière propre au
 *  lieu. `c` est le cycle du mode Soleil — c'est la lumière du lieu, pas le
 *  mode de l'écran. */
export function cardLight(c: Circadian, light: VenueLight): string {
  if (light === 'sun') return c.deep;
  if (light === 'shade') return '#2E6FF2';
  return '#1E2A66';
}

/** Les barres (navigateur et onglets) prolongent le fond de l'écran : la
 *  feuille en Soleil, le fond profond sous des cartes crème (Explorer,
 *  Favoris), le haut du ciel en Ombre (`deep` vaut alors `sky[0]`). */
export function barTint(c: Circadian, mode: SunMode, underCards: boolean): string {
  return mode === 'SUN' && !underCards ? c.sheet : c.deep;
}

export function circadian(date: Date, mode: SunMode): Circadian {
  const t = date.getTime();
  const min = (d: Date) => (d.getTime() - t) / 60000;
  // Minutes relatives à « maintenant » : 0 est l'instant demandé.
  const sr = min(SunService.getSunrise(date));
  const ss = min(SunService.getSunset(date));
  const noon = (sr + ss) / 2;

  const sheet = along(SUN_KEYS(sr, noon, ss), 0);
  const rawSky = along(SKY_KEYS(sr, noon, ss), 0);
  const fgTop = textOn(rawSky[0]);
  const fgBot = textOn(rawSky[1]);
  const sky: [string, string] = [legibleFor(rawSky[0], fgTop), legibleFor(rawSky[1], fgBot)];
  // La feuille de la carte : un seul texte sur tout le dégradé.
  const minOn = (t: 'ink' | 'cream') => Math.min(ratioOn(t, sky[0]), ratioOn(t, sky[1]));
  const fgSheet = minOn('ink') >= minOn('cream') ? 'ink' : 'cream';
  // Un bout qui ne porte pas ce texte prend la couleur de l'autre : la feuille
  // passe en aplat. Foncer la pêche de l'aube donnait du rouge brique, la
  // mêler au bleu du violet — deux teintes hors palette.
  const holds = (c: string) => ratioOn(fgSheet, c) >= TEXT_RATIO;
  const skySheet: [string, string] =
    holds(sky[0]) && holds(sky[1]) ? sky : holds(sky[0]) ? [sky[0], sky[0]] : [sky[1], sky[1]];

  const { elevation, azimuth } = SunService.getSunPosition(date);
  let shadow: Circadian['shadow'] = null;
  if (elevation > 0) {
    // On regarde l'écran face au sud : le soleil à l'est (matin) éclaire par
    // la gauche, l'ombre part à droite ; à l'ouest (soir), l'inverse.
    const len = Math.min(12, Math.max(3, 3 / Math.tan((Math.max(4, elevation) * Math.PI) / 180)));
    shadow = {
      x: Math.round(Math.sin((azimuth * Math.PI) / 180) * len * 10) / 10,
      y: Math.round((len * 0.55 + 2) * 10) / 10,
    };
  }

  const fg = mode === 'SUN' ? textOn(sheet) : fgTop;
  const map = {
    tint: along(TINT_KEYS(sr, noon, ss), 0),
    tintOpacity: Math.round(alongNum(TINT_OPACITY(sr, noon, ss), 0) * 100) / 100,
    water: along(WATER_KEYS(sr, noon, ss), 0),
    shadow: along(SHADOW_KEYS(sr, noon, ss), 0),
    sun: along(LIGHT_KEYS(sr, noon, ss), 0),
  };
  return {
    sheet,
    // En Ombre, le haut du ciel : le bleu franc derrière la carte crème.
    deep: mode === 'SUN' ? deepen(sheet) : sky[0],
    sky,
    fg,
    fgLow: mode === 'SUN' ? fg : fgBot,
    fgMid: mode === 'SUN' ? fg : fgSheet,
    skySheet,
    map,
    shadow,
  };
}

/** La couleur d'une heure de la journée : la feuille du mode Soleil, le haut
 *  du ciel en Ombre. La même source que le fond : une bande d'heures (curseur
 *  de la carte, frise d'un lieu) se colore comme la journée elle-même. */
export function hourTint(date: Date, mode: SunMode): string {
  const c = circadian(date, mode);
  return mode === 'SUN' ? c.sheet : c.sky[0];
}

/** Ce qu'une heure à l'ombre voile de la couleur de l'heure (crème). */
const VEIL = 'rgba(255, 241, 214, .62)';
const HALF = 'rgba(255, 241, 214, .34)';
/** En Ombre, une heure où le soleil tape : du sable, pas d'orange. */
export const SAND = '#E2CFA6';

/** Le fond d'une case d'heure. `sun` : part de soleil du lieu (0-100), `null`
 *  la nuit. Le bon moment (soleil en Soleil, ombre en Ombre) garde la couleur
 *  pleine de l'heure ; un peu, à moitié voilée ; le reste voilé en Soleil,
 *  sable en Ombre. Mêmes seuils que la fiche : 15 et 40 %. */
export function hourCell(date: Date, mode: SunMode, sun: number | null): { background: string; good: boolean } {
  const tint = hourTint(date, mode);
  if (sun === null) return { background: tint, good: false };
  const veil = (v: string) => `linear-gradient(${v}, ${v}), ${tint}`;
  if (mode === 'SUN') {
    if (sun >= 40) return { background: tint, good: true };
    return { background: veil(sun >= 15 ? HALF : VEIL), good: false };
  }
  if (sun < 15) return { background: tint, good: true };
  return { background: sun < 40 ? veil(HALF) : SAND, good: false };
}
