import { afterAll, describe, expect, it } from 'vitest';

// Un navigateur hors du fuseau de Lisbonne (touriste, ou machine de test en
// Californie) : la clé de cache prenait le jour LOCAL. Glisser l'heure de
// 21:00 à 06:00 (Lisbonne) passait minuit local et recalculait les 970
// courbes : 2 s de gel. Le jour qui compte est celui de Lisbonne.
const previousTZ = process.env.TZ;
process.env.TZ = 'America/Los_Angeles';
afterAll(() => {
  if (previousTZ === undefined) delete process.env.TZ;
  else process.env.TZ = previousTZ;
});

describe('courbes mémorisées par jour de Lisbonne, pas par jour local', () => {
  it('06:00 et 21:00 à Lisbonne, même jour : une seule courbe', async () => {
    const { VenueSunService } = await import('./VenueSunService');
    const { lisbonBuildings } = await import('@/data/lisbonBuildings');
    const p = { lat: 38.7107, lng: -9.1415 };
    const morning = new Date('2026-09-24T05:00:00Z'); // 06:00 Lisbonne, 22:00 le 23 à LA
    const evening = new Date('2026-09-24T20:00:00Z'); // 21:00 Lisbonne, 13:00 le 24 à LA
    expect(new Date(morning).getDate()).toBe(23); // le fuseau de test est bien actif
    expect(VenueSunService.getPointSunByQuarter(p, lisbonBuildings, morning)).toBe(
      VenueSunService.getPointSunByQuarter(p, lisbonBuildings, evening)
    );
  });
  it('deux jours de Lisbonne différents : deux courbes', async () => {
    const { VenueSunService } = await import('./VenueSunService');
    const { lisbonBuildings } = await import('@/data/lisbonBuildings');
    const p = { lat: 38.7107, lng: -9.1415 };
    const a = VenueSunService.getPointSunByQuarter(p, lisbonBuildings, new Date('2026-09-24T22:30:00Z')); // 23:30 le 24
    const b = VenueSunService.getPointSunByQuarter(p, lisbonBuildings, new Date('2026-09-24T23:30:00Z')); // 00:30 le 25
    expect(a).not.toBe(b);
  });
});
