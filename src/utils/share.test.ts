import { describe, expect, it } from 'vitest';
import type { Recommendation } from '@/types';
import type { SunTrail } from '@/services/SunTrailService';
import { inviteText, inviteUrl, venueIdFromUrl, sunsetInviteText } from './share';

function rec(name: string, over: Partial<Recommendation> = {}): Recommendation {
  return {
    venue: { id: name.toLowerCase().replace(/\W+/g, '-'), name, category: 'bar' } as Recommendation['venue'],
    sunMatch: 80, sunPercentage: 92, shadePercentage: 8, walkTimeMin: 8, distanceM: 600,
    sunWindowStart: '14:30', sunWindowEnd: '17:45', sunWindowDurationMin: 195, confidence: 'HIGH',
    sunArrivesInMin: null, sunLeavesInMin: 195, arrivesTomorrow: false, lastsUntilSunset: false, endsAtSunset: false, isOpen: true,
    ...over,
  };
}
const at = (hhmm: string) => new Date(`2026-09-23T${hhmm}:00+01:00`);

describe('invitation au soleil', () => {
  it('un lieu, son soleil', () => {
    expect(inviteText(rec('Taberna'), 'SUN', null, '19:32'))
      .toBe('☀ Rendez-vous au soleil ? Taberna, au soleil jusqu\'à 17:45.');
  });

  it('jusqu\'au coucher, quand c\'est le cas', () => {
    expect(inviteText(rec('Senhora do Monte', { sunWindowEnd: '19:32' }), 'SUN', null, '19:32'))
      .toBe('☀ Rendez-vous au soleil ? Senhora do Monte, au soleil jusqu\'au coucher (19:32).');
  });

  it('avec la suite du parcours', () => {
    const next = rec('Park Bar');
    const trail: SunTrail = {
      untilSunset: true,
      stops: [
        { rec: rec('Taberna'), walkMin: 11, arriveAt: at('14:41'), leaveAt: at('17:45'), closes: false },
        { rec: next, walkMin: 4, arriveAt: at('17:49'), leaveAt: at('19:32'), closes: false },
      ],
    };
    expect(inviteText(rec('Taberna'), 'SUN', trail, '19:32')).toBe(
      '☀ Rendez-vous au soleil ? Taberna, au soleil jusqu\'à 17:45, puis Park Bar jusqu\'au coucher (19:32).'
    );
  });

  it('pas encore au soleil : dit quand il arrive', () => {
    const r = rec('Largo', { sunLeavesInMin: null, sunArrivesInMin: 60, sunWindowStart: '15:30' });
    expect(inviteText(r, 'SUN', null, '19:32')).toBe('☀ Rendez-vous au soleil ? Largo, au soleil dès 15:30.');
  });

  it('en mode ombre, parle d\'ombre', () => {
    const r = rec('Janis', { sunWindowEnd: '19:32', lastsUntilSunset: true });
    expect(inviteText(r, 'SHADE', null, '19:32')).toBe('Rendez-vous à l\'ombre ? Janis, à l\'ombre jusqu\'au coucher (19:32).');
  });
});

describe('lien d\'invitation', () => {
  it('aller-retour', () => {
    const url = inviteUrl('https://sunwave-olive.vercel.app', 'park-bar');
    expect(url).toBe('https://sunwave-olive.vercel.app/?lieu=park-bar');
    expect(venueIdFromUrl(url)).toBe('park-bar');
  });

  it('rien quand le lien ne porte pas de lieu', () => {
    expect(venueIdFromUrl('https://sunwave-olive.vercel.app/')).toBeNull();
  });
});

describe('sunsetInviteText', () => {
  it("donne le lieu et la minute où le soleil touche l'eau", () => {
    expect(sunsetInviteText('Praia do Paraíso', '19:35')).toBe(
      "Le soleil plonge dans l'océan à 19:35, vu de Praia do Paraíso. On y va ?"
    );
  });
});
