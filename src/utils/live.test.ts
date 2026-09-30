import { describe, it, expect } from 'vitest';
import { liveCount, liveHello, liveThanks, liveWho } from './live';

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

describe('pseudo dans les textes', () => {
  it('le merci nomme la personne quand elle a un pseudo', () => {
    expect(liveThanks({ same: 1, total: 1 }, 'Léa')).toMatch(/^Merci Léa — /);
    expect(liveThanks({ same: 3, total: 4 }, 'Léa')).toMatch(/^Merci Léa — 2 autres/);
    expect(liveThanks(null)).toMatch(/^Merci — /);
  });
  it('« confirmé par Léa » quand la dernière voix est signée', () => {
    expect(liveWho(1, 'Léa')).toBe('confirmé par Léa');
    expect(liveWho(2, 'Léa')).toBe('confirmé par Léa et 1 autre');
    expect(liveWho(4, 'Léa')).toBe('confirmé par Léa et 3 autres');
    expect(liveWho(2, null)).toBe('confirmé par 2 personnes');
  });
  it('salue par le pseudo, rien sans', () => {
    expect(liveHello('Léa')).toBe('Salut Léa.');
    expect(liveHello(null)).toBe('');
  });
});
