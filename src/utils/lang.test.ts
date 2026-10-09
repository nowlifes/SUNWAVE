import { afterEach, describe, expect, it } from 'vitest';
import { detectLang, getLang, setLang, subscribeLang, tr } from './lang';
import { categoryLabel, markerLabel, statusCopy, statusShort, travelLabel, venueCountLine } from './copy';
import type { Recommendation } from '@/types';

afterEach(() => setLang('fr'));

describe('detectLang', () => {
  it('garde le choix enregistré, quelle que soit la langue du téléphone', () => {
    expect(detectLang('en', ['fr-FR'])).toBe('en');
    expect(detectLang('fr', ['en-US'])).toBe('fr');
  });
  it('suit la première langue du téléphone : français si français, anglais sinon', () => {
    expect(detectLang(null, ['fr-FR', 'en'])).toBe('fr');
    expect(detectLang(null, ['fr-CA'])).toBe('fr');
    expect(detectLang(null, ['en-GB', 'fr'])).toBe('en');
    expect(detectLang(null, ['pt-PT'])).toBe('en');
    expect(detectLang(null, ['de-DE'])).toBe('en');
  });
  it('ignore une valeur enregistrée inconnue', () => {
    expect(detectLang('es', ['fr-FR'])).toBe('fr');
  });
  it('sans navigateur, reste en français', () => {
    expect(detectLang(null, [])).toBe('fr');
  });
});

describe('setLang / tr', () => {
  it('bascule la phrase et prévient les abonnés une seule fois par changement', () => {
    let calls = 0;
    const off = subscribeLang(() => calls++);
    expect(tr('Au soleil', 'In the sun')).toBe('Au soleil');
    setLang('en');
    setLang('en');
    expect(getLang()).toBe('en');
    expect(tr('Au soleil', 'In the sun')).toBe('In the sun');
    off();
    expect(calls).toBe(1);
  });
});

const rec = (over: Partial<Recommendation>): Recommendation =>
  ({
    venue: { category: 'miradouro' },
    sunPercentage: 80,
    shadePercentage: 20,
    sunLeavesInMin: null,
    sunArrivesInMin: null,
    lastsUntilSunset: false,
    endsAtSunset: false,
    arrivesTomorrow: false,
    sunWindowStart: null,
    sunWindowEnd: null,
    walkTimeMin: 12,
    distanceM: 900,
    ...over,
  }) as unknown as Recommendation;

describe('copy en anglais', () => {
  it('dit le statut d’un lieu en anglais', () => {
    setLang('en');
    expect(statusCopy(rec({ sunLeavesInMin: 125, sunWindowEnd: '17:05' }), 'SUN')).toEqual({
      title: 'Loses the sun in 2h 5m',
      detail: '80% sun now · until 17:05',
    });
    expect(statusCopy(rec({ sunLeavesInMin: 90, endsAtSunset: true, sunWindowEnd: '20:12' }), 'SUN').detail).toBe(
      '80% sun now · last light at 20:12'
    );
    expect(statusShort(rec({ sunArrivesInMin: 45 }), 'SUN')).toBe('in 45 min');
  });
  it('traduit trajets, catégories, pastilles et compteur', () => {
    setLang('en');
    expect(travelLabel(rec({}))).toBe('12 min walk');
    expect(travelLabel(rec({ walkTimeMin: 136, distanceM: 11100 }))).toBe('11.1 km away');
    expect(categoryLabel('miradouro')).toBe('Viewpoint');
    expect(markerLabel(rec({ sunArrivesInMin: 30, sunWindowStart: '16:00' }), 'SUN')).toBe('from 16:00');
    expect(venueCountLine(10, 7)).toBe('7 places checked on foot, 3 still to check.');
  });
  it('le français reste intact', () => {
    expect(travelLabel(rec({ walkTimeMin: 136, distanceM: 11100 }))).toBe("11,1 km d'ici");
    expect(markerLabel(rec({ sunArrivesInMin: 30, sunWindowStart: '16:00' }), 'SUN')).toBe('dès 16h');
  });
});
