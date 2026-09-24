import { describe, expect, it } from 'vitest';
import { lastRayMinute, sunGlyph } from './ficheSky';

describe('le disque de la fiche : halo qui brille, puis braise qui s’aplatit sur l’horizon', () => {
  it('bien avant le dernier rayon : disque rond', () => {
    const g = sunGlyph({ nowMin: 16 * 60, lastRayMin: 19 * 60 + 24, elevation: 20 });
    expect(g.kind).toBe('disc');
    expect(g.flatten).toBe(1);
  });
  it('dans les 20 dernières minutes : braise qui s’aplatit, de plus en plus', () => {
    const a = sunGlyph({ nowMin: 19 * 60 + 10, lastRayMin: 19 * 60 + 24, elevation: 2 });
    const b = sunGlyph({ nowMin: 19 * 60 + 20, lastRayMin: 19 * 60 + 24, elevation: 1 });
    expect(a.kind).toBe('setting');
    expect(b.kind).toBe('setting');
    expect(b.flatten).toBeLessThan(a.flatten);
    expect(b.flatten).toBeGreaterThanOrEqual(0.35);
    expect(a.flatten).toBeLessThanOrEqual(1);
  });
  it('juste après le dernier rayon : braise posée sur l’horizon, au point où il disparaît', () => {
    const g = sunGlyph({ nowMin: 19 * 60 + 30, lastRayMin: 19 * 60 + 24, elevation: -0.5 });
    expect(g.kind).toBe('ember');
    expect(g.flatten).toBeCloseTo(0.35, 5);
  });
  it('la nuit : plus rien ne brille', () => {
    expect(sunGlyph({ nowMin: 22 * 60, lastRayMin: 19 * 60 + 24, elevation: -15 }).kind).toBe('none');
  });
  it('pas de dernier rayon connu (lieu à l’ombre toute la journée) : disque si le soleil est levé', () => {
    expect(sunGlyph({ nowMin: 12 * 60, lastRayMin: null, elevation: 45 }).kind).toBe('disc');
    expect(sunGlyph({ nowMin: 23 * 60, lastRayMin: null, elevation: -20 }).kind).toBe('none');
  });
});

describe('dernier rayon d’après la courbe au quart d’heure', () => {
  it('fin du dernier quart d’heure au soleil', () => {
    const curve = Array.from({ length: 96 }, (_, q) => (q >= 40 && q < 77 ? 80 : 0)); // soleil jusqu'à 19:15
    expect(lastRayMinute(curve, 40)).toBe(77 * 15);
  });
  it('jamais au soleil : null', () => {
    expect(lastRayMinute(new Array(96).fill(10), 40)).toBeNull();
  });
});
