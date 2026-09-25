// ---------------------------------------------------------------------------
// La coupe soleil / ombre : chaque carte est partagée à l'angle du soleil, et
// son ombre portée tombe à l'opposé. Trois nombres suffisent, calculés depuis
// l'azimut et la hauteur réels : l'interface dit l'heure sans un mot.
// ---------------------------------------------------------------------------

export interface LightCut {
  /** Décalage de l'ombre portée, en px. Elle tombe à l'opposé du soleil. */
  dx: number;
  dy: number;
  /** Angle de la frontière éclairé / ombre, en degrés CSS. */
  angle: number;
  /** Part de la carte qui reste au soleil, en %. */
  cut: number;
}

/**
 * @param azimuth  degrés, 0 = nord, sens horaire (SunService.getSunAzimuth)
 * @param elevation degrés au-dessus de l'horizon
 */
export function lightCut(azimuth: number, elevation: number): LightCut {
  const e = Math.sin((Math.min(70, Math.max(1, elevation)) * Math.PI) / 180);
  // Ombre longue quand le soleil est bas, courte à midi, jamais au-delà de 9 px :
  // c'est une ombre d'interface, pas une ombre de bâtiment.
  const len = Math.min(9, 3 + 5 / (e + 0.3));
  const rad = (azimuth * Math.PI) / 180;
  return {
    dx: round(-Math.sin(rad) * len),
    dy: round(3 + len * 0.5),
    angle: Math.round(-30 - (1 - e) * 40),
    cut: Math.round(48 + e * 22),
  };
}

const round = (n: number) => Math.round(n * 10) / 10;
