import { afterEach, describe, expect, it } from 'vitest';
import { bandCells, favGroup, nowFraction, untilOf, BAND_FROM, BAND_TO } from './carteDuJour';
import { setLang } from '@/utils/lang';

const flat = (v: number) => Array.from({ length: 24 }, () => v);

describe('bandCells', () => {
  it('une case par heure de 8h à 20h', () => {
    expect(bandCells(flat(0), 22 * 60)).toHaveLength(BAND_TO - BAND_FROM);
  });

  it("grade le soleil en trois intensités, l'ombre en « cool »", () => {
    const e = flat(0);
    e[8] = 10; e[9] = 20; e[10] = 50; e[11] = 90;
    expect(bandCells(e, 22 * 60).slice(0, 4)).toEqual(['cool', 's1', 's2', 's3']);
  });

  it('passe à la nuit une fois le coucher franchi', () => {
    const cells = bandCells(flat(100), 19 * 60 + 33);
    // 19h-20h : le milieu (19:30) précède le coucher de 3 min, encore du jour.
    expect(cells[11]).toBe('s3');
    // 20h-21h : nuit.
    expect(cells[12]).toBe('night');
  });
});

describe('nowFraction', () => {
  it('borne la position du trait « maintenant » à la règle', () => {
    expect(nowFraction(8 * 60)).toBe(0);
    expect(nowFraction(14 * 60 + 30)).toBe(0.5);
    expect(nowFraction(23 * 60)).toBe(1);
    expect(nowFraction(3 * 60)).toBe(0);
  });
});

describe('favGroup', () => {
  const rec = (over: Partial<Parameters<typeof favGroup>[0]>) => ({
    sunPercentage: 0,
    sunLeavesInMin: null,
    sunArrivesInMin: null,
    ...over,
  });

  it('« bons maintenant » : au soleil et la fenêtre court encore', () => {
    expect(favGroup(rec({ sunPercentage: 80, sunLeavesInMin: 45 }), flat(80))).toBe('now');
  });

  it('« plus tard » : le soleil arrive, aujourd’hui ou demain', () => {
    expect(favGroup(rec({ sunArrivesInMin: 90 }), flat(80))).toBe('later');
  });

  it("« plus tard » aussi : soleil ce matin, fini maintenant", () => {
    const e = flat(0);
    e[9] = 90; e[10] = 90;
    expect(favGroup(rec({}), e)).toBe('later');
  });

  it('« pas de soleil aujourd’hui » : aucune heure franche de la journée', () => {
    expect(favGroup(rec({ sunArrivesInMin: 24 * 60 }), flat(20))).toBe('off');
  });
});

describe('untilOf', () => {
  const base = {
    sunPercentage: 80, shadePercentage: 20, sunLeavesInMin: 60, sunArrivesInMin: null,
    sunWindowStart: '15:00', sunWindowEnd: '18:10', arrivesTomorrow: false, endsAtSunset: false, lastsUntilSunset: false,
  };

  it("au soleil : l'heure de fin là où un menu met le prix", () => {
    expect(untilOf(base, 'SUN')).toEqual({ label: "jusqu'à", value: '18:10', cool: false });
  });

  it('jusqu’au coucher quand le coucher ferme la fenêtre', () => {
    expect(untilOf({ ...base, endsAtSunset: true }, 'SUN').value).toBe('coucher');
  });

  it('pas encore : l’heure d’arrivée, en froid', () => {
    const r = { ...base, sunPercentage: 10, sunLeavesInMin: null, sunArrivesInMin: 40, sunWindowStart: '18:30' };
    expect(untilOf(r, 'SUN')).toEqual({ label: 'dès', value: '18:30', cool: true });
  });

  it('à l’ombre, dit « au frais »', () => {
    const r = { ...base, sunPercentage: 0, shadePercentage: 100 };
    expect(untilOf(r, 'SHADE')).toEqual({ label: "au frais jusqu'à", value: '18:10', cool: true });
  });
});

describe('untilOf en anglais', () => {
  afterEach(() => setLang('fr'));
  const base = {
    sunPercentage: 80, shadePercentage: 20, sunLeavesInMin: 60, sunArrivesInMin: null,
    sunWindowStart: '15:00', sunWindowEnd: '18:10', arrivesTomorrow: false, endsAtSunset: false, lastsUntilSunset: false,
  };

  it('until / sunset / tomorrow from / in the shade', () => {
    setLang('en');
    expect(untilOf(base, 'SUN')).toEqual({ label: 'until', value: '18:10', cool: false });
    expect(untilOf({ ...base, endsAtSunset: true }, 'SUN').value).toBe('sunset');
    const later = { ...base, sunPercentage: 10, sunLeavesInMin: null, sunArrivesInMin: 900, sunWindowStart: '09:00', arrivesTomorrow: true };
    expect(untilOf(later, 'SUN').label).toBe('tomorrow from');
    expect(untilOf({ ...base, sunPercentage: 0, shadePercentage: 100 }, 'SHADE').label).toBe('in the shade until');
  });
});
