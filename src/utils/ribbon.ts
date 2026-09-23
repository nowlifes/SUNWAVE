import type { SunMode } from '@/types';

// ---------------------------------------------------------------------------
// La bande de lumière : la journée d'un lieu en 30 cases d'une demi-heure,
// de 06:00 à 21:00. Chaque case vaut ce qu'on cherche (le soleil, ou
// l'ombre) ; `null` quand le soleil est couché — la nuit n'est ni l'un ni
// l'autre, et la compter comme de l'ombre ferait mentir le mode Ombre.
// ---------------------------------------------------------------------------

export const RIBBON_START_MIN = 6 * 60;
export const RIBBON_END_MIN = 21 * 60;
const CELL_MIN = 30;

export interface RibbonCell {
  startMin: number;
  value: number | null;
}

export function ribbonCells(
  sunByQuarter: number[],
  mode: SunMode,
  sunriseMin: number,
  sunsetMin: number
): RibbonCell[] {
  const cells: RibbonCell[] = [];
  for (let start = RIBBON_START_MIN; start < RIBBON_END_MIN; start += CELL_MIN) {
    const middle = start + CELL_MIN / 2;
    if (middle < sunriseMin || middle > sunsetMin) {
      cells.push({ startMin: start, value: null });
      continue;
    }
    const q = start / 15;
    const sun = ((sunByQuarter[q] ?? 0) + (sunByQuarter[q + 1] ?? 0)) / 2;
    cells.push({ startMin: start, value: Math.round(mode === 'SUN' ? sun : 100 - sun) });
  }
  return cells;
}
