import { describe, expect, it } from 'vitest';
import { VenueService } from './VenueService';
import { ShadowService } from './ShadowService';
import { lisbonBuildings } from '@/data/lisbonBuildings';

// Sous 1° d'élévation, la couverture valait 80 % d'office, bâtiments ignorés :
// 12 % de soleil pour TOUS les lieux à hh:30 quand le coucher tombe juste
// après. La courbe horaire étant échantillonnée à hh:30, le créneau de 17 h
// d'un jour de novembre (coucher 17:33) disait « 12 % » partout — et la
// recommandation de 17 h envoyait sur un lieu à l'ombre depuis 14 h.
describe('soleil au ras de l\'horizon', () => {
  const NOV = new Date('2026-11-04T12:00:00Z'); // coucher à Lisbonne ≈ 17:33
  const at = (name: string, h: number, m: number) => {
    const v = VenueService.getAllVenues().find((x) => x.name === name)!;
    return ShadowService.computeSunExposureAt(h, m, v.latitude, v.longitude, v.outdoorPolygon?.orientationDeg ?? 180, lisbonBuildings, NOV, 0, v.altitude);
  };

  it("un lieu à l'ombre depuis 14 h ne regagne pas de soleil 3 min avant le coucher", () => {
    expect(at('Largo do Carmo', 17, 25)).toBe(0);
    expect(at('Largo do Carmo', 17, 30)).toBe(0);
  });
});
