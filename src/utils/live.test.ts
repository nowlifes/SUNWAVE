import { describe, it, expect } from 'vitest';
import { liveCount, liveThanks } from './live';

describe('liveThanks', () => {
  it('ne promet pas un nombre de personnes aidées', () => {
    for (const a of [null, { same: 1, total: 1 }, { same: 3, total: 4 }, { same: 1, total: 3 }]) {
      expect(liveThanks(a)).not.toMatch(/aidé/);
    }
  });
  it('dit qu’on est le premier quand personne d’autre n’a répondu', () => {
    expect(liveThanks({ same: 1, total: 1 })).toMatch(/premier/);
    expect(liveThanks(null)).toMatch(/premier/);
  });
  it('accorde au singulier et au pluriel', () => {
    expect(liveThanks({ same: 2, total: 2 })).toMatch(/1 autre personne a confirmé/);
    expect(liveThanks({ same: 3, total: 4 })).toMatch(/2 autres personnes ont confirmé/);
  });
  it('signale des réponses différentes sans compter comme confirmation', () => {
    expect(liveThanks({ same: 1, total: 3 })).toMatch(/différentes/);
  });
});

describe('liveCount', () => {
  it('sépare la seule confirmation de la nôtre du total', () => {
    expect(liveCount(1)).toBe('1 confirmation : la tienne');
    expect(liveCount(4)).toBe('Ce lieu compte maintenant 4 confirmations');
  });
});
