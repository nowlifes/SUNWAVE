import { describe, it, expect } from 'vitest';
import { isDaylight, liveAge, liveWho, shouldAskLive } from './live';

describe('live', () => {
  it('ne pose la question que de jour', () => {
    expect(isDaylight(new Date('2026-09-24T12:00:00Z'))).toBe(true);
    expect(isDaylight(new Date('2026-09-24T23:00:00Z'))).toBe(false);
    expect(isDaylight(new Date('2026-09-24T03:00:00Z'))).toBe(false);
  });

  it('dit la fraîcheur et le nombre comme on le dit', () => {
    expect(liveAge(0)).toBe("à l'instant");
    expect(liveAge(6)).toBe('il y a 6 min');
    expect(liveWho(1)).toBe('confirmé par 1 personne');
    expect(liveWho(3)).toBe('confirmé par 3 personnes');
  });

  it('ne pose la question que si le soleil part ou si personne n\'a répondu récemment', () => {
    expect(shouldAskLive(10, 2)).toBe(true); // le soleil part, même avec une réponse fraîche
    expect(shouldAskLive(120, 5)).toBe(false); // réponse récente, soleil encore là
    expect(shouldAskLive(120, 25)).toBe(true); // personne depuis 25 min
    expect(shouldAskLive(null, null)).toBe(true); // aucune réponse
    expect(shouldAskLive(null, 5)).toBe(false);
  });
});
