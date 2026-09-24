import { describe, expect, it } from 'vitest';
import { VenueSunService } from './VenueSunService';
import { VenueService } from './VenueService';
import { lisbonBuildings } from '@/data/lisbonBuildings';

// La bulle « Ici : soleil jusqu'à… » lit le même moteur que les lieux, pour
// un point que personne n'a relevé : l'endroit que l'on vient de toucher.

const date = new Date('2026-09-23T15:40:00+01:00');

describe('getPointSunByQuarter', () => {
  it("donne 96 quarts d'heure, nuls la nuit", () => {
    const curve = VenueSunService.getPointSunByQuarter({ lat: 38.7107, lng: -9.1415 }, lisbonBuildings, date);
    expect(curve).toHaveLength(96);
    expect(curve[0]).toBe(0);
    expect(curve[95]).toBe(0);
    for (const v of curve) expect(v).toBeGreaterThanOrEqual(0);
    expect(Math.max(...curve)).toBeGreaterThan(0);
  });

  it("au sol d'une plage, du soleil à midi", () => {
    const venue = VenueService.getAllVenues().find((v) => v.category === 'beach')!;
    const point = VenueSunService.getPointSunByQuarter({ lat: venue.latitude, lng: venue.longitude }, lisbonBuildings, date);
    expect(point[13 * 4]).toBeGreaterThan(50);
  });

  it('est mémorisée : toucher deux fois le même endroit ne recalcule pas', () => {
    const p = { lat: 38.7139, lng: -9.1334 };
    expect(VenueSunService.getPointSunByQuarter(p, lisbonBuildings, date)).toBe(
      VenueSunService.getPointSunByQuarter(p, lisbonBuildings, date)
    );
  });
});
