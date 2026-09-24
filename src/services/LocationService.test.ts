import { describe, expect, it } from 'vitest';
import { LocationService } from './LocationService';

// Toute l'app mesure depuis la position : temps de marche, coucher du soleil.
// Une position à Paris donnait « 17949 min à pied » sur chaque lieu.

describe('resolve', () => {
  it('garde une position dans Lisbonne telle quelle', () => {
    const alfama = { lat: 38.7115, lng: -9.13 };
    const loc = LocationService.resolve(alfama, 12);
    expect(loc.granted).toBe(true);
    expect(loc.outsideLisbon).toBe(false);
    expect(loc.coords).toEqual(alfama);
  });

  it('retombe sur le centre de Lisbonne quand on est loin', () => {
    const loc = LocationService.resolve({ lat: 48.8566, lng: 2.3522 }, 12);
    expect(loc.granted).toBe(false);
    expect(loc.outsideLisbon).toBe(true);
    expect(loc.coords).toEqual(LocationService.defaultLocation);
  });

  it('accepte Belém et Parque das Nações, aux bords de la ville', () => {
    expect(LocationService.resolve({ lat: 38.6916, lng: -9.216 }, 10).outsideLisbon).toBe(false);
    expect(LocationService.resolve({ lat: 38.768, lng: -9.094 }, 10).outsideLisbon).toBe(false);
  });

  // La rive sud fait partie de la zone : ses lieux se mesurent depuis la
  // vraie position, pas depuis le centre de Lisbonne.
  it('accepte Costa da Caparica et Praia da Morena, au bout de la zone', () => {
    expect(LocationService.resolve({ lat: 38.6446, lng: -9.2356 }, 10).outsideLisbon).toBe(false);
    expect(LocationService.resolve({ lat: 38.60326, lng: -9.21082 }, 10).outsideLisbon).toBe(false);
  });
});
