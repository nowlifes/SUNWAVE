import { afterEach, describe, it, expect } from 'vitest';
import { LIVE_SHORT, liveAge, liveCount, liveHello, liveQuestion, liveThanks, liveWho } from './live';
import { setLang } from '@/utils/lang';

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

describe('en anglais', () => {
  afterEach(() => setLang('fr'));

  it('pose la question et nomme qui a confirmé', () => {
    setLang('en');
    expect(liveQuestion('cafe', 'SUN')).toBe('Any tables left in the sun?');
    expect(liveQuestion('park', 'SHADE')).toBe('Any spots left in the shade?');
    expect(liveWho(1, 'Léa')).toBe('confirmed by Léa');
    expect(liveWho(4, 'Léa')).toBe('confirmed by Léa and 3 others');
    expect(liveWho(2, null)).toBe('confirmed by 2 people');
    expect(liveAge(6)).toBe('6 min ago');
  });

  it('remercie et compte sans faute d’accord', () => {
    setLang('en');
    expect(liveThanks({ same: 2, total: 2 }, 'Léa')).toMatch(/^Thanks, Léa — 1 other person confirmed/);
    expect(liveThanks({ same: 3, total: 4 })).toMatch(/2 other people confirmed/);
    expect(liveCount(4)).toBe('This place now has 4 confirmations');
    expect(liveHello('Léa')).toBe('Hi Léa.');
  });

  it('les libellés courts suivent la langue sans recharger le module', () => {
    expect(LIVE_SHORT.few).toBe('Presque plein');
    setLang('en');
    expect(LIVE_SHORT.few).toBe('Nearly full');
  });
});
