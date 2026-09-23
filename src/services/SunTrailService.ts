import type { GeoPoint, Recommendation } from '@/types';
import { MapService } from './MapService';
import { RecommendationService } from './RecommendationService';
import { SunService } from './SunService';
import { VenueService } from './VenueService';

// ---------------------------------------------------------------------------
// Suivre le soleil — un après-midi en deux ou trois lieux.
//
// L'accueil nomme un lieu et dit quand son soleil s'arrête. Quand c'est à
// 16:00, la question suivante est évidente : « et après ? ». Ce service y
// répond d'avance : là où aller quand l'ombre arrive, à quelques minutes à
// pied, pour garder le soleil jusqu'au coucher.
//
// Le parcours part du lieu que l'accueil propose, pas du « meilleur » lieu
// de la ville : cherché seul, le plus long soleil mène droit à un belvédère
// ouvert jusqu'au coucher, et le parcours n'a qu'une étape. Il n'existe que
// parce que les fenêtres sont au quart d'heure — à l'heure, les étapes se
// chevauchaient ou laissaient des trous d'une heure.
// ---------------------------------------------------------------------------

/** En deçà, s'asseoir ne vaut pas le détour. */
const MIN_STAY_MIN = 30;
/** Au-delà, on ne suit plus le soleil, on traverse la ville. */
const MAX_WALK_MIN = 20;
const MAX_STOPS = 3;
/** Une étape qui ne rallonge le soleil que de quelques minutes n'en est pas une. */
const MIN_GAIN_MIN = 15;

export interface TrailStop {
  /** Le lieu, évalué à l'heure d'arrivée. */
  rec: Recommendation;
  /** Marche depuis l'étape précédente (ou depuis la position de départ). */
  walkMin: number;
  arriveAt: Date;
  /** Quand le soleil quitte ce lieu. */
  leaveAt: Date;
}

export interface SunTrail {
  stops: TrailStop[];
  /** La dernière étape garde le soleil jusqu'au coucher. */
  untilSunset: boolean;
}

const MIN = 60000;

/** Le lieu au soleil à `arriveAt`, et pour combien de temps — ou rien. */
function stopAt(rec: Recommendation, from: GeoPoint, departAt: Date, walkMin: number): TrailStop | null {
  const arriveAt = new Date(departAt.getTime() + walkMin * MIN);
  const there = RecommendationService.getRecommendationFor(rec.venue, 'SUN', from, arriveAt);
  if (!there.isOpen || there.sunLeavesInMin === null || there.sunLeavesInMin < MIN_STAY_MIN) return null;
  return { rec: there, walkMin, arriveAt, leaveAt: new Date(arriveAt.getTime() + there.sunLeavesInMin * MIN) };
}

export const SunTrailService = {
  /**
   * Le parcours qui prolonge `first`, ou `null` quand il n'y a rien à
   * prolonger : premier lieu déjà au soleil jusqu'au coucher, pas au soleil
   * à l'arrivée, ou aucun voisin pour prendre le relais.
   */
  plan(first: Recommendation, from: GeoPoint, date: Date): SunTrail | null {
    const sunset = SunService.getSunset(date);
    const endsAtSunset = (s: TrailStop) => s.leaveAt.getTime() >= sunset.getTime() - MIN;

    const start = stopAt(first, from, date, first.walkTimeMin);
    if (!start || endsAtSunset(start)) return null;

    const stops = [start];
    const venues = VenueService.getVenuesByCategory([]);

    while (stops.length < MAX_STOPS) {
      const prev = stops[stops.length - 1];
      if (endsAtSunset(prev)) break;
      const here = { lat: prev.rec.venue.latitude, lng: prev.rec.venue.longitude };

      let best: TrailStop | null = null;
      for (const venue of venues) {
        if (stops.some((s) => s.rec.venue.id === venue.id)) continue;
        const walkMin = MapService.walkTimeMinutes(
          MapService.haversineDistance(here, { lat: venue.latitude, lng: venue.longitude })
        );
        if (walkMin > MAX_WALK_MIN) continue;
        const rec = RecommendationService.getRecommendationFor(venue, 'SUN', here, prev.leaveAt);
        const cand = stopAt(rec, here, prev.leaveAt, walkMin);
        if (!cand) continue;
        if (
          !best ||
          cand.leaveAt.getTime() > best.leaveAt.getTime() ||
          (cand.leaveAt.getTime() === best.leaveAt.getTime() && cand.walkMin < best.walkMin)
        ) {
          best = cand;
        }
      }

      if (!best || best.leaveAt.getTime() < prev.leaveAt.getTime() + MIN_GAIN_MIN * MIN) break;
      stops.push(best);
    }

    if (stops.length < 2) return null;
    return { stops, untilSunset: endsAtSunset(stops[stops.length - 1]) };
  },
};
