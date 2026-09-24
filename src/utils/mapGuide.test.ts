import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@/types';
import {
  WALK_RING_M,
  betterNeighbour,
  hereSentence,
  hereWindow,
  hintForVisit,
  initialFrame,
  nextVisit,
  pickHeadline,
  pillLabel,
  sheetHeadlines,
  shortVenueName,
} from './mapGuide';

// La carte doit s'expliquer en jouant, sans devenir un manuel : chaque phrase
// ici est ce qui s'affiche, donc chaque test fige une phrase lue par quelqu'un.

function rec(over: Partial<Recommendation> & { name?: string }): Recommendation {
  const { name = 'Miradouro de Santa Catarina', ...rest } = over;
  return {
    venue: { id: name, name, latitude: 38.71, longitude: -9.14 } as Recommendation['venue'],
    sunMatch: 80,
    sunPercentage: 92,
    shadePercentage: 8,
    walkTimeMin: 8,
    distanceM: 600,
    sunWindowStart: '08:00',
    sunWindowEnd: '19:24',
    sunWindowDurationMin: 270,
    confidence: 'HIGH',
    sunArrivesInMin: null,
    sunLeavesInMin: 164,
    arrivesTomorrow: false,
    lastsUntilSunset: false,
    endsAtSunset: false,
    isOpen: true,
    ...rest,
  };
}

/** 96 quarts d'heure : soleil de `from` (inclus) à `to` (exclus), en minutes. */
function quarters(from: number, to: number, value = 90): number[] {
  return Array.from({ length: 96 }, (_, q) => (q * 15 >= from && q * 15 < to ? value : 0));
}

describe('hintForVisit — une astuce, deux visites, puis silence', () => {
  it('apprend le curseur à la 1re visite, le toucher à la 2e', () => {
    expect(hintForVisit(1, 'SUN')).toBe("Glisse l'heure pour voir le soleil bouger");
    expect(hintForVisit(1, 'SHADE')).toBe("Glisse l'heure pour voir l'ombre bouger");
    expect(hintForVisit(2, 'SUN')).toBe("Touche la carte n'importe où");
  });
  it('se tait ensuite', () => {
    expect(hintForVisit(3, 'SUN')).toBeNull();
    expect(hintForVisit(40, 'SHADE')).toBeNull();
    expect(hintForVisit(0, 'SUN')).toBeNull();
  });
  it('compte les visites même quand le stockage est vide ou abîmé', () => {
    expect(nextVisit(null)).toBe(1);
    expect(nextVisit('1')).toBe(2);
    expect(nextVisit("n'importe quoi")).toBe(1);
    expect(nextVisit('-4')).toBe(1);
  });
});

describe('sheetHeadlines — le titre suit le contexte réel', () => {
  const base = { mode: 'SUN' as const, count: 7, nowMin: 16 * 60 + 40, sunriseMin: 7 * 60 + 20, sunsetMin: 19 * 60 + 27, isNow: true };

  it('dit combien de lieux sont au soleil à pied', () => {
    expect(sheetHeadlines(base)[0]).toBe('7 lieux au soleil à pied');
    expect(sheetHeadlines({ ...base, mode: 'SHADE' })[0]).toBe("7 lieux à l'ombre à pied");
  });
  it('accorde au singulier', () => {
    expect(sheetHeadlines({ ...base, count: 1 })[0]).toBe('1 lieu au soleil à pied');
  });
  it('parle du coucher quand il approche, en mode Soleil', () => {
    expect(sheetHeadlines({ ...base, nowMin: 18 * 60 + 30 })[0]).toBe('Coucher à 19:27 · 7 lieux au soleil');
  });
  it("nomme l'heure choisie quand ce n'est pas maintenant", () => {
    expect(sheetHeadlines({ ...base, isNow: false, nowMin: 11 * 60 })[0]).toBe('À 11:00, 7 lieux au soleil');
  });
  it('la nuit, dit quand le soleil revient', () => {
    expect(sheetHeadlines({ ...base, nowMin: 22 * 60 })[0]).toBe('Nuit · le soleil revient à 07:20');
  });
  it("ne promet rien quand il n'y a rien", () => {
    expect(sheetHeadlines({ ...base, count: 0 })[0]).toBe('Pas de soleil franc à pied');
    expect(sheetHeadlines({ ...base, count: 0, mode: 'SHADE' })[0]).toBe("Pas d'ombre franche à pied");
  });
  it('propose toujours au moins deux formulations', () => {
    for (const ctx of [base, { ...base, count: 0 }, { ...base, nowMin: 22 * 60 }, { ...base, mode: 'SHADE' as const }]) {
      expect(new Set(sheetHeadlines(ctx)).size).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("pickHeadline — jamais deux fois la même accroche d'affilée", () => {
  it("prend la plus juste, sauf si c'est celle d'avant", () => {
    expect(pickHeadline(['A', 'B'], null)).toBe('A');
    expect(pickHeadline(['A', 'B'], 'A')).toBe('B');
    expect(pickHeadline(['A', 'B'], 'B')).toBe('A');
  });
  it("se résigne quand il n'y a qu'une phrase", () => {
    expect(pickHeadline(['A'], 'A')).toBe('A');
  });
});

describe("hereWindow — ce qu'il se passe à l'endroit touché", () => {
  const sunrise = 7 * 60 + 20;
  const sunset = 19 * 60 + 27;

  it("au soleil : jusqu'au quart d'heure où il part", () => {
    const w = hereWindow(quarters(9 * 60, 17 * 60 + 45), 'SUN', 16 * 60 + 40, sunrise, sunset);
    expect(w).toEqual({ state: 'in', untilMin: 17 * 60 + 45 });
    expect(hereSentence(w, 'SUN')).toEqual({ lead: "Ici : soleil jusqu'à", time: '17:45' });
  });
  it("le soleil jusqu'au coucher s'arrête au coucher, pas après", () => {
    const w = hereWindow(quarters(9 * 60, 24 * 60), 'SUN', 16 * 60, sunrise, sunset);
    expect(w).toEqual({ state: 'in', untilMin: sunset });
  });
  it("à l'ombre : jusqu'à ce que le soleil arrive", () => {
    const w = hereWindow(quarters(17 * 60, 18 * 60), 'SUN', 16 * 60 + 40, sunrise, sunset);
    expect(w).toEqual({ state: 'out', untilMin: 17 * 60 });
    expect(hereSentence(w, 'SUN')).toEqual({ lead: "Ici : ombre jusqu'à", time: '17:00' });
  });
  it("à l'ombre pour de bon : jusqu'au coucher", () => {
    const w = hereWindow(quarters(9 * 60, 12 * 60), 'SUN', 16 * 60 + 40, sunrise, sunset);
    expect(w).toEqual({ state: 'out', untilMin: null });
    expect(hereSentence(w, 'SUN')).toEqual({ lead: "Ici : ombre jusqu'au coucher", time: null });
  });
  it("en mode Ombre, l'ombre est ce qu'on cherche", () => {
    const w = hereWindow(quarters(9 * 60, 17 * 60), 'SHADE', 16 * 60 + 40, sunrise, sunset);
    expect(w).toEqual({ state: 'out', untilMin: 17 * 60 });
    expect(hereSentence(w, 'SHADE')).toEqual({ lead: "Ici : soleil jusqu'à", time: '17:00' });
    const shaded = hereWindow(quarters(17 * 60, 18 * 60), 'SHADE', 16 * 60 + 40, sunrise, sunset);
    expect(hereSentence(shaded, 'SHADE')).toEqual({ lead: "Ici : ombre jusqu'à", time: '17:00' });
  });
  it("la nuit ne se fait passer ni pour du soleil ni pour de l'ombre", () => {
    const w = hereWindow(quarters(9 * 60, 17 * 60), 'SUN', 22 * 60, sunrise, sunset);
    expect(w).toEqual({ state: 'night', untilMin: sunrise });
    expect(hereSentence(w, 'SUN')).toEqual({ lead: 'Ici : nuit, soleil à', time: '07:20' });
  });
});

describe('betterNeighbour — le voisin qui garde le soleil plus longtemps', () => {
  const now = 16 * 60 + 40;
  it('propose le lieu proche au soleil le plus tard', () => {
    const a = rec({ name: 'A', walkTimeMin: 4, sunLeavesInMin: 164 });
    const b = rec({ name: 'B', walkTimeMin: 6, sunLeavesInMin: 80 });
    expect(betterNeighbour([b, a], { state: 'in', untilMin: 17 * 60 + 40 }, now)?.venue.name).toBe('A');
  });
  it('se tait si le voisin ne fait pas vraiment mieux', () => {
    const a = rec({ name: 'A', walkTimeMin: 4, sunLeavesInMin: 70 });
    expect(betterNeighbour([a], { state: 'in', untilMin: 17 * 60 + 40 }, now)).toBeNull();
  });
  it('ne fait pas traverser la ville', () => {
    const far = rec({ name: 'Loin', walkTimeMin: 25, sunLeavesInMin: 164 });
    expect(betterNeighbour([far], { state: 'out', untilMin: null }, now)).toBeNull();
  });
  it('ignore les lieux pas encore au soleil et les lieux fermés', () => {
    const later = rec({ name: 'Plus tard', sunLeavesInMin: null, sunArrivesInMin: 30 });
    const shut = rec({ name: 'Fermé', isOpen: false });
    expect(betterNeighbour([later, shut], { state: 'out', untilMin: null }, now)).toBeNull();
  });
  it("la nuit, personne n'est mieux", () => {
    expect(betterNeighbour([rec({})], { state: 'night', untilMin: 7 * 60 }, now)).toBeNull();
  });
});

describe('initialFrame — cadrer sur ce qui est à pied', () => {
  const center = { lat: 38.7107, lng: -9.1415 };
  it("couvre l'anneau de 10 min à pied", () => {
    const [[w, s], [e, n]] = initialFrame(center, [], 0);
    // ~810 m de rayon : un peu plus de 0,007° en latitude.
    expect(WALK_RING_M).toBe(810);
    expect(n - center.lat).toBeCloseTo(810 / 110540, 4);
    expect(center.lat - s).toBeCloseTo(810 / 110540, 4);
    expect(e - center.lng).toBeGreaterThan(0.009);
    expect(center.lng - w).toBeGreaterThan(0.009);
  });
  it("s'élargit jusqu'aux lieux les plus proches quand l'anneau est vide", () => {
    const far = [
      { lat: 38.73, lng: -9.1415 },
      { lat: 38.74, lng: -9.1415 },
      { lat: 38.90, lng: -9.1415 },
    ];
    const [, [, n]] = initialFrame(center, far, 2);
    expect(n).toBeCloseTo(38.74, 6);
  });
  it("ne s'élargit pas quand l'anneau suffit", () => {
    const near = Array.from({ length: 6 }, (_, i) => ({ lat: center.lat + 0.001 * i, lng: center.lng }));
    const [, [, n]] = initialFrame(center, [...near, { lat: 38.8, lng: -9.14 }], 6);
    expect(n).toBeCloseTo(center.lat + 810 / 110540, 4);
  });
});

describe('shortVenueName — la pastille dit où, en peu de lettres', () => {
  it('retire le type de lieu que la carte montre déjà', () => {
    expect(shortVenueName('Miradouro de Santa Catarina')).toBe('Santa Catarina');
    expect(shortVenueName('Largo do Carmo')).toBe('Carmo');
    expect(shortVenueName('Jardim da Estrela')).toBe('Estrela');
  });
  it('coupe au mot, sans laisser traîner « de »', () => {
    expect(shortVenueName('Miradouro de São Pedro de Alcântara')).toBe('São Pedro');
  });
  it('garde les noms courts tels quels', () => {
    expect(shortVenueName('Sea Me')).toBe('Sea Me');
    expect(shortVenueName('Hello, Kristof')).toBe('Hello, Kristof');
  });
});

describe('pillLabel — nom · heure, ou pastille discrète', () => {
  it("au soleil : l'heure où il part", () => {
    expect(pillLabel(rec({}))).toEqual({ name: 'Santa Catarina', time: '19:24', inIt: true });
  });
  it("pas dans ce qu'on cherche : le nom seul, sans heure", () => {
    expect(pillLabel(rec({ sunLeavesInMin: null, sunArrivesInMin: 40 }))).toEqual({ name: 'Santa Catarina', time: null, inIt: false });
  });
});
