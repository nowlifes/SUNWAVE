// ---------------------------------------------------------------------------
// Le ciel de l'écran d'accueil : la couleur du ciel de Lisbonne à cette
// minute, et le soleil posé sur sa course. Un coup d'œil dit l'heure qu'il
// est dans la journée du soleil, avant même de lire un chiffre.
// ---------------------------------------------------------------------------

export interface SkyPalette {
  top: string;
  middle: string;
  bottom: string;
}

// Paliers de hauteur du soleil, en degrés : sous −6° c'est la nuit civile,
// entre −6° et 0° le crépuscule, jusqu'à 10° l'heure dorée.
const NIGHT: SkyPalette = { top: '#0B1A2E', middle: '#15294A', bottom: '#2A3D5E' };
const TWILIGHT: SkyPalette = { top: '#243766', middle: '#7A5C8A', bottom: '#E8906A' };
const GOLDEN: SkyPalette = { top: '#3A6A9E', middle: '#C98E6E', bottom: '#F4B983' };
const DAY: SkyPalette = { top: '#2F6FA6', middle: '#5B93C2', bottom: '#EFC9A0' };

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
