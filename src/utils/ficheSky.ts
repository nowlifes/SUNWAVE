// ---------------------------------------------------------------------------
// Le ciel de la fiche : le disque du soleil avec son halo, l'horizon réel du
// lieu, et le point où son dernier rayon disparaît. Au coucher (choix B), le
// halo passe braise et s'aplatit sur l'horizon, là où il disparaît.
// ---------------------------------------------------------------------------

/** Dernières minutes où le disque s'aplatit peu à peu. */
export const SETTING_MIN = 20;
/** Après le dernier rayon, la braise reste posée ce temps sur l'horizon. */
export const EMBER_MIN = 30;
/** Aplatissement maximal (ry / rx) de la braise. */
export const FLAT_MIN = 0.35;

export type SunGlyphKind = 'disc' | 'setting' | 'ember' | 'none';

export function sunGlyph({
  nowMin,
  lastRayMin,
  elevation,
}: {
  nowMin: number;
  lastRayMin: number | null;
  elevation: number;
}): { kind: SunGlyphKind; flatten: number } {
  if (lastRayMin === null) return elevation > 0.5 ? { kind: 'disc', flatten: 1 } : { kind: 'none', flatten: 1 };
  if (nowMin < lastRayMin) {
    const left = lastRayMin - nowMin;
    if (left > SETTING_MIN) return elevation > 0.5 ? { kind: 'disc', flatten: 1 } : { kind: 'none', flatten: 1 };
    return { kind: 'setting', flatten: Math.max(FLAT_MIN, left / SETTING_MIN) };
  }
  if (nowMin - lastRayMin <= EMBER_MIN && elevation > -6) return { kind: 'ember', flatten: FLAT_MIN };
  return { kind: 'none', flatten: 1 };
}

/** Fin (minutes depuis minuit) du dernier quart d'heure au soleil, ou `null`. */
export function lastRayMinute(sunByQuarter: number[], threshold: number): number | null {
  for (let q = sunByQuarter.length - 1; q >= 0; q--) {
    if ((sunByQuarter[q] ?? 0) >= threshold) return (q + 1) * 15;
  }
  return null;
}
