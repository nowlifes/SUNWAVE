import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@/types';
import { categoryLabel, formatGap, markerLabel, statusCopy, statusShort } from './copy';

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
    endsAtSunset: false,
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

  // À 17:45 l'accueil proposait une place au soleil jusqu'au coucher et
  // titrait « Perd le soleil dans 1h 47m » : on attendait un immeuble, c'était
  // le coucher. Rien ne cache le soleil d'ici là — la carte doit le dire.
  it('soleil jusqu\'au coucher : le dernier rayon, pas « perd le soleil »', () => {
    const r = rec({ sunPercentage: 72, sunLeavesInMin: 107, sunWindowEnd: '19:32', endsAtSunset: true });
    expect(statusCopy(r, 'SUN')).toEqual({
      title: "Au soleil jusqu'au coucher",
      detail: '72 % de soleil maintenant · dernier rayon à 19:32',
    });
  });

  it('les pastilles gardent le temps restant, même jusqu\'au coucher', () => {
    const r = rec({ sunLeavesInMin: 107, sunWindowEnd: '19:32', endsAtSunset: true });
    expect(statusShort(r, 'SUN')).toBe('encore 1h 47m');
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

// La pastille de carte affichait « 88 % » sur tous les lieux en plein ciel :
// un chiffre identique partout ne départage rien. Elle dit ce qui les
// distingue — combien de temps ça dure, ou quand ça commence.
describe('markerLabel', () => {
  it('au soleil : le temps qu\'il reste, compact', () => {
    expect(markerLabel(rec({ sunLeavesInMin: 220 }), 'SUN')).toBe('☀ 3h40');
    expect(markerLabel(rec({ sunLeavesInMin: 120 }), 'SUN')).toBe('☀ 2h');
    expect(markerLabel(rec({ sunLeavesInMin: 34 }), 'SUN')).toBe('☀ 34 min');
  });

  it('à l\'ombre : le temps qu\'il reste, sans le soleil', () => {
    const r = rec({ shadePercentage: 100, sunLeavesInMin: 150 });
    expect(markerLabel(r, 'SHADE')).toBe('2h30');
  });

  it('à l\'ombre jusqu\'au coucher : la profondeur de l\'ombre', () => {
    // Tous les lieux ombragés jusqu'au coucher partagent la même durée —
    // 6 pastilles sur 7 disaient « 5h02 ». Ce qui les distingue, c'est
    // l'ombre elle-même : 100 % sous une arcade, 59 % sous un arbre.
    const r = rec({ shadePercentage: 82, lastsUntilSunset: true, sunLeavesInMin: 302 });
    expect(markerLabel(r, 'SHADE')).toBe('82 %');
  });

  it('plus tard aujourd\'hui : l\'heure d\'arrivée', () => {
    const r = rec({ sunLeavesInMin: null, sunArrivesInMin: 90, sunWindowStart: '16:00' });
    expect(markerLabel(r, 'SUN')).toBe('dès 16h');
  });

  it('demain : le dit', () => {
    const r = rec({ sunLeavesInMin: null, sunArrivesInMin: 525, arrivesTomorrow: true, sunWindowStart: '09:00' });
    expect(markerLabel(r, 'SUN')).toBe('demain 9h');
  });

  it('rien de prévu : le pourcentage', () => {
    const r = rec({ sunPercentage: 20, sunLeavesInMin: null, sunArrivesInMin: null });
    expect(markerLabel(r, 'SUN')).toBe('20 %');
  });
});
