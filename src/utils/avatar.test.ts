import { describe, it, expect } from 'vitest';
import {
  AVATAR_RE,
  GLASSES,
  HAIRS,
  HATS,
  encodeAvatar,
  lensDetailed,
  lensScene,
  parseAvatar,
  randomAvatar,
  voiceLight,
} from './avatar';

describe('code avatar', () => {
  it('12 coiffures × 7 couvre-chefs (dont aucun) × 6 lunettes', () => {
    expect(HAIRS).toHaveLength(12);
    expect(HATS).toHaveLength(7);
    expect(GLASSES).toHaveLength(6);
  });

  it('aller-retour sur toutes les combinaisons', () => {
    for (let hair = 0; hair < HAIRS.length; hair++)
      for (let hat = 0; hat < HATS.length; hat++)
        for (let glasses = 0; glasses < GLASSES.length; glasses++) {
          const code = encodeAvatar({ hair, hat, glasses });
          expect(code).toMatch(AVATAR_RE);
          expect(parseAvatar(code)).toEqual({ hair, hat, glasses });
        }
  });

  it('refuse un code hors des pièces ou mal formé', () => {
    expect(parseAvatar('c00')).toBeNull();
    expect(parseAvatar('070')).toBeNull();
    expect(parseAvatar('006')).toBeNull();
    expect(parseAvatar('0000')).toBeNull();
    expect(parseAvatar('<b>')).toBeNull();
    expect(parseAvatar(null)).toBeNull();
    expect(parseAvatar(42)).toBeNull();
  });

  it('un avatar tiré au hasard est toujours valide', () => {
    for (let i = 0; i < 200; i++) expect(parseAvatar(encodeAvatar(randomAvatar()))).not.toBeNull();
  });
});

describe('ce que montrent les verres', () => {
  it('le lieu en grand, un simple éclat en petit', () => {
    expect(lensDetailed(96)).toBe(true);
    expect(lensDetailed(64)).toBe(true);
    expect(lensDetailed(38)).toBe(false);
  });

  it('une scène par famille de lieu', () => {
    expect(lensScene('viewpoint')).toBe('view');
    expect(lensScene('rooftop')).toBe('view');
    expect(lensScene('beach')).toBe('sea');
    expect(lensScene('cafe')).toBe('city');
    expect(lensScene('park')).toBe('city');
  });
});

describe('la lumière de chaque voix', () => {
  // Soleil de 9 h à 15 h, ombre ensuite.
  const sunByHour = Array.from({ length: 24 }, (_, h) => (h >= 9 && h < 16 ? 90 : 10));
  const at = (h: number) => Date.UTC(2026, 6, 1, h - 1, 0); // Lisbonne = UTC+1 en juillet

  it("au soleil si le lieu l'est encore", () => {
    expect(voiceLight(sunByHour, at(12), at(13), 50)).toBe('sun');
  });
  it("au frais si le lieu était déjà à l'ombre", () => {
    expect(voiceLight(sunByHour, at(17), at(17), 50)).toBe('shade');
  });
  it("coupé en deux si le lieu est passé à l'ombre depuis la réponse", () => {
    expect(voiceLight(sunByHour, at(15), at(16), 50)).toBe('cut');
  });
});
