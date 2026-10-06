import { describe, expect, it } from 'vitest';
import { isNightAt, stateWord } from './ficheState';

// Lisbonne le 6 octobre 2026 : lever ~07:37, coucher ~19:11 (UTC+1).
const at = (hhmm: string) => new Date(`2026-10-06T${hhmm}:00+01:00`);

describe('fiche — le mot de l’état', () => {
  it('la nuit, c’est « Nuit » dans les deux modes, jamais « Soleil »', () => {
    for (const isSun of [true, false]) for (const inIt of [true, false]) expect(stateWord(inIt, isSun, true)).toBe('Nuit');
  });
  it('le jour, le mot suit le mode', () => {
    expect(stateWord(true, true, false)).toBe('Soleil');
    expect(stateWord(false, true, false)).toBe('Ombre');
    expect(stateWord(true, false, false)).toBe('Ombre');
    expect(stateWord(false, false, false)).toBe('Soleil');
  });
});

describe('fiche — la nuit', () => {
  it('après le coucher et avant le lever', () => {
    expect(isNightAt(at('22:00'))).toBe(true);
    expect(isNightAt(at('05:30'))).toBe(true);
    expect(isNightAt(at('13:00'))).toBe(false);
    expect(isNightAt(at('19:00'))).toBe(false);
  });
});
