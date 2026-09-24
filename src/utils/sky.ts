// ---------------------------------------------------------------------------
// Le ciel de l'écran d'accueil : des strates nettes du même bleu, qui suivent
// la hauteur du soleil, et le soleil posé sur sa course. Un coup d'œil dit
// l'heure qu'il est dans la journée du soleil, avant même de lire un chiffre.
// ---------------------------------------------------------------------------

export interface SkyPalette {
  /** Du zénith à l'horizon : cinq strates. */
  bands: [string, string, string, string, string];
  top: string;
}

const palette = (bands: SkyPalette['bands']): SkyPalette => ({ bands, top: bands[0] });

// Paliers de hauteur du soleil, en degrés : sous −6° c'est la nuit civile,
// entre −6° et 0° le crépuscule, jusqu'à 10° l'heure dorée. Seule la strate
// de l'horizon prend la lumière (or, puis pâle) : la lumière, pas un décor.
const NIGHT = palette(['#071233', '#08143A', '#0B1A45', '#122457', '#1A2F69']);
const TWILIGHT = palette(['#122457', '#1A2F69', '#233B7C', '#3A55A6', '#FFAA57']);
const GOLDEN = palette(['#1A2F69', '#3A55A6', '#6F86C6', '#AEBDE3', '#FFD28A']);
const DAY = palette(['#22398A', '#3A55A6', '#6F86C6', '#AEBDE3', '#DCE3F4']);
/** Mode Ombre : l'écran est de nuit, le ciel aussi, quelle que soit l'heure. */
export const SHADE_SKY = palette(['#08143A', '#0B1A45', '#122457', '#1A2F69', '#233B7C']);

export function skyPalette(sunElevationDeg: number): SkyPalette {
  if (sunElevationDeg < -6) return NIGHT;
  if (sunElevationDeg < 0) return TWILIGHT;
  if (sunElevationDeg < 10) return GOLDEN;
  return DAY;
}

/** Où en est le soleil sur sa course du jour : 0 au lever, 1 au coucher,
 *  `null` quand il n'est pas au-dessus de l'horizon. */
export function sunArcProgress(now: Date, sunrise: Date, sunset: Date): number | null {
  const t = (now.getTime() - sunrise.getTime()) / (sunset.getTime() - sunrise.getTime());
  return t >= 0 && t <= 1 ? t : null;
}
