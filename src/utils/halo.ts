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
  /** Rotation CSS (degrés, horaire) d'un cône qui pointe vers le bas à 0°. */
  rotation: number;
  length: number;
  halfAngle: number;
  color: string;
  opacity: number;
}

/**
 * Faisceau A : un cône doux qui entre par le bord de l'écran, du côté où est
 * vraiment le soleil (azimut), et traverse la carte. Bas sur l'horizon, il
 * est long et étroit ; haut, plus court et plus ouvert. `null` la nuit.
 */
export function beamCone(azDeg: number, altDeg: number, width: number, height: number): Cone | null {
  if (!(altDeg > LIT_MIN_ALT) || width <= 0 || height <= 0) return null;
  const d = dirOf(azDeg);
  const diag = Math.hypot(width, height);
  const r = diag / 2 + 40;
  const k = Math.min(1, altDeg / 45);
  return {
    apexX: width / 2 + d.x * r,
    apexY: height / 2 + d.y * r,
    rotation: norm360(azDeg),
    length: r + diag * (0.55 + 0.5 * (1 - k)),
    halfAngle: 16 + 20 * k,
    color: beamColor(altDeg),
    opacity: 0.5 + 0.2 * k,
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
  const d = dirOf(azDeg);
  // Distance du lieu au bord de l'écran, dans la direction du soleil.
  const ts: number[] = [];
  if (d.x > 1e-9) ts.push((width - target.x) / d.x);
  if (d.x < -1e-9) ts.push(-target.x / d.x);
  if (d.y > 1e-9) ts.push((height - target.y) / d.y);
  if (d.y < -1e-9) ts.push(-target.y / d.y);
  const toEdge = Math.max(0, Math.min(...ts.filter((t) => t >= 0), Math.hypot(width, height)));
  const k = Math.min(1, altDeg / 45);
  return {
    x: target.x,
    y: target.y,
    rotation: norm360(azDeg),
    length: toEdge + 80,
    width: 46 + 30 * k,
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
