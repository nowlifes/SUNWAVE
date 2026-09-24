// ---------------------------------------------------------------------------
// Les icônes halo en chaîne SVG, pour les éléments DOM que la carte crée
// elle-même (marqueurs MapLibre, halo de bord). Même dessin que le composant
// React <HaloIcon> (src/components/Halo.tsx) : un seul système d'icônes.
//
//   sun   : ça brille — disque plein + halo chaud (sa taille suit le soleil)
//   shade : éteint — le même rond, vide, sans halo
//   you   : rond vide coquille — toi
//   dest  : rond vide braise qui bat — là où tu vas
// ---------------------------------------------------------------------------

import { haloLook } from './halo';
import { DAY, LIGHT, NIGHT } from './palette';

export type HaloKind = 'sun' | 'shade' | 'you' | 'dest';
export type HaloTone = 'night' | 'day';

export interface HaloSpec {
  kind: HaloKind;
  tone?: HaloTone;
  /** Hauteur du soleil (degrés) : couleur et largeur du halo « sun ». */
  alt?: number;
}

/** Les formes, en unités du viewBox 24 × 24. `gradId` doit être unique. */
export function haloParts({ kind, tone = 'night', alt = 30 }: HaloSpec) {
  const night = tone === 'night';
  if (kind === 'sun') {
    const look = haloLook(Math.max(alt, 1));
    return {
      glow: { r: 7 + 5 * look.glow, color: look.color, opacity: 0.45 + 0.35 * look.glow },
      // Sur fond clair, le disque reste braise : pâle, il disparaîtrait.
      core: { r: 5, fill: night ? look.color : LIGHT.fire, stroke: null as string | null, width: 0 },
    };
  }
  if (kind === 'shade') {
    return { glow: null, core: { r: 5, fill: 'none', stroke: night ? NIGHT.sub : DAY.sub, width: 1.8 } };
  }
  if (kind === 'you') {
    const c = night ? NIGHT.shell : NIGHT.night;
    return { glow: { r: 11, color: c, opacity: 0.3 }, core: { r: 5.5, fill: 'none', stroke: c, width: 2.4 } };
  }
  return {
    glow: { r: 11.5, color: LIGHT.fire, opacity: 0.3 },
    core: { r: 5.5, fill: night ? 'rgba(11,26,69,0.4)' : 'rgba(255,246,236,0.6)', stroke: LIGHT.fire, width: 2.4 },
  };
}

let seq = 0;

/** L'icône en SVG (chaîne), à `size` px. La pulsation de « dest » est un
 *  élément HTML à part (voir haloPulseMarkup) : animé en transform, il reste
 *  sur le compositeur, là où un cercle SVG animé serait repeint à chaque image. */
export function haloSvg(spec: HaloSpec, size: number): string {
  const { glow, core } = haloParts(spec);
  const id = `hm${++seq}`;
  const g = glow
    ? `<defs><radialGradient id="${id}"><stop offset="0.35" stop-color="${glow.color}" stop-opacity="${glow.opacity.toFixed(2)}"/><stop offset="1" stop-color="${glow.color}" stop-opacity="0"/></radialGradient></defs><circle cx="12" cy="12" r="${glow.r.toFixed(1)}" fill="url(#${id})"/>`
    : '';
  const c = `<circle cx="12" cy="12" r="${core.r}" fill="${core.fill}"${core.stroke ? ` stroke="${core.stroke}" stroke-width="${core.width}"` : ''}/>`;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="display:block;overflow:visible">${g}${c}</svg>`;
}

export type LiveLevel = 'plenty' | 'few' | 'none';

/** La jauge « il reste des places » dans la grammaire halo : pleine de
 *  lumière = des places, à moitié = presque plein, éteinte = complet. Remplace
 *  le feu tricolore vert/orange/rouge, qui ajoutait deux couleurs à l'app. */
export function liveParts(level: LiveLevel, tone: HaloTone = 'night') {
  const ring = tone === 'night' ? NIGHT.sub : DAY.sub;
  return { ring, fill: LIGHT.pale, fraction: level === 'plenty' ? 1 : level === 'few' ? 0.5 : 0 };
}

export function liveGlyphSvg(level: LiveLevel, size: number, tone: HaloTone = 'night'): string {
  const { ring, fill, fraction } = liveParts(level, tone);
  const inner =
    fraction === 1
      ? `<circle cx="12" cy="12" r="7" fill="${fill}"/>`
      : fraction > 0
        ? `<path d="M12 5a7 7 0 0 0 0 14z" fill="${fill}"/>`
        : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" style="display:block">${inner}<circle cx="12" cy="12" r="7" fill="none" stroke="${fraction === 1 ? fill : ring}" stroke-width="2.4"/></svg>`;
}

/** L'anneau qui bat autour de la destination (classe .halo-pulse, index.css). */
export function haloPulseMarkup(size: number): string {
  const d = Math.round((size * 19) / 24);
  return `<span class="halo-pulse" aria-hidden="true" style="position:absolute;left:50%;top:50%;width:${d}px;height:${d}px;margin:${-d / 2}px 0 0 ${-d / 2}px;border-radius:50%;border:1.5px solid ${LIGHT.fire}"></span>`;
}
