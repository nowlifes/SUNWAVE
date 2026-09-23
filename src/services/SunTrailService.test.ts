import { describe, expect, it } from 'vitest';
import { RecommendationService } from './RecommendationService';
import { SunService } from './SunService';
import { SunTrailService } from './SunTrailService';

const LISBON = { lat: 38.7223, lng: -9.1393 };
const date = new Date('2026-09-23T14:30:00+01:00');
const sunset = SunService.getSunset(date);
const recs = RecommendationService.getRecommendations('SUN', LISBON, date, [], undefined, 100);
const sunnyOpen = recs.filter((r) => r.isOpen && r.sunLeavesInMin !== null);

describe('suivre le soleil', () => {
  // Un lieu qui perd le soleil tôt — c'est là que le parcours a une raison
  // d'être — mais où il en reste 30 min une fois arrivé : le plus tôt de tous
  // (15:00 à 12 min de marche) n'en laisse que 18, et n'est pas une étape.
  const early = [...sunnyOpen]
    .filter((r) => r.sunLeavesInMin! - r.walkTimeMin >= 45)
    .sort((a, b) => a.sunLeavesInMin! - b.sunLeavesInMin!)[0];
  const trail = SunTrailService.plan(early, LISBON, date);

  it('prolonge un lieu qui perd le soleil tôt', () => {
    expect(trail).not.toBeNull();
    expect(trail!.stops.length).toBeGreaterThanOrEqual(2);
    expect(trail!.stops[0].rec.venue.id).toBe(early.venue.id);
  });

  it('chaque étape est ouverte et au soleil à l\'arrivée, pour au moins 30 min', () => {
    for (const s of trail!.stops) {
      expect(s.rec.isOpen).toBe(true);
      expect(s.leaveAt.getTime() - s.arriveAt.getTime()).toBeGreaterThanOrEqual(30 * 60000);
    }
  });

  it('on part quand le soleil part, on arrive après la marche', () => {
    const [first, ...rest] = trail!.stops;
    expect(first.arriveAt.getTime()).toBe(date.getTime() + first.walkMin * 60000);
    let prev = first;
    for (const s of rest) {
      expect(s.walkMin).toBeLessThanOrEqual(20);
      expect(s.arriveAt.getTime()).toBe(prev.leaveAt.getTime() + s.walkMin * 60000);
      expect(s.leaveAt.getTime()).toBeGreaterThan(prev.leaveAt.getTime());
      prev = s;
    }
  });

  it('ne dépasse jamais le coucher, ne repasse jamais au même endroit', () => {
    for (const s of trail!.stops) expect(s.leaveAt.getTime()).toBeLessThanOrEqual(sunset.getTime());
    const ids = trail!.stops.map((s) => s.rec.venue.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('se tait quand le premier lieu tient déjà jusqu\'au coucher', () => {
    const late = [...sunnyOpen].sort((a, b) => b.sunLeavesInMin! - a.sunLeavesInMin!)[0];
    expect(SunTrailService.plan(late, LISBON, date)).toBeNull();
  });

  it('se tait la nuit', () => {
    const night = new Date('2026-09-23T23:15:00+01:00');
    const pick = RecommendationService.getAnswerList('SUN', LISBON, night, [], undefined, 1)[0];
    expect(SunTrailService.plan(pick, LISBON, night)).toBeNull();
  });
});
