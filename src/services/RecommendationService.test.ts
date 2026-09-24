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

describe('mode Soleil', () => {
  // La fenêtre peut se fermer sur un obstacle ou sur le coucher : la carte ne
  // dit pas la même chose dans les deux cas. Mesuré le 23/09 à 17:45 :
  // Praça do Comércio tient jusqu'au coucher, Praça da Figueira passe à
  // l'ombre à 19:15.
  const date = at('2026-09-23T17:45:00+01:00');
  const recs = RecommendationService.getRecommendations('SUN', LISBON, date, [], undefined, 100);
  const byName = (n: string) => recs.find((r) => r.venue.name === n)!;

  it('sait quand c\'est le coucher qui ferme la fenêtre', () => {
    expect(byName('Praça do Comércio').endsAtSunset).toBe(true);
    expect(byName('Praça da Figueira').endsAtSunset).toBe(false);
  });

  it('ne prétend jamais au coucher une fenêtre qui finit avant', () => {
    const sunsetMin = Math.round((SunService.getSunset(date).getTime() - date.getTime()) / 60000);
    for (const r of recs) {
      if (r.sunLeavesInMin !== null && r.sunLeavesInMin < sunsetMin) expect(r.endsAtSunset, r.venue.name).toBe(false);
    }
  });
});

describe('mode Ombre sous forte chaleur', () => {
  // 15 juillet, 13 h, 31 °C : Café Janis, à l'ombre pour 1 h 15 seulement,
  // passait devant Comoba, à l'ombre jusqu'au coucher. Par cette chaleur,
  // une ombre qui tombe en plein après-midi ne vaut pas une ombre qui tient.
  const date = at('2026-07-15T13:00:00+01:00');
  const hot = { temperature: 31, condition: 'clear' as const, rainProbability: 0, windSpeedKmh: 10, description: '' };
  const answers = RecommendationService.getAnswerList('SHADE', LISBON, date, [], hot, 6);

  it("une ombre qui tient passe devant une ombre aussi dense qui tombe dans l'heure et demie", () => {
    answers.forEach((short, i) => {
      if (short.sunLeavesInMin === null || short.sunLeavesInMin > 90) return;
      for (const long of answers.slice(i + 1)) {
        const holds = long.sunLeavesInMin !== null && long.sunLeavesInMin >= 240;
        if (holds && long.shadePercentage >= short.shadePercentage) {
          throw new Error(`${short.venue.name} (${short.sunLeavesInMin} min) devant ${long.venue.name} (${long.sunLeavesInMin} min)`);
        }
      }
    });
  });

  // Comoba replacé sur sa rue, le cas réel : Café Janis, 100 % d'ombre pour
  // 1 h 15, passait devant Dear Breakfast (60 %) et Comoba (50 %), à l'ombre
  // jusqu'au coucher — parce qu'il est plus près. À 31 °C, une ombre qui
  // lâche à 14 h 15 remet au soleil au pire moment.
  it('en tête : une ombre qui tient tout l\'après-midi', () => {
    expect(answers[0].sunLeavesInMin).toBeGreaterThanOrEqual(240);
  });
});

describe('mode Ombre et hauteurs estimées', () => {
  // L'ombre ne vient que des bâtiments. Quand aucune de leurs hauteurs n'est
  // mesurée autour d'un lieu, son ombre est une supposition : elle passe
  // derrière une ombre calculée sur des hauteurs relevées.
  const date = at('2026-07-15T15:00:00+01:00');
  const find = (mode: 'SUN' | 'SHADE', name: string) =>
    RecommendationService.getRecommendations(mode, LISBON, date, [], undefined, 100).find((r) => r.venue.name === name)!;

  it('toutes les hauteurs estimées : confiance faible en mode Ombre', () => {
    expect(find('SHADE', 'Rio Maravilha').confidence).toBe('LOW');
    expect(find('SHADE', 'Biblioteca LX').confidence).toBe('LOW');
  });

  it('hauteurs en partie mesurées : la confiance du lieu reste', () => {
    expect(find('SHADE', 'Copenhagen Coffee Lab').confidence).toBe(find('SHADE', 'Copenhagen Coffee Lab').venue.confidence);
  });

  it('le mode Soleil garde la confiance du lieu', () => {
    expect(find('SUN', 'Rio Maravilha').confidence).toBe('HIGH');
  });
});

describe('au-delà de la marche', () => {
  // Depuis la Costa da Caparica, en mode Ombre, la liste envoyait à Lisbonne,
  // 11 km et un fleuve plus loin : la plage n'a pas d'ombre de bâtiment, un
  // café de la Baixa à 100 % gagnait malgré la distance. Tant qu'un lieu
  // ouvert est à portée de pied, la réponse reste à portée de pied.
  const CAPARICA = { lat: 38.6446, lng: -9.2366 };
  const hot = { temperature: 30, condition: 'clear' as const, rainProbability: 0, windSpeedKmh: 10, description: '' };

  for (const mode of ['SUN', 'SHADE'] as const) {
    for (const hour of [9, 12, 15, 18]) {
      it(`${mode} à ${hour} h depuis Caparica : rien à plus de 30 min à pied`, () => {
        const date = at(`2026-09-23T${String(hour).padStart(2, '0')}:00:00+01:00`);
        const answers = RecommendationService.getAnswerList(mode, CAPARICA, date, [], hot, 6);
        expect(answers.length).toBeGreaterThan(0);
        for (const r of answers) expect(r.walkTimeMin, r.venue.name).toBeLessThanOrEqual(30);
      });
    }
  }
});

describe('« va là » veut dire maintenant', () => {
  // Depuis la Baixa, 13 h, 31 °C : Copenhagen Coffee Lab (40 % d'ombre) prenait
  // la tête sous « Va là pour l'ombre » tout en affichant « l'ombre arrive dans
  // 4 h 15 » — la liste comptait 40 % comme de l'ombre, la fenêtre 50 %.
  const BAIXA = { lat: 38.7107, lng: -9.1365 };
  const date = at('2026-07-15T13:00:00+01:00');
  const hot = { temperature: 31, condition: 'clear' as const, rainProbability: 0, windSpeedKmh: 10, description: '' };

  for (const mode of ['SUN', 'SHADE'] as const) {
    it(`${mode} : un lieu en tête qui y est déjà n'annonce pas une arrivée`, () => {
      const answers = RecommendationService.getAnswerList(mode, BAIXA, date, [], hot, 6);
      const nowIn = answers.filter((r) => r.sunArrivesInMin === 0 || r.sunLeavesInMin !== null);
      if (nowIn.length === 0) return;
      for (const r of answers) expect(r.sunArrivesInMin ?? 0, r.venue.name).toBeLessThanOrEqual(0);
    });
  }
});
