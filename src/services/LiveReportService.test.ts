import { describe, it, expect, beforeEach } from 'vitest';
import {
  LiveReportService,
  LIVE_TTL_MS,
  LIVE_ZONE_M,
  type LiveRecord,
  type LiveStore,
} from './LiveReportService';

const venue = { id: 'v1', latitude: 38.7139, longitude: -9.1394 };
const NOW = 1_700_000_000_000;

function memoryStore(initial: LiveRecord[] = []): LiveStore {
  let rows = [...initial];
  return { load: () => [...rows], save: (r) => { rows = [...r]; } };
}

/** Un point à `m` mètres au nord du lieu. */
const north = (m: number) => ({ lat: venue.latitude + m / 111_320, lng: venue.longitude });

describe('LiveReportService', () => {
  let svc: LiveReportService;
  beforeEach(() => {
    svc = new LiveReportService(memoryStore(), 'me');
  });

  it("n'accepte une réponse que dans la zone du lieu", () => {
    expect(svc.isInZone(venue, north(LIVE_ZONE_M - 10))).toBe(true);
    expect(svc.isInZone(venue, north(LIVE_ZONE_M + 50))).toBe(false);
  });

  it('refuse une réponse envoyée de loin', () => {
    expect(svc.submit(venue, 'plenty', north(500), NOW)).toBe(false);
    expect(svc.getState('v1', NOW)).toBeNull();
  });

  it('enregistre une réponse dans la zone', () => {
    expect(svc.submit(venue, 'few', north(20), NOW)).toBe(true);
    expect(svc.getState('v1', NOW)).toMatchObject({ level: 'few', count: 1, ageMin: 0 });
  });

  it("garde une seule voix par appareil : la dernière remplace la précédente", () => {
    svc.submit(venue, 'plenty', north(20), NOW);
    svc.submit(venue, 'none', north(20), NOW + 60_000);
    expect(svc.getState('v1', NOW + 60_000)).toMatchObject({ level: 'none', count: 1 });
  });

  it('prend la majorité des voix et, à égalité, la plus récente', () => {
    const other = (id: string, answer: LiveRecord['answer'], at: number): LiveRecord => ({
      venueId: 'v1', answer, at, deviceId: id,
    });
    const s = new LiveReportService(
      memoryStore([other('a', 'plenty', NOW - 60_000), other('b', 'plenty', NOW - 120_000), other('c', 'none', NOW - 30_000)]),
      'me'
    );
    expect(s.getState('v1', NOW)).toMatchObject({ level: 'plenty', count: 3 });

    const tie = new LiveReportService(
      memoryStore([other('a', 'plenty', NOW - 120_000), other('c', 'none', NOW - 30_000)]),
      'me'
    );
    expect(tie.getState('v1', NOW)).toMatchObject({ level: 'none', count: 2 });
  });

  it("périme une réponse après 45 minutes : le drapeau redevient gris", () => {
    svc.submit(venue, 'plenty', north(20), NOW);
    expect(svc.getState('v1', NOW + LIVE_TTL_MS - 1)).not.toBeNull();
    expect(svc.getState('v1', NOW + LIVE_TTL_MS + 1)).toBeNull();
  });

  it("sait si cet appareil a déjà répondu récemment", () => {
    expect(svc.hasAnswered('v1', NOW)).toBe(false);
    svc.submit(venue, 'few', north(20), NOW);
    expect(svc.hasAnswered('v1', NOW + 1000)).toBe(true);
    expect(svc.hasAnswered('v1', NOW + LIVE_TTL_MS + 1)).toBe(false);
  });

  it('prévient les abonnés quand une réponse arrive', () => {
    let calls = 0;
    const off = svc.subscribe(() => { calls++; });
    svc.submit(venue, 'few', north(20), NOW);
    expect(calls).toBe(1);
    off();
    svc.submit(venue, 'none', north(20), NOW + 1);
    expect(calls).toBe(1);
  });
});
