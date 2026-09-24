import { describe, expect, it } from 'vitest';
import { SunsetService } from './SunsetService';
import { VenueService } from './VenueService';
import { formatLisbonTime } from '@/utils/lisbonTime';

const venue = (name: string) => {
  const v = VenueService.getAllVenues().find((x) => x.name === name);
  if (!v) throw new Error(`lieu introuvable : ${name}`);
  return v;
};
const at = (iso: string) => new Date(iso);

describe('le dernier rayon, horizon réel', () => {
  // 23 septembre, coucher officiel 19:32 : la Costa da Caparica regarde
  // l'Atlantique plein ouest, Santa Catarina regarde Lisbonne et ses collines.
  const equinox = at('2026-09-23T12:00:00+01:00');

  it("depuis la plage de Caparica, le soleil touche l'océan après l'heure officielle", () => {
    const r = SunsetService.lastLight(venue('Praia do Paraíso'), equinox);
    expect(r).not.toBeNull();
    expect(r!.over).toBe('water');
    expect(formatLisbonTime(r!.time) >= '19:32').toBe(true);
    expect(formatLisbonTime(r!.time) <= '19:38').toBe(true);
  });

  it('depuis Santa Catarina, il part plus tôt, derrière la ville', () => {
    const r = SunsetService.lastLight(venue('Miradouro de Santa Catarina'), equinox);
    expect(r).not.toBeNull();
    expect(r!.over).not.toBe('water');
    expect(formatLisbonTime(r!.time) < '19:32').toBe(true);
  });

  it('un bar de plage voit la mer depuis son sable, pas depuis son mur', () => {
    expect(SunsetService.lastLight(venue('Koa'), equinox)?.over).toBe('water');
  });

  it("en juin, le coucher est au nord-ouest : depuis Caparica, derrière les collines de Sintra", () => {
    const r = SunsetService.lastLight(venue('Praia do Paraíso'), at('2026-06-21T12:00:00+01:00'));
    expect(r).not.toBeNull();
    expect(r!.over).not.toBe('water');
  });

  it("classe les couchers sur l'eau, les plus tardifs d'abord", () => {
    const list = SunsetService.waterSunsets(VenueService.getAllVenues(), equinox);
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) expect(r.over).toBe('water');
    for (let i = 1; i < list.length; i++) expect(list[i - 1].time.getTime()).toBeGreaterThanOrEqual(list[i].time.getTime());
    expect(list.map((r) => r.venue.name)).toContain('Praia do Paraíso');
  });
});

describe('le moment du coucher', () => {
  const CAPARICA = { lat: 38.6446, lng: -9.2366 };
  const BAIXA = { lat: 38.7107, lng: -9.1365 };

  it("45 min avant, depuis Caparica en mode Soleil : un spot à portée de pied où le soleil touche l'eau", () => {
    const m = SunsetService.moment('SUN', CAPARICA, at('2026-09-23T18:47:00+01:00'));
    expect(m).not.toBeNull();
    expect(m!.picks.length).toBeGreaterThan(0);
    for (const p of m!.picks) {
      expect(p.light.over).toBe('water');
      expect(p.walkMin).toBeLessThanOrEqual(30);
      // On arrive avant le dernier rayon.
      expect(p.light.time.getTime()).toBeGreaterThan(at('2026-09-23T18:47:00+01:00').getTime() + p.walkMin * 60000);
    }
    // Le plus proche d'abord.
    for (let i = 1; i < m!.picks.length; i++) expect(m!.picks[i].walkMin).toBeGreaterThanOrEqual(m!.picks[i - 1].walkMin);
  });

  it("pas de moment en mode Ombre, ni trop tôt, ni une fois le soleil parti", () => {
    expect(SunsetService.moment('SHADE', CAPARICA, at('2026-09-23T18:47:00+01:00'))).toBeNull();
    expect(SunsetService.moment('SUN', CAPARICA, at('2026-09-23T17:00:00+01:00'))).toBeNull();
    expect(SunsetService.moment('SUN', CAPARICA, at('2026-09-23T19:50:00+01:00'))).toBeNull();
  });

  it("depuis la Baixa, aucun spot sur l'eau à portée de pied en septembre : l'écran normal reste", () => {
    expect(SunsetService.moment('SUN', BAIXA, at('2026-09-23T18:47:00+01:00'))).toBeNull();
  });

  it("en juin, pas de coucher sur l'eau depuis Caparica", () => {
    expect(SunsetService.moment('SUN', CAPARICA, at('2026-06-21T20:20:00+01:00'))).toBeNull();
  });

  it("« ailleurs ce soir » : d'autres couchers sur l'eau, hors de la sélection", () => {
    const m = SunsetService.moment('SUN', CAPARICA, at('2026-09-23T18:47:00+01:00'))!;
    const picked = new Set(m.picks.map((p) => p.light.venue.id));
    for (const e of m.elsewhere) expect(picked.has(e.venue.id)).toBe(false);
  });
});
