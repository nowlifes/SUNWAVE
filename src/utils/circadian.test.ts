import { describe, expect, it } from 'vitest';
import { cardLight, circadian, luminance, skyBands, themeColor } from './circadian';

// Lisbonne le 6 octobre 2026 : lever ~07:35, coucher ~19:12 (heure d'été, UTC+1).
const at = (hhmm: string) => new Date(`2026-10-06T${hhmm}:00+01:00`);
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

describe('circadian — mode Soleil', () => {
  it("l'orange plein n'arrive qu'à l'heure dorée", () => {
    const [r, g, b] = rgb(circadian(at('18:25'), 'SUN').sheet);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeLessThan(140);
    expect(b).toBeLessThan(80);
  });

  it('à midi la feuille est paille, pas orange', () => {
    const [r, g] = rgb(circadian(at('13:20'), 'SUN').sheet);
    expect(r).toBeGreaterThan(240);
    expect(g).toBeGreaterThan(210);
  });

  it('le jour se lit en encre, la nuit en crème', () => {
    expect(circadian(at('13:20'), 'SUN').fg).toBe('ink');
    expect(circadian(at('23:00'), 'SUN').fg).toBe('cream');
    expect(circadian(at('05:30'), 'SUN').fg).toBe('cream');
  });
});

describe('circadian — mode Ombre', () => {
  it('le ciel de nuit est sombre, celui de midi est clair', () => {
    expect(luminance(circadian(at('23:00'), 'SHADE').sky[0])).toBeLessThan(0.05);
    expect(luminance(circadian(at('13:20'), 'SHADE').sky[1])).toBeGreaterThan(0.6);
  });
});

describe('circadian — le texte reste lisible', () => {
  it('au coucher, en Ombre : crème en haut du ciel, encre en bas', () => {
    const c = circadian(at('19:12'), 'SHADE');
    expect(c.fg).toBe('cream');
    expect(c.fgLow).toBe('ink');
  });
});

describe('circadian — la carte', () => {
  it('pas de voile à midi, un voile chaud au soir, épais la nuit', () => {
    expect(circadian(at('13:20'), 'SUN').map.tintOpacity).toBeLessThan(0.03);
    const golden = circadian(at('18:25'), 'SUN').map;
    expect(golden.tintOpacity).toBeGreaterThan(0.1);
    expect(rgb(golden.tint)[0]).toBeGreaterThan(rgb(golden.tint)[2]);
    expect(circadian(at('23:00'), 'SUN').map.tintOpacity).toBeGreaterThan(0.5);
  });
});

describe("circadian — l'ombre portée", () => {
  it('part à droite le matin, à gauche le soir, disparaît la nuit', () => {
    expect(circadian(at('09:30'), 'SUN').shadow!.x).toBeGreaterThan(0);
    expect(circadian(at('18:30'), 'SUN').shadow!.x).toBeLessThan(0);
    expect(circadian(at('22:00'), 'SUN').shadow).toBeNull();
  });

  it("s'allonge quand le soleil descend", () => {
    const noon = circadian(at('13:20'), 'SUN').shadow!;
    const late = circadian(at('18:45'), 'SUN').shadow!;
    expect(Math.hypot(late.x, late.y)).toBeGreaterThan(Math.hypot(noon.x, noon.y));
  });
});

describe('circadian — le ciel de la fiche', () => {
  it('les strates descendent du haut du ciel vers son bas', () => {
    const c = circadian(at('18:25'), 'SHADE');
    const bands = skyBands(c, 4);
    expect(bands).toHaveLength(4);
    expect(bands[0]).toBe(c.sky[0]);
    expect(bands[3]).toBe(c.sky[1]);
    expect(new Set(bands).size).toBe(4);
  });

  it("le même ciel dans les deux modes : c'est le ciel du lieu, pas un fond", () => {
    expect(skyBands(circadian(at('09:30'), 'SUN'), 4)).toEqual(skyBands(circadian(at('09:30'), 'SHADE'), 4));
  });
});

describe('circadian — le fond sous une carte crème', () => {
  const CREAM = luminance('#FFF1D6');
  const ratio = (h: string) => (CREAM + 0.05) / (luminance(h) + 0.05);

  it('la carte crème se détache à toute heure, dans les deux modes', () => {
    for (let m = 0; m < 24 * 60; m += 15) {
      const hhmm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      for (const mode of ['SUN', 'SHADE'] as const) {
        expect(ratio(circadian(at(hhmm), mode).deep), `${mode} ${hhmm}`).toBeGreaterThanOrEqual(1.4);
      }
    }
  });

  it("l'orange plein reste un moment : heure dorée oui, midi non", () => {
    const [r, g, b] = rgb(circadian(at('18:25'), 'SUN').deep);
    expect(r).toBeGreaterThan(230);
    expect(g).toBeLessThan(130);
    expect(b).toBeLessThan(80);
    const [, gNoon] = rgb(circadian(at('13:20'), 'SUN').deep);
    expect(gNoon).toBeGreaterThan(150);
  });
});

describe('circadian — la barre du navigateur', () => {
  it("prend la couleur du haut de l'écran : la feuille en Soleil, le haut du ciel en Ombre", () => {
    const sun = circadian(at('18:25'), 'SUN');
    const shade = circadian(at('18:25'), 'SHADE');
    expect(themeColor(sun, 'SUN')).toBe(sun.sheet);
    expect(themeColor(shade, 'SHADE')).toBe(shade.sky[0]);
  });
});

describe('circadian — la lumière propre à chaque lieu', () => {
  it('un lieu au soleil prend la teinte profonde de l’heure', () => {
    const c = circadian(at('18:25'), 'SUN');
    expect(cardLight(c, 'sun')).toBe(c.deep);
  });

  it("un lieu à l'ombre est bleu, la nuit est encre", () => {
    const c = circadian(at('13:20'), 'SUN');
    const [r, , b] = rgb(cardLight(c, 'shade'));
    expect(b).toBeGreaterThan(r);
    expect(luminance(cardLight(c, 'night'))).toBeLessThan(0.05);
  });
});
