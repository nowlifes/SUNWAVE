import { describe, expect, it } from 'vitest';
import { RecommendationService } from './RecommendationService';
import { SunService } from './SunService';

const LISBON = { lat: 38.7223, lng: -9.1393 };
const at = (iso: string) => new Date(iso);

describe('mode Ombre', () => {
  // L'ombre valait 100 − soleil, et la nuit le soleil vaut 0 : chaque lieu
  // « gardait l'ombre jusqu'à 23:59 ». Après le coucher, l'ombre n'est plus
  // une information — la fenêtre doit s'arrêter là.
  const date = at('2026-09-23T14:30:00+01:00');
  const recs = RecommendationService.getRecommendations('SHADE', LISBON, date, [], undefined, 100);
  const minutesToSunset = Math.round((SunService.getSunset(date).getTime() - date.getTime()) / 60000);

  it("n'annonce jamais d'ombre au-delà du coucher du soleil", () => {
    for (const r of recs) {
      if (r.sunLeavesInMin !== null) expect(r.sunLeavesInMin).toBeLessThanOrEqual(minutesToSunset);
      expect(r.sunWindowEnd).not.toBe('23:59');
    }
  });

  it('dit quand une ombre tient jusqu\'au coucher', () => {
    // Seulement les lieux déjà à l'ombre : ceux où elle arrive plus tard
    // n'ont pas de « perd l'ombre dans ».
    const untilSunset = recs.filter((r) => r.lastsUntilSunset && r.sunLeavesInMin !== null);
    expect(untilSunset.length).toBeGreaterThan(0);
    for (const r of untilSunset) expect(r.sunLeavesInMin).toBe(minutesToSunset);
  });
});

describe('mode Soleil, la nuit', () => {
  // À 23h15 plus rien n'arrive « aujourd'hui » : le prochain soleil est
  // demain matin, et c'est la seule chose utile à dire.
  const date = at('2026-09-23T23:15:00+01:00');
  const answers = RecommendationService.getAnswerList('SUN', LISBON, date, [], undefined, 6);

  it('annonce le soleil de demain matin', () => {
    const top = answers[0];
    expect(top.arrivesTomorrow).toBe(true);
    // Lever vers 07:20 à Lisbonne fin septembre : entre 8 h et 11 h d'attente.
    expect(top.sunArrivesInMin).toBeGreaterThanOrEqual(8 * 60);
    expect(top.sunArrivesInMin).toBeLessThanOrEqual(11 * 60);
    expect(top.sunWindowStart).toMatch(/^(0[7-9]|1[01]):\d\d$/);
  });

  it('classe par premier soleil du lendemain', () => {
    const waits = answers.map((r) => r.sunArrivesInMin ?? Infinity);
    expect([...waits].sort((a, b) => a - b)).toEqual(waits);
  });
});

describe('mode Soleil, en journée', () => {
  it("ne parle pas de demain quand le soleil est là aujourd'hui", () => {
    const date = at('2026-09-23T14:30:00+01:00');
    const answers = RecommendationService.getAnswerList('SUN', LISBON, date, [], undefined, 6);
    for (const r of answers) expect(r.arrivesTomorrow).toBe(false);
  });
});

describe('fenêtre de soleil au quart d\'heure', () => {
  // Le moteur tournait à l'heure, échantillonnée à hh:30 : l'heure du coucher
  // (19:25) tombait à 0, et tout lieu en plein ciel « perdait le soleil à
  // 19:00 ». Sur la carte, 29 pastilles sur 49 disaient la même chose.
  const date = at('2026-09-23T14:30:00+01:00');
  const recs = RecommendationService.getRecommendations('SUN', LISBON, date, [], undefined, 100);
  const sunny = recs.filter((r) => r.sunLeavesInMin !== null);
  const sunset = SunService.getSunset(date);
  const sunsetHHMM = new Intl.DateTimeFormat('fr-FR', {
    timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit',
  }).format(sunset);
  const minutesToSunset = Math.round((sunset.getTime() - date.getTime()) / 60000);

  it('un lieu en plein ciel garde le soleil jusqu\'au coucher, pas jusqu\'à 19:00', () => {
    expect(sunny.some((r) => r.sunWindowEnd === sunsetHHMM)).toBe(true);
  });

  it('ne promet jamais de soleil après le coucher', () => {
    for (const r of sunny) expect(r.sunLeavesInMin!).toBeLessThanOrEqual(minutesToSunset);
  });

  it('les fins tombent au quart d\'heure, ou au coucher', () => {
    for (const r of sunny) {
      const m = Number(r.sunWindowEnd!.slice(3));
      expect(r.sunWindowEnd === sunsetHHMM || m % 15 === 0).toBe(true);
    }
  });

  it('les lieux ne finissent plus presque tous à la même heure', () => {
    const counts = new Map<string, number>();
    for (const r of sunny) counts.set(r.sunWindowEnd!, (counts.get(r.sunWindowEnd!) ?? 0) + 1);
    expect(counts.size).toBeGreaterThan(5);
  });
});
