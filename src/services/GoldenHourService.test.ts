import { describe, it, expect } from 'vitest';
import * as SunCalc from 'suncalc';
import {
  GOLDEN_ELEVATION_DEG,
  LEAD_MIN,
  SEND_WINDOW_MIN,
  goldenHourStart,
  goldenSendTime,
  lisbonDayKey,
  shouldSendNow,
  goldenMessage,
  pickForGoldenHour,
  pickForNextGoldenHour,
} from './GoldenHourService';

const LISBON = { lat: 38.7223, lng: -9.1393 };
const MIN = 60_000;

// Aux extrêmes du coucher (17:45 en décembre, 21:15 en juin) et à l'équinoxe.
const DAYS = [new Date('2026-06-21T10:00:00Z'), new Date('2026-09-25T10:00:00Z'), new Date('2026-12-21T10:00:00Z')];

describe('GoldenHourService — heure', () => {
  it('définit la golden hour par une altitude solaire de 6°', () => {
    expect(GOLDEN_ELEVATION_DEG).toBe(6);
    expect(LEAD_MIN).toBe(20);
  });

  it.each(DAYS)('le soleil est à 6° au début de la golden hour (%s)', (day) => {
    const start = goldenHourStart(day);
    expect(start).not.toBeNull();
    // suncalc 2.x rend l'altitude en degrés (voir SunService).
    const alt = SunCalc.getPosition(start as Date, LISBON.lat, LISBON.lng).altitude;
    expect(Math.abs(alt - GOLDEN_ELEVATION_DEG)).toBeLessThan(0.1);
  });

  it.each(DAYS)('concorde à la minute avec suncalc.goldenHour (copie côté api) (%s)', (day) => {
    const ref = SunCalc.getTimes(day, LISBON.lat, LISBON.lng).goldenHour;
    expect(Math.abs((goldenHourStart(day) as Date).getTime() - (ref as Date).getTime())).toBeLessThan(MIN);
  });

  it('envoi = début − 20 min, et la golden hour est en soirée', () => {
    const day = DAYS[1];
    const start = goldenHourStart(day) as Date;
    expect((start.getTime() - (goldenSendTime(day) as Date).getTime()) / MIN).toBe(20);
    expect(start.getUTCHours()).toBeGreaterThanOrEqual(17);
  });

  it('lisbonDayKey suit le jour de Lisbonne, pas celui de UTC', () => {
    expect(lisbonDayKey(new Date('2026-06-21T23:30:00Z'))).toBe('2026-06-22'); // 00:30 WEST
    expect(lisbonDayKey(new Date('2026-12-21T23:30:00Z'))).toBe('2026-12-21');
  });
});

describe('GoldenHourService — shouldSendNow', () => {
  const at = goldenSendTime(DAYS[1]) as Date;
  const key = lisbonDayKey(at);

  it('vrai à l’heure d’envoi', () => {
    expect(shouldSendNow(at, null)).toBe(true);
  });
  it('fenêtre de 15 min autour de l’heure d’envoi', () => {
    expect(SEND_WINDOW_MIN).toBe(15);
    expect(shouldSendNow(new Date(at.getTime() - 7 * MIN), null)).toBe(true);
    expect(shouldSendNow(new Date(at.getTime() + 7 * MIN), null)).toBe(true);
    expect(shouldSendNow(new Date(at.getTime() - 8 * MIN), null)).toBe(false);
    expect(shouldSendNow(new Date(at.getTime() + 8 * MIN), null)).toBe(false);
  });
  it('une seule fois par jour', () => {
    expect(shouldSendNow(at, key)).toBe(false);
    expect(shouldSendNow(at, '2026-09-24')).toBe(true);
  });
  it('jamais la nuit ni en pleine journée', () => {
    expect(shouldSendNow(new Date('2026-09-25T02:00:00Z'), null)).toBe(false);
    expect(shouldSendNow(new Date('2026-09-25T12:00:00Z'), null)).toBe(false);
    expect(shouldSendNow(new Date('2026-09-25T23:00:00Z'), null)).toBe(false);
  });
  it('un cron toutes les 15 min touche la fenêtre une et une seule fois', () => {
    for (const d of DAYS) {
      const send = (goldenSendTime(d) as Date).getTime();
      let hits = 0;
      // grille de ticks à :00 :15 :30 :45
      const start = Math.floor((send - 60 * MIN) / (15 * MIN)) * 15 * MIN;
      for (let t = start; t <= send + 60 * MIN; t += 15 * MIN) {
        if (shouldSendNow(new Date(t), null)) hits++;
      }
      expect(hits).toBe(1);
    }
  });
});

describe('GoldenHourService — message', () => {
  it('titre et corps avec lieu, marche et heure', () => {
    const m = goldenMessage({ name: 'Miradouro da Graça', walkMin: 12, until: '19:48' });
    expect(m.title).toBe('Golden hour dans 20 min');
    expect(m.body).toBe('Miradouro da Graça : 12 min à pied, soleil jusqu’à 19:48.');
  });
  it('sans lieu connu : reste neutre', () => {
    const m = goldenMessage(null);
    expect(m.title).toBe('Golden hour dans 20 min');
    expect(m.body.length).toBeGreaterThan(10);
  });
  it('ne pousse jamais à quitter un lieu', () => {
    const texts = [goldenMessage({ name: 'X', walkMin: 3, until: '20:00' }), goldenMessage(null)].map((m) =>
      `${m.title} ${m.body}`.toLowerCase()
    );
    for (const t of texts) expect(t).not.toMatch(/quitte|pars |file |dépêche|vite|bouge|lève-toi/);
  });
});

describe('GoldenHourService — prochaine notification', () => {
  it('avant l’heure d’envoi : le lieu d’aujourd’hui', () => {
    const pick = pickForNextGoldenHour(new Date('2026-09-25T09:00:00Z'));
    expect(pick?.day).toBe('2026-09-25');
  });
  it('après l’heure d’envoi : le lieu de demain', () => {
    const pick = pickForNextGoldenHour(new Date('2026-09-25T20:00:00Z'));
    expect(pick?.day).toBe('2026-09-26');
  });
});

describe('GoldenHourService — choix du lieu', () => {
  it('reprend la reco Soleil de Lisbonne centre à l’heure de la golden hour', () => {
    const pick = pickForGoldenHour(DAYS[1]);
    expect(pick).not.toBeNull();
    expect((pick as { name: string }).name.length).toBeGreaterThan(0);
    expect((pick as { walkMin: number }).walkMin).toBeGreaterThanOrEqual(0);
    expect((pick as { until: string }).until).toMatch(/^\d{2}:\d{2}$/);
  });
});
