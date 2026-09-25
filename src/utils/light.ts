// ---------------------------------------------------------------------------
// « La ville révélée par la lumière » : le sol éclairé prend la couleur de
// l'heure — crème froide le matin, or, puis ambre et braise. La lumière est la
// seule couleur ; elle s'éteint en fondu quand le soleil touche l'horizon.
// ---------------------------------------------------------------------------

type Rgb = [number, number, number];
/** [minute du jour à Lisbonne, couleur, opacité pleine soleil]. */
const KEYS: [number, Rgb, number][] = [
  [450, [255, 196, 140], 0.55],
  [570, [255, 214, 164], 0.8],
  [780, [255, 218, 156], 0.9],
  [930, [255, 204, 132], 0.92],
  [1000, [255, 178, 90], 0.94],
  [1080, [255, 146, 64], 0.92],
  [1130, [255, 116, 44], 0.86],
  [1165, [240, 96, 40], 0.5],
];

/** Au-delà de cette hauteur (°) la lumière est à pleine intensité. */
const FULL_ALT = 7;

export function lightAt(minutes: number): { rgb: Rgb; alpha: number; css: string } {
  const first = KEYS[0];
  const last = KEYS[KEYS.length - 1];
  let a = first;
  let b = last;
  if (minutes <= first[0]) b = first;
  else if (minutes >= last[0]) a = last;
  else {
    for (let i = 0; i < KEYS.length - 1; i++) {
      if (minutes >= KEYS[i][0] && minutes <= KEYS[i + 1][0]) {
        a = KEYS[i];
        b = KEYS[i + 1];
        break;
      }
    }
  }
  const f = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (minutes - a[0]) / (b[0] - a[0])));
  const rgb = a[1].map((v, i) => Math.round(v + f * (b[1][i] - v))) as Rgb;
  return { rgb, alpha: a[2] + f * (b[2] - a[2]), css: `rgb(${rgb.join(',')})` };
}

/** Opacité de la lumière sur le sol : nulle soleil couché, pleine dès 7°. */
export function lightOpacity(sunElevationDeg: number, minutes: number): number {
  const up = Math.max(0, Math.min(1, sunElevationDeg / FULL_ALT));
  return lightAt(minutes).alpha * up;
}

/** Peinture MapLibre du calque de lumière. */
export function lightPaint(sunElevationDeg: number, minutes: number): { color: string; opacity: number } {
  return { color: lightAt(minutes).css, opacity: lightOpacity(sunElevationDeg, minutes) };
}
