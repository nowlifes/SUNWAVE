// ---------------------------------------------------------------------------
// Le halo et le faisceau, en géométrie pure (pas de DOM, pas de React) :
// testés à part, appelés par la carte au plus une fois par image.
//
// Grammaire : « Ça brille : soleil. Éteint : ombre. Rond vide : toi ; s'il
// bat, c'est là où tu vas. » La couleur de la lumière suit la hauteur du
// soleil : braise au ras de l'horizon, or plus haut, pâle à midi.
// ---------------------------------------------------------------------------

import { LIGHT } from './palette';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Sous ce seuil (degrés), le soleil ne brille plus nulle part. */
export const LIT_MIN_ALT = 0.5;

const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
function mix(a: string, b: string, t: number): string {
  const A = hex(a);
  const B = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return (
    '#' +
    A.map((x, i) => Math.round(x + (B[i] - x) * k).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

/** La rampe de lumière selon la hauteur du soleil (degrés). */
export function lightColor(altDeg: number): string {
  if (altDeg <= 4) return LIGHT.fire;
  if (altDeg <= 18) return mix(LIGHT.fire, LIGHT.glow, (altDeg - 4) / 14);
  return mix(LIGHT.glow, LIGHT.pale, Math.min(1, (altDeg - 18) / 27));
}

/** Même rampe, par paliers de 5° : le faisceau ne se repeint pas à chaque
 *  pas du curseur, seulement quand la teinte change vraiment. */
export function beamColor(altDeg: number): string {
  return lightColor(Math.round(Math.max(0, Math.min(60, altDeg)) / 5) * 5);
}

/** L'état d'un halo « soleil » : allumé ou non, sa largeur relative (0..1)
 *  et sa couleur. Plus le soleil est haut, plus le halo est large et pâle. */
export function haloLook(altDeg: number): { lit: boolean; glow: number; color: string } {
  if (!(altDeg > LIT_MIN_ALT)) return { lit: false, glow: 0, color: LIGHT.fire };
  return { lit: true, glow: Math.min(1, 0.3 + (0.7 * Math.min(altDeg, 50)) / 50), color: lightColor(altDeg) };
}

const dirOf = (azDeg: number) => {
  const r = (azDeg * Math.PI) / 180;
  // Nord en haut (la carte ne tourne pas) : x vers l'est, y vers le sud.
  return { x: Math.sin(r), y: -Math.cos(r) };
};
const norm360 = (a: number) => ((a % 360) + 360) % 360;

export interface Cone {
  /** Sommet du cône, juste hors de l'écran côté soleil (px de la carte). */
  apexX: number;
  apexY: number;
  /** Rotation CSS (degrés, horaire) : le cône est dessiné sommet en haut
   *  (au nord) d'un carré centré sur l'écran, puis tourné de l'azimut. */
  rotation: number;
  length: number;
  halfAngle: number;
  color: string;
  opacity: number;
  /** Côté du carré qui porte le cône : couvre l'écran quelle que soit la rotation. */
  side: number;
  /** Distance du centre de l'écran au sommet. */
  reach: number;
  width: number;
  height: number;
}

/** Hauteur du soleil par paliers de 5° : forme et teinte du faisceau n'en
 *  dépendent que par palier, seul l'azimut (rotation) suit chaque pas. */
const altStep = (altDeg: number) => Math.max(5, Math.min(60, Math.round(altDeg / 5) * 5));

/**
 * Faisceau A : un cône doux qui entre par le bord de l'écran, du côté où est
 * vraiment le soleil (azimut), et traverse la carte. Bas sur l'horizon, il
 * est long et étroit ; haut, plus court et plus ouvert. `null` la nuit.
 */
export function beamCone(azDeg: number, altDeg: number, width: number, height: number): Cone | null {
  if (!(altDeg > LIT_MIN_ALT) || width <= 0 || height <= 0) return null;
  const d = dirOf(azDeg);
  const diag = Math.hypot(width, height);
  const reach = diag / 2 + 40;
  const k = Math.min(1, altStep(altDeg) / 45);
  return {
    apexX: width / 2 + d.x * reach,
    apexY: height / 2 + d.y * reach,
    rotation: norm360(Math.round(azDeg)),
    length: Math.round(reach + diag * (0.55 + 0.5 * (1 - k))),
    halfAngle: Math.round(16 + 20 * k),
    color: beamColor(altDeg),
    opacity: 0.5 + 0.2 * k,
    side: Math.ceil(diag),
    reach,
    width,
    height,
  };
}

export interface Ray {
  /** Le bout du rayon : le lieu choisi. */
  x: number;
  y: number;
  /** Rotation CSS (degrés) d'un rayon qui monte (vers le nord) à 0°. */
  rotation: number;
  length: number;
  width: number;
  color: string;
}

/** Rayon B : il arrive du bord côté soleil et se pose sur le lieu choisi. */
export function beamRay(azDeg: number, altDeg: number, target: Point, width: number, height: number): Ray | null {
  if (!(altDeg > LIT_MIN_ALT) || width <= 0 || height <= 0) return null;
  const k = Math.min(1, altStep(altDeg) / 45);
  return {
    x: target.x,
    y: target.y,
    rotation: norm360(Math.round(azDeg)),
    // Longueur fixe (au-delà du bord) : quand le lieu bouge, seul le
    // transform change, le dessin reste en cache sur le compositeur.
    length: Math.ceil(Math.hypot(width, height)) + 80,
    width: Math.round(46 + 30 * k),
    color: beamColor(altDeg),
  };
}

export function isOnScreen(p: Point, rect: Rect, margin = 0): boolean {
  return p.x >= rect.left + margin && p.x <= rect.right - margin && p.y >= rect.top + margin && p.y <= rect.bottom - margin;
}

/**
 * Où accrocher un halo de bord : l'intersection du trait centre → cible avec
 * le cadre rentré de `inset`, et l'angle de la cible (0 = en haut, 90 = à
 * droite, −90 = à gauche, ±180 = en bas) pour orienter la flèche.
 */
export function edgePoint(target: Point, rect: Rect, inset: number): Point & { angle: number } {
  const cx = (rect.left + rect.right) / 2;
  const cy = (rect.top + rect.bottom) / 2;
  const dx = target.x - cx;
  const dy = target.y - cy;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return { x: cx, y: rect.top + inset, angle: 0 };
  const x0 = rect.left + inset;
  const x1 = rect.right - inset;
  const y0 = rect.top + inset;
  const y1 = rect.bottom - inset;
  const ts: number[] = [];
  if (dx > 0) ts.push((x1 - cx) / dx);
  if (dx < 0) ts.push((x0 - cx) / dx);
  if (dy > 0) ts.push((y1 - cy) / dy);
  if (dy < 0) ts.push((y0 - cy) / dy);
  const t = Math.min(...ts);
  return {
    x: Math.max(x0, Math.min(x1, cx + dx * t)),
    y: Math.max(y0, Math.min(y1, cy + dy * t)),
    angle: (Math.atan2(dx, -dy) * 180) / Math.PI,
  };
}

// --- Styles CSS du faisceau --------------------------------------------------

export interface BeamCss {
  width: number;
  height: number;
  transform: string;
  transformOrigin: string;
  background: string;
  mask: string;
}

const rgba = (c: string, a: number) => {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
};

/** Le cône A en un seul élément : un carré centré sur l'écran, tourné de
 *  l'azimut. Fond et masque ne dépendent que du palier de lumière. */
export function coneCss(c: Cone): BeamCss {
  const top = Math.round(c.side / 2 - c.reach);
  const soft = c.halfAngle * 1.3;
  const a = 0.6 * c.opacity;
  return {
    width: c.side,
    height: c.side,
    transform: `translate(${(c.width - c.side) / 2}px, ${(c.height - c.side) / 2}px) rotate(${c.rotation}deg)`,
    transformOrigin: '50% 50%',
    background: `conic-gradient(from ${(180 - soft).toFixed(1)}deg at 50% ${top}px, ${rgba(c.color, 0)} 0deg, ${rgba(c.color, a)} ${soft.toFixed(1)}deg, ${rgba(c.color, 0)} ${(2 * soft).toFixed(1)}deg, ${rgba(c.color, 0)} 360deg)`,
    mask: `radial-gradient(circle at 50% ${top}px, #000 ${Math.round(0.3 * c.length)}px, rgba(0,0,0,0.45) ${Math.round(0.62 * c.length)}px, transparent ${c.length}px)`,
  };
}

/** Le rayon B : une bande douce qui arrive du côté du soleil et un halo sur
 *  le lieu. Seul le transform suit le lieu quand la carte bouge. */
export function rayCss(r: Ray): BeamCss {
  const halo = 64;
  const w = r.width + 2 * halo;
  const h = r.length + halo;
  const mid = w / 2;
  return {
    width: w,
    height: h,
    transform: `translate(${Math.round(r.x - mid)}px, ${Math.round(r.y - r.length)}px) rotate(${r.rotation}deg)`,
    transformOrigin: `50% ${r.length}px`,
    background:
      `radial-gradient(circle ${halo}px at 50% ${r.length}px, ${rgba(r.color, 0.55)}, ${rgba(r.color, 0)}), ` +
      `linear-gradient(90deg, ${rgba(r.color, 0)} ${mid - r.width / 2}px, ${rgba(r.color, 0.6)} ${mid}px, ${rgba(r.color, 0)} ${mid + r.width / 2}px)`,
    mask: `linear-gradient(to top, #000 0, #000 ${2 * halo}px, rgba(0,0,0,0.3) 70%, transparent 100%)`,
  };
}
