import type { SunMode } from '@/types';
import { SunService } from '@/services/SunService';

// ---------------------------------------------------------------------------
// Le cycle circadien : la couleur de l'écran suit le vrai soleil de Lisbonne.
//
// Mode Soleil (« la feuille suit le ciel ») : rose à l'aube, abricot le matin,
// paille à midi, miel l'après-midi. L'orange plein n'arrive qu'à l'heure dorée
// — il devient un moment, plus un fond permanent. Puis corail, mauve, nuit.
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
  /** Ciel du mode Ombre, haut puis bas. */
  sky: [string, string];
  /** Couleur du texte posé en haut du fond du mode courant. */
  fg: 'ink' | 'cream';
  /** Idem en bas de l'écran : le ciel du soir est sombre en haut, pêche en bas. */
  fgLow: 'ink' | 'cream';
  /** Décalage de l'ombre portée, en px ; null quand le soleil est couché. */
  shadow: { x: number; y: number } | null;
}

type Key<T> = [minutes: number, value: T];

const SUN_KEYS = (sr: number, noon: number, ss: number): Key<string>[] => [
  [sr - 60, '#1E2A66'],
  [sr - 20, '#5A6FC0'],
  [sr + 15, '#F4A3A0'],
  [sr + 100, '#FFC98A'],
  [noon, '#FFDF73'],
  [ss - 130, '#FFB54D'],
  [ss - 50, '#FF7A35'],
  [ss, '#F2645E'],
  [ss + 30, '#8E63C9'],
  [ss + 75, '#1E2A66'],
];

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

const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a: string, b: string, t: number) => {
  const ca = rgb(a);
  const cb = rgb(b);
  return hex(ca.map((v, i) => v + (cb[i] - v) * t));
};

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
/** Encre ou crème : celui qui contraste le plus avec le fond (ratio WCAG). */
function textOn(bg: string): 'ink' | 'cream' {
  const l = luminance(bg);
  return (l + 0.05) / (INK_LUM + 0.05) >= (CREAM_LUM + 0.05) / (l + 0.05) ? 'ink' : 'cream';
}

export function circadian(date: Date, mode: SunMode): Circadian {
  const t = date.getTime();
  const min = (d: Date) => (d.getTime() - t) / 60000;
  // Minutes relatives à « maintenant » : 0 est l'instant demandé.
  const sr = min(SunService.getSunrise(date));
  const ss = min(SunService.getSunset(date));
  const noon = (sr + ss) / 2;

  const sheet = along(SUN_KEYS(sr, noon, ss), 0);
  const sky = along(SKY_KEYS(sr, noon, ss), 0);

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

  const fg = textOn(mode === 'SUN' ? sheet : sky[0]);
  return { sheet, sky, fg, fgLow: mode === 'SUN' ? fg : textOn(sky[1]), shadow };
}
