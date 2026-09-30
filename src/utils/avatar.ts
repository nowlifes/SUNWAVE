// ---------------------------------------------------------------------------
// L'avatar : une silhouette à contre-jour, sans visage, faite de trois pièces
// (coiffure, couvre-chef, lunettes). Pas de photo : rien de personnel ne sort
// de l'appareil. Il voyage en trois caractères (« b62 ») avec chaque réponse
// « il reste des places ? » ; le serveur refait le même contrôle (api/live.ts).
//
// Ce qui le distingue : les verres montrent le lieu confirmé (voir Avatar.tsx).
// ---------------------------------------------------------------------------
import type { VenueCategory } from '@/types';
import { lisbonHour } from './lisbonTime';

export const HAIRS = [
  'Boucles', 'Long', 'Chignon', 'Ras', 'Afro', 'Tresses',
  'Carré', 'Queue', 'Ondulé', 'Mèche', 'Deux chignons', 'Mulet',
] as const;
export const HATS = ['Rien', 'Bob', 'Casquette', 'Capeline', 'Bandana', 'Visière', 'Casque'] as const;
export const GLASSES = ['Rondes', 'Papillon', 'Sport', 'Aviateur', 'Carrées', 'Hexagone'] as const;

export interface AvatarSpec {
  hair: number;
  hat: number;
  glasses: number;
}

/** Coiffure en base 36 (0-9, a, b), puis couvre-chef, puis lunettes. */
export const AVATAR_RE = /^[0-9ab][0-6][0-5]$/;

export function encodeAvatar(a: AvatarSpec): string {
  return `${a.hair.toString(36)}${a.hat}${a.glasses}`;
}

export function parseAvatar(code: unknown): AvatarSpec | null {
  if (typeof code !== 'string' || !AVATAR_RE.test(code)) return null;
  return { hair: parseInt(code[0], 36), hat: Number(code[1]), glasses: Number(code[2]) };
}

export function randomAvatar(rand: () => number = Math.random): AvatarSpec {
  const pick = (n: number) => Math.min(n - 1, Math.floor(rand() * n));
  return { hair: pick(HAIRS.length), hat: pick(HATS.length), glasses: pick(GLASSES.length) };
}

/** En dessous de 64 px, le lieu n'est plus lisible dans un verre : un éclat suffit. */
export function lensDetailed(size: number): boolean {
  return size >= 64;
}

export type LensScene = 'view' | 'sea' | 'city';

/** Ce qu'on voit dans les verres selon le lieu : la vue, la mer ou les toits. */
export function lensScene(category: VenueCategory): LensScene {
  if (category === 'viewpoint' || category === 'rooftop') return 'view';
  if (category === 'beach') return 'sea';
  return 'city';
}

export type AvatarLight = 'sun' | 'shade' | 'cut';

/** La lumière d'une voix : celle du lieu maintenant ; coupée en deux quand le
 *  lieu était au soleil à la réponse et qu'il est passé à l'ombre depuis. */
export function voiceLight(sunByHour: number[], at: number, now: number, threshold: number): AvatarLight {
  const sunAt = (t: number) => (sunByHour[lisbonHour(new Date(t))] ?? 0) >= threshold;
  if (sunAt(now)) return 'sun';
  return sunAt(at) ? 'cut' : 'shade';
}

// --- Rangement sur l'appareil, comme le pseudo -----------------------------

const KEY = 'sun_avatar';
const listeners = new Set<() => void>();

function read(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function write(code: string) {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, code);
  } catch {
    // Stockage interdit : l'avatar vit le temps de la session.
  }
}

let current: string | null = parseAvatar(read()) ? read() : null;

/** Chacun a un avatar dès le départ (tiré au hasard) ; le Profil le change. */
export function getAvatar(): string {
  if (!current) {
    current = encodeAvatar(randomAvatar());
    write(current);
  }
  return current;
}

export function setAvatar(spec: AvatarSpec): void {
  current = encodeAvatar(spec);
  write(current);
  for (const l of listeners) l();
}

export function subscribeAvatar(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
