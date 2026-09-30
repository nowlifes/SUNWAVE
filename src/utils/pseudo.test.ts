import { describe, it, expect } from 'vitest';
import { normalizePseudo, PSEUDO_MAX } from './pseudo';

describe('normalizePseudo', () => {
  it('garde un pseudo simple, espaces resserrés', () => {
    expect(normalizePseudo('  Léa ')).toBe('Léa');
    expect(normalizePseudo('Jean   Marc')).toBe('Jean Marc');
    expect(normalizePseudo("o'neil-22")).toBe("o'neil-22");
  });
  it('vide = pas de pseudo', () => {
    expect(normalizePseudo('   ')).toBeNull();
  });
  it('coupe au-delà de la longueur max', () => {
    expect(normalizePseudo('a'.repeat(40))).toHaveLength(PSEUDO_MAX);
  });
  it('refuse balises, liens et emojis', () => {
    expect(normalizePseudo('<b>x</b>')).toBeNull();
    expect(normalizePseudo('http://x.co')).toBeNull();
    expect(normalizePseudo('☀️☀️')).toBeNull();
  });
});
