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
