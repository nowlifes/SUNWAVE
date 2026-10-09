import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// La langue de l'app : français ou anglais.
//
// Pas de dictionnaire à clés : chaque phrase s'écrit sur place dans les deux
// langues, `tr('Au soleil', 'In the sun')`. Deux langues seulement, et les
// phrases se construisent souvent avec des morceaux (« perd le soleil dans
// 2h ») : une clé cacherait la phrase entière à qui relit le composant.
//
// Même mécanique que le pseudo : un store de module, lu partout (services
// compris), et `useLang()` pour que les écrans se redessinent à la bascule.
// ---------------------------------------------------------------------------

export type Lang = 'fr' | 'en';

const KEY = 'sun_lang';

/** Choisie par la personne, sinon celle du téléphone : français s'il parle
 *  français, anglais pour tout le reste (Lisbonne reçoit le monde entier). */
export function detectLang(stored: string | null, languages: readonly string[]): Lang {
  if (stored === 'fr' || stored === 'en') return stored;
  const first = languages[0]?.toLowerCase() ?? '';
  if (first === '') return 'fr';
  return first.startsWith('fr') ? 'fr' : 'en';
}

function readStored(): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function browserLanguages(): readonly string[] {
  // Hors navigateur (tests, Node) : le français, langue de référence de l'app.
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return [];
  return navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
}

let current: Lang = detectLang(readStored(), browserLanguages());
const listeners = new Set<() => void>();

/** La langue du document (lecteurs d'écran, césure) et le titre de l'onglet. */
function syncDocument() {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = current;
  document.title = tr('SUNWAVE · Ton coin au soleil', 'SUNWAVE · Your spot in the sun');
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang === current) return;
  current = lang;
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, lang);
  } catch {
    // Stockage interdit : la langue vit le temps de la session.
  }
  syncDocument();
  for (const l of listeners) l();
}

export function subscribeLang(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** La phrase dans la langue courante. Le français d'abord : c'est l'original. */
export function tr(fr: string, en: string): string {
  return current === 'en' ? en : fr;
}

/** Abonne le composant : il se redessine quand la langue change. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribeLang, getLang, getLang);
}

syncDocument();
