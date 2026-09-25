import { describe, it, expect } from 'vitest';
import { isDaylight, liveAge, liveWho } from './live';

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
});
