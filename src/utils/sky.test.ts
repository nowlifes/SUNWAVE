import { describe, expect, it } from 'vitest';
import { skyPalette, sunArcProgress } from './sky';
import { ribbonCells } from './ribbon';

describe('le ciel suit le soleil', () => {
  it('quatre ciels distincts : nuit, crépuscule, heure dorée, jour', () => {
    const tops = [-12, -3, 5, 40].map((e) => skyPalette(e).top);
    expect(new Set(tops).size).toBe(4);
  });

  it('la nuit est plus sombre que le jour', () => {
    const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
    expect(lum(skyPalette(-12).top)).toBeLessThan(lum(skyPalette(40).top));
  });

  it('le soleil est sur son arc entre le lever et le coucher, absent sinon', () => {
    const rise = new Date('2026-09-23T07:25:00+01:00');
    const set = new Date('2026-09-23T19:32:00+01:00');
    expect(sunArcProgress(new Date('2026-09-23T15:00:00+01:00'), rise, set)).toBeCloseTo(455 / 727, 3);
    expect(sunArcProgress(new Date('2026-09-23T06:00:00+01:00'), rise, set)).toBeNull();
    expect(sunArcProgress(new Date('2026-09-23T21:00:00+01:00'), rise, set)).toBeNull();
  });
});

describe('la bande de lumière', () => {
  // 96 quarts d'heure : soleil 50 % de 08:00 à 12:00, 0 ailleurs.
  const exposure = Array.from({ length: 96 }, (_, q) => (q >= 32 && q < 48 ? 50 : 0));
  const rise = 7 * 60 + 25;
  const set = 19 * 60 + 32;

  it('une case par demi-heure, de 06:00 à 21:00', () => {
    const cells = ribbonCells(exposure, 'SUN', rise, set);
    expect(cells).toHaveLength(30);
    expect(cells[0].startMin).toBe(360);
    expect(cells[29].startMin).toBe(20 * 60 + 30);
  });

  it('mode Soleil : la valeur est le soleil ; nuit = null', () => {
    const cells = ribbonCells(exposure, 'SUN', rise, set);
    const at = (h: number, m = 0) => cells.find((c) => c.startMin === h * 60 + m)!;
    expect(at(9).value).toBe(50);
    expect(at(14).value).toBe(0);
    expect(at(6).value).toBeNull();
    expect(at(20).value).toBeNull();
  });

  it("mode Ombre : la valeur est l'ombre, et la nuit ne compte pas comme de l'ombre", () => {
    const cells = ribbonCells(exposure, 'SHADE', rise, set);
    const at = (h: number) => cells.find((c) => c.startMin === h * 60)!;
    expect(at(9).value).toBe(50);
    expect(at(14).value).toBe(100);
    expect(at(20).value).toBeNull();
  });
});
