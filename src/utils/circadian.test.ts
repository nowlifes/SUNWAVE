import { describe, expect, it } from 'vitest';
import { cardLight, circadian, luminance, NUANCIERS, skyBands, barTint } from './circadian';

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

  it('à chaque moment, la feuille est le nuancier validé', () => {
    const near = (a: string, b: string) => rgb(a).every((v, i) => Math.abs(v - rgb(b)[i]) <= 4);
    const cases: [string, string][] = [
      ['07:40', NUANCIERS.aube], ['09:35', NUANCIERS.matin], ['13:24', NUANCIERS.midi],
      ['17:02', NUANCIERS.apresMidi], ['18:37', NUANCIERS.doree], ['20:42', NUANCIERS.nuit],
    ];
    for (const [t, hex] of cases) expect(near(circadian(at(t), 'SUN').sheet, hex), `${t} ${circadian(at(t), 'SUN').sheet} ≠ ${hex}`).toBe(true);
  });

  it("après le coucher, la feuille reste le Dorée validé, puis la nuit — jamais de marron", () => {
    for (const t of ['18:40', '19:11', '19:30', '19:50']) expect(circadian(at(t), 'SUN').sheet, t).toBe(NUANCIERS.doree);
    expect(circadian(at('20:00'), 'SUN').sheet).toBe(NUANCIERS.nuit);
  });

  it('le texte de la feuille garde un contraste ≥ 4.5 à toute heure', () => {
    const INK = luminance('#0B1A45'), CREAM = luminance('#FFF1D6');
    for (let h = 0; h < 24 * 60; h += 10) {
      const d = new Date(at('00:00').getTime() + h * 60000);
      const c = circadian(d, 'SUN');
      const l = luminance(c.sheet);
      const ratio = c.fg === 'ink' ? (l + 0.05) / (INK + 0.05) : (CREAM + 0.05) / (l + 0.05);
      expect(ratio, `${d.toISOString()} ${c.sheet}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("le voile de la carte reste doré jusqu'à la nuit, sans violet", () => {
    for (const t of ['19:11', '19:30', '19:50']) expect(circadian(at(t), 'SUN').map.tint, t).toBe(NUANCIERS.doree);
    expect(circadian(at('07:40'), 'SUN').map.tint).toBe(NUANCIERS.aube);
    expect(circadian(at('20:00'), 'SUN').map.tint).toBe('#141C4A');
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
    expect(barTint(sun, 'SUN', false)).toBe(sun.sheet);
    expect(barTint(shade, 'SHADE', false)).toBe(shade.sky[0]);
  });
  it('sous des cartes crème (Explorer, Favoris), prend le fond profond de l’écran', () => {
    const sun = circadian(at('13:00'), 'SUN');
    expect(barTint(sun, 'SUN', true)).toBe(sun.deep);
    expect(barTint(sun, 'SUN', true)).not.toBe(sun.sheet);
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

describe('circadian — deep garde la teinte validée', () => {
  const hue = (h: string) => {
    const [r, g, b] = rgb(h).map((v) => v / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d === 0) return 0;
    const x = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return (x * 60 + 360) % 360;
  };
  it('même teinte que la feuille à chaque heure, seule la clarté baisse', () => {
    for (const t of ['07:40', '08:30', '09:30', '11:00', '13:20', '15:30', '16:50', '17:40', '18:25', '19:00', '19:20', '19:45']) {
      const c = circadian(at(t), 'SUN');
      expect(Math.abs(hue(c.deep) - hue(c.sheet)), t).toBeLessThan(4);
      expect(luminance(c.deep), t).toBeLessThanOrEqual(luminance(c.sheet) + 1e-9);
    }
  });
  it("le matin reste abricot, pas orange", () => {
    const [, g] = rgb(circadian(at('09:30'), 'SUN').deep);
    expect(g).toBeGreaterThan(175);
  });
});

describe('circadian — lisible toute l’année, toutes les 2 minutes', () => {
  const INK = luminance('#0B1A45'), CREAM = luminance('#FFF1D6');
  const ratio = (text: 'ink' | 'cream', bg: string) => {
    const l = luminance(bg);
    return text === 'ink' ? (l + 0.05) / (INK + 0.05) : (CREAM + 0.05) / (l + 0.05);
  };
  const days = ['2026-06-21', '2026-10-06', '2026-12-21'];
  const each = (fn: (d: Date) => void) => {
    for (const day of days) {
      const t0 = new Date(`${day}T00:00:00Z`).getTime();
      for (let m = 0; m < 24 * 60; m += 2) fn(new Date(t0 + m * 60000));
    }
  };

  it('en Ombre, le haut et le bas du ciel portent leur texte à ≥ 4.5', () => {
    each((d) => {
      const c = circadian(d, 'SHADE');
      expect(ratio(c.fg, c.sky[0]), `${d.toISOString()} haut ${c.sky[0]}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.fgLow, c.sky[1]), `${d.toISOString()} bas ${c.sky[1]}`).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('la feuille de la carte en Ombre : un seul texte, lisible en haut comme en bas', () => {
    each((d) => {
      const c = circadian(d, 'SHADE');
      const [top, bot] = c.skySheet;
      expect(ratio(c.fgMid, top), `${d.toISOString()} haut ${top}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(c.fgMid, bot), `${d.toISOString()} bas ${bot}`).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('la feuille de la carte suit le ciel : identique quand il est déjà lisible', () => {
    const c = circadian(new Date('2026-10-06T12:00:00Z'), 'SHADE');
    expect(c.skySheet).toEqual(c.sky);
  });
});
