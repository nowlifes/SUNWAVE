// ---------------------------------------------------------------------------
// Le pseudo : un nom choisi, pas un prénom — il s'affiche chez les autres
// (« confirmé par Léa »). Rangé sur l'appareil ; envoyé avec chaque réponse
// « il reste des places ? ». Le serveur refait le même contrôle (api/live.ts).
// ---------------------------------------------------------------------------

export const PSEUDO_MAX = 20;
/** Lettres, chiffres, espace et . _ ' - : ni balise, ni lien, ni emoji. */
export const PSEUDO_RE = /^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u;

const KEY = 'sun_pseudo';
const ASKED_KEY = 'sun_pseudo_asked';

/** Le pseudo tel qu'on le garde, ou null s'il est vide ou refusé. */
export function normalizePseudo(raw: string): string | null {
  const s = raw.normalize('NFC').replace(/\s+/g, ' ').trim().slice(0, PSEUDO_MAX).trim();
  return s && PSEUDO_RE.test(s) ? s : null;
}

const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Stockage interdit : le pseudo vit le temps de la session.
  }
}

let current: string | null = normalizePseudo(read(KEY) ?? '');

export function getPseudo(): string | null {
  return current;
}

export function setPseudo(value: string | null): void {
  current = value === null ? null : normalizePseudo(value);
  write(KEY, current);
  for (const l of listeners) l();
}

export function subscribePseudo(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** La question « ton pseudo ? » n'est posée qu'une fois, après la première réponse. */
export function pseudoAsked(): boolean {
  return read(ASKED_KEY) === '1';
}
export function markPseudoAsked(): void {
  write(ASKED_KEY, '1');
}
