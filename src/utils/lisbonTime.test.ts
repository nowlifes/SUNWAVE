import { describe, expect, it } from 'vitest';
import { snapToQuarter } from './lisbonTime';

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
