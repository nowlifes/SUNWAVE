import { describe, expect, it } from 'vitest';
import { lightCut } from './lightCut';

describe('lightCut', () => {
  it("soleil à l'ouest : l'ombre tombe à droite (vers l'est)", () => {
    expect(lightCut(270, 20).dx).toBeGreaterThan(0);
  });

  it("soleil à l'est : l'ombre tombe à gauche", () => {
    expect(lightCut(90, 20).dx).toBeLessThan(0);
  });

  it('plein sud : pas de décalage horizontal', () => {
    expect(Math.abs(lightCut(180, 50).dx)).toBeLessThan(0.1);
  });

  it('ombre plus longue quand le soleil est bas, et jamais > 9 px', () => {
    const low = lightCut(270, 3);
    const high = lightCut(270, 60);
    expect(Math.hypot(low.dx, low.dy)).toBeGreaterThan(Math.hypot(high.dx, high.dy));
    expect(Math.abs(low.dx)).toBeLessThanOrEqual(9);
  });

  it('reste borné quand le soleil est sous ou pile sur l\'horizon', () => {
    const c = lightCut(270, -12);
    expect(Number.isFinite(c.dx) && Number.isFinite(c.dy) && Number.isFinite(c.angle) && Number.isFinite(c.cut)).toBe(true);
    expect(c.cut).toBeGreaterThanOrEqual(48);
    expect(c.cut).toBeLessThanOrEqual(70);
  });
});
