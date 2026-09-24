import { describe, expect, it } from 'vitest';
import { lisbonMinutesOfDay, lisbonParts, lisbonWeekday, snapToQuarter } from './lisbonTime';

// Le glissement d'heure évalue ~970 lieux par pas ; chacun relisait l'heure
// de Lisbonne par Intl (le plus gros coût du pas). Mémorisé par instant.
describe('lisbonParts mémorisé', () => {
  it('même instant → même résultat, sans recalcul', () => {
    const d = new Date('2026-09-24T15:40:00Z');
    const a = lisbonParts(d);
    expect(lisbonParts(new Date(d.getTime()))).toBe(a);
    expect(lisbonMinutesOfDay(d)).toBe(16 * 60 + 40);
    expect(Object.isFrozen(a)).toBe(true);
  });
  it('instants différents → valeurs justes (heure d’hiver / d’été, minuit)', () => {
    expect(lisbonMinutesOfDay(new Date('2026-01-15T12:00:00Z'))).toBe(12 * 60);
    expect(lisbonMinutesOfDay(new Date('2026-07-15T12:00:00Z'))).toBe(13 * 60);
    expect(lisbonWeekday(new Date('2026-09-24T23:30:00Z'))).toBe(5);
  });
  it('le cache reste borné et juste après beaucoup d’instants', () => {
    for (let i = 0; i < 500; i++) lisbonParts(new Date(Date.UTC(2026, 8, 24, 0, i)));
    expect(lisbonMinutesOfDay(new Date('2026-09-24T15:40:00Z'))).toBe(16 * 60 + 40);
  });
});

// Toucher « 18 » sur le curseur posait 17:00 (ou 17:45) : les minutes étaient
// arrondies au quart d'heure sans reporter la retenue sur l'heure.
describe('snapToQuarter', () => {
  it('reporte la retenue quand l\'arrondi atteint 60', () => {
    expect(snapToQuarter(17 * 60 + 59.6)).toEqual({ hour: 18, minute: 0 });
    expect(snapToQuarter(8 * 60 + 53)).toEqual({ hour: 9, minute: 0 });
  });

  it('arrondit au quart d\'heure le plus proche', () => {
    expect(snapToQuarter(12 * 60 + 7)).toEqual({ hour: 12, minute: 0 });
    expect(snapToQuarter(12 * 60 + 8)).toEqual({ hour: 12, minute: 15 });
    expect(snapToQuarter(15 * 60 + 44)).toEqual({ hour: 15, minute: 45 });
  });
});
