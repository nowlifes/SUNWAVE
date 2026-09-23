import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@/types';
import { categoryLabel, formatGap, statusCopy } from './copy';

// Une seule source pour les phrases de statut : la fiche détail disait
// « Sunny for 5H » quand l'accueil disait « Perd le soleil dans 4h 30m ».

function rec(over: Partial<Recommendation>): Recommendation {
  return {
    venue: {} as Recommendation['venue'],
    sunMatch: 80,
    sunPercentage: 92,
    shadePercentage: 8,
    walkTimeMin: 8,
    distanceM: 600,
    sunWindowStart: '08:00',
    sunWindowEnd: '19:00',
    sunWindowDurationMin: 270,
    confidence: 'HIGH',
    sunArrivesInMin: null,
    sunLeavesInMin: 270,
    arrivesTomorrow: false,
    lastsUntilSunset: false,
    isOpen: true,
    ...over,
  };
}

describe('statusCopy', () => {
  it('au soleil : le compte à rebours et l\'heure de fin', () => {
    expect(statusCopy(rec({}), 'SUN')).toEqual({
      title: 'Perd le soleil dans 4h 30m',
      detail: "92 % de soleil maintenant · jusqu'à 19:00",
    });
  });

  it('ombre jusqu\'au coucher : pas de compte à rebours vers minuit', () => {
    const r = rec({ shadePercentage: 100, sunPercentage: 0, lastsUntilSunset: true, sunLeavesInMin: 302, sunWindowEnd: '19:32' });
    expect(statusCopy(r, 'SHADE')).toEqual({
      title: "À l'ombre jusqu'au coucher du soleil",
      detail: "100 % d'ombre maintenant · encore 5h 2m",
    });
  });

  it('soleil demain : l\'heure, pas « dans 0 min »', () => {
    const r = rec({ sunPercentage: 0, sunLeavesInMin: null, sunArrivesInMin: 525, arrivesTomorrow: true, sunWindowEnd: null });
    expect(statusCopy(r, 'SUN')).toEqual({ title: 'Soleil demain dès 08:00', detail: 'Dans 8h 45m' });
  });

  it('soleil plus tard aujourd\'hui', () => {
    const r = rec({ sunPercentage: 10, sunLeavesInMin: null, sunArrivesInMin: 90, sunWindowStart: '08:00' });
    expect(statusCopy(r, 'SUN')).toEqual({
      title: 'Le soleil arrive dans 1h 30m',
      detail: 'À partir de 08:00 · 10 % maintenant',
    });
  });

  it('rien de prévu : le pourcentage, sans promesse', () => {
    const r = rec({ sunPercentage: 20, sunLeavesInMin: null, sunArrivesInMin: null });
    expect(statusCopy(r, 'SUN')).toEqual({ title: '20 % de soleil maintenant', detail: "Pas de soleil franc d'ici ce soir" });
  });
});

describe('formatGap', () => {
  it('écrit les durées comme on les dit', () => {
    expect(formatGap(45)).toBe('45 min');
    expect(formatGap(120)).toBe('2h');
    expect(formatGap(302)).toBe('5h 2m');
    expect(formatGap(-5)).toBe('0 min');
  });
});

describe('categoryLabel', () => {
  it('traduit chaque catégorie des données', () => {
    for (const c of ['bar', 'beach', 'cafe', 'park', 'restaurant', 'rooftop', 'square', 'viewpoint']) {
      expect(categoryLabel(c)).not.toBe(c);
    }
    expect(categoryLabel('viewpoint')).toBe('Belvédère');
  });
});
