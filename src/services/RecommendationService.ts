import type { Recommendation, Venue, SunMode, VenueCategory, GeoPoint, Confidence, WeatherData } from '@/types';
import { VenueService } from './VenueService';
import { MapService } from './MapService';
import { WeatherService } from './WeatherService';
import { SunService } from './SunService';
import { VenueSunService } from './VenueSunService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { formatLisbonTime, lisbonHour, lisbonMinutesOfDay, lisbonWeekday } from '@/utils/lisbonTime';

// Reads through VenueSunService (real ShadowService physics against real
// buildings, memoized per venue+day) using the explicit `date` this service
// already receives, instead of the venue's static "today at load time" field
// — see the architecture note in the research log. In the current UI this
// resolves to the exact same values (TimeSlider never changes the day), but
// it makes RecommendationService correct even if that ever changes.
function exposureByQuarter(venue: Venue, mode: SunMode, date: Date): number[] {
  const sun = VenueSunService.getSunExposureByQuarter(venue, lisbonBuildings, date);
  return mode === 'SUN' ? sun : sun.map((s) => 100 - s);
}

/** Minutes depuis minuit → « HH:MM ». */
function hhmm(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

const CONFIDENCE_SCORE: Record<Confidence, number> = {
  HIGH: 100,
  MEDIUM: 65,
  LOW: 35,
};

class RecommendationServiceClass {
  getRecommendations(
    mode: SunMode,
    userLocation: GeoPoint,
    date: Date,
    categories: VenueCategory[] = [],
    weather?: WeatherData,
    maxResults: number = 20
  ): Recommendation[] {
    const venues = VenueService.getVenuesByCategory(categories);
    const wx = weather || WeatherService.getCurrentWeather();
    const hour = lisbonHour(date);

    const recs: Recommendation[] = venues.map((venue) =>
      this.scoreVenue(venue, mode, userLocation, date, hour, wx)
    );

    recs.sort((a, b) => b.sunMatch - a.sunMatch);
    return recs.slice(0, maxResults);
  }

  /** Un lieu précis, évalué exactement comme dans les listes — la fiche
   *  détail recalculait ses propres chiffres et contredisait l'accueil. */
  getRecommendationFor(
    venue: Venue,
    mode: SunMode,
    userLocation: GeoPoint,
    date: Date,
    weather?: WeatherData
  ): Recommendation {
    const wx = weather || WeatherService.getCurrentWeather();
    return this.scoreVenue(venue, mode, userLocation, date, lisbonHour(date), wx);
  }

  getTopRecommendation(
    mode: SunMode,
    userLocation: GeoPoint,
    date: Date,
    categories: VenueCategory[] = [],
    weather?: WeatherData
  ): Recommendation | null {
    const recs = this.getRecommendations(mode, userLocation, date, categories, weather, 1);
    return recs[0] || null;
  }

  /**
   * The ordered list behind the one-answer screen.
   *
   * Differs from getRecommendations on the one point that sinks apps in this
   * category: a closed venue is EXCLUDED, not merely penalised. Sending
   * someone to a shut bar is the failure users never forgive, and scoring a
   * closed venue at 0.3x still lets a brilliant one outrank an open mediocre
   * one. `scoreVenue` keeps the soft penalty for the map, which legitimately
   * shows closed places; this list is the one that tells someone to walk.
   *
   * Never returns an empty list while any venue is open: if nothing is
   * currently in the sun, open venues stay, ranked by how soon the sun
   * reaches them, so the screen can say "nobody's in the sun yet, here's who
   * gets it first" instead of showing nothing.
   */
  getAnswerList(
    mode: SunMode,
    userLocation: GeoPoint,
    date: Date,
    categories: VenueCategory[] = [],
    weather?: WeatherData,
    maxResults: number = 6
  ): Recommendation[] {
    const all = this.getRecommendations(mode, userLocation, date, categories, weather, 100);
    const open = all.filter((r) => r.isOpen);
    const pool = open.length > 0 ? open : all;

    const exposureOf = (r: Recommendation) =>
      mode === 'SUN' ? r.sunPercentage : r.shadePercentage;
    const inItNow = pool.filter((r) => exposureOf(r) >= 40);

    if (inItNow.length > 0) return inItNow.slice(0, maxResults);

    // Nobody qualifies right now — rank by who gets it soonest rather than
    // handing back an empty screen.
    return [...pool]
      .sort((a, b) => {
        const aw = a.sunArrivesInMin ?? Number.POSITIVE_INFINITY;
        const bw = b.sunArrivesInMin ?? Number.POSITIVE_INFINITY;
        if (aw !== bw) return aw - bw;
        return b.sunMatch - a.sunMatch;
      })
      .slice(0, maxResults);
  }

  private scoreVenue(
    venue: Venue,
    mode: SunMode,
    userLocation: GeoPoint,
    date: Date,
    hour: number,
    weather: WeatherData
  ): Recommendation {
    // Le pourcentage « maintenant » vient de la même courbe que la fenêtre,
    // sinon « perd le soleil dans 10 min » côtoie « 20 % de soleil ».
    const sunPct = VenueSunService.getSunExposureByQuarter(venue, lisbonBuildings, date)[
      Math.floor(lisbonMinutesOfDay(date) / 15)
    ] ?? 0;
    const shadePct = 100 - sunPct;

    const sunExposureScore = mode === 'SUN' ? sunPct : shadePct;

    const distanceM = MapService.haversineDistance(userLocation, {
      lat: venue.latitude,
      lng: venue.longitude,
    });
    const walkTime = MapService.walkTimeMinutes(distanceM);
    const distanceScore = Math.max(0, 100 - (distanceM / 3000) * 100);

    const { sunWindowStart, sunWindowEnd, sunWindowDurationMin, sunArrivesInMin, sunLeavesInMin, arrivesTomorrow, lastsUntilSunset } =
      this.computeSunWindow(venue, mode, date);

    let timeRemainingScore = 50;
    if (sunWindowDurationMin > 0) {
      timeRemainingScore = Math.min(100, (sunWindowDurationMin / 120) * 100);
    }
    if (mode === 'SUN' && sunArrivesInMin !== null && sunArrivesInMin > 0 && sunArrivesInMin < 30) {
      timeRemainingScore = Math.max(30, timeRemainingScore - 20);
    }

    const outdoorScore = venue.hasOutdoorArea ? 100 : 30;

    const confidenceScore = CONFIDENCE_SCORE[venue.confidence];

    const weatherScore = WeatherService.getOutdoorScore(weather, mode === 'SHADE');

    const isOpen = this.checkOpen(venue, date);

    const sunMatch = Math.round(
      sunExposureScore * 0.45 +
      distanceScore * 0.20 +
      timeRemainingScore * 0.15 +
      outdoorScore * 0.10 +
      confidenceScore * 0.10
    );

    let adjustedMatch = sunMatch;
    if (!isOpen) adjustedMatch = Math.round(adjustedMatch * 0.3);
    if (weather.rainProbability > 60 && mode === 'SUN') adjustedMatch = Math.round(adjustedMatch * 0.7);
    if (weather.temperature > 32 && mode === 'SUN' && shadePct < 30) adjustedMatch = Math.round(adjustedMatch * 0.85);
    adjustedMatch = Math.round((adjustedMatch * 0.85) + (weatherScore * 0.15));
    adjustedMatch = Math.max(0, Math.min(100, adjustedMatch));

    return {
      venue,
      sunMatch: adjustedMatch,
      sunPercentage: sunPct,
      shadePercentage: shadePct,
      walkTimeMin: walkTime,
      distanceM,
      sunWindowStart,
      sunWindowEnd,
      sunWindowDurationMin,
      confidence: venue.confidence,
      sunArrivesInMin,
      sunLeavesInMin,
      arrivesTomorrow,
      lastsUntilSunset,
      isOpen,
    };
  }

  private computeSunWindow(
    venue: Venue,
    mode: SunMode,
    date: Date
  ): {
    sunWindowStart: string | null;
    sunWindowEnd: string | null;
    sunWindowDurationMin: number;
    sunArrivesInMin: number | null;
    sunLeavesInMin: number | null;
    arrivesTomorrow: boolean;
    lastsUntilSunset: boolean;
  } {
    // Au quart d'heure, pas à l'heure : voir getSunExposureByQuarter.
    const exposure = exposureByQuarter(venue, mode, date);
    const threshold = mode === 'SUN' ? 40 : 50;
    const nowMin = lisbonMinutesOfDay(date);
    const nowQ = Math.floor(nowMin / 15);

    // L'ombre vaut 100 − soleil : la nuit, elle vaut donc 100 partout, et
    // chaque lieu « gardait l'ombre jusqu'à 23:59 ». Après le coucher l'ombre
    // n'est plus une information — c'est le coucher qui ferme la fenêtre.
    const sunset = SunService.getSunset(date);
    const sunsetMin = lisbonMinutesOfDay(sunset);
    const sunriseMin = lisbonMinutesOfDay(SunService.getSunrise(date));
    const lastQ =
      mode === 'SUN' ? 95 : nowMin >= sunsetMin ? -1 : Math.floor((sunsetMin - 1) / 15);
    const qualifies = (q: number) => q <= lastQ && exposure[q] >= threshold;

    let start: number | null = null;
    let end: number | null = null;
    for (let q = nowQ; q < 96; q++) {
      if (qualifies(q)) {
        if (start === null) start = q;
        end = q;
      } else if (start !== null) {
        break;
      }
    }

    if (start === null || end === null) {
      // Plus rien aujourd'hui. En mode Soleil, le prochain est demain matin —
      // la seule chose utile à dire à 23 h.
      if (mode === 'SUN') {
        const next = new Date(date.getTime() + 24 * 3600 * 1000);
        const tomorrow = VenueSunService.getSunExposureByQuarter(venue, lisbonBuildings, next);
        const first = tomorrow.findIndex((e) => e >= threshold);
        if (first >= 0) {
          const startMin = Math.max(first * 15, lisbonMinutesOfDay(SunService.getSunrise(next)));
          return {
            sunWindowStart: hhmm(startMin),
            sunWindowEnd: null,
            sunWindowDurationMin: 0,
            sunArrivesInMin: 24 * 60 - nowMin + startMin,
            sunLeavesInMin: null,
            arrivesTomorrow: true,
            lastsUntilSunset: false,
          };
        }
      }
      return {
        sunWindowStart: null,
        sunWindowEnd: null,
        sunWindowDurationMin: 0,
        sunArrivesInMin: null,
        sunLeavesInMin: null,
        arrivesTomorrow: false,
        lastsUntilSunset: false,
      };
    }

    // Un quart d'heure est échantillonné en son milieu (hh:07, hh:22…) : le
    // coucher tombe presque toujours entre deux échantillons. Si c'est lui
    // qui coupe la fenêtre — quart suivant échantillonné après le coucher, ou
    // dernier quart qui le chevauche — la fenêtre finit au coucher, pas au
    // quart d'heure rond d'avant ou d'après.
    const lastsUntilSunset = mode === 'SHADE' && end === lastQ;
    const rawEnd = (end + 1) * 15;
    const cutBySunset = nowMin < sunsetMin && rawEnd - 15 < sunsetMin && sunsetMin <= rawEnd + 7;
    const endMin = lastsUntilSunset || cutBySunset ? sunsetMin : rawEnd;
    const startMin = mode === 'SUN' ? Math.max(start * 15, sunriseMin) : start * 15;
    const endStr = endMin === sunsetMin ? formatLisbonTime(sunset) : endMin >= 24 * 60 ? '23:59' : hhmm(endMin);

    const currentlyExposed = start === nowQ;

    return {
      sunWindowStart: hhmm(startMin),
      sunWindowEnd: endStr,
      sunWindowDurationMin: Math.max(0, endMin - Math.max(nowMin, startMin)),
      sunArrivesInMin: currentlyExposed ? null : startMin - nowMin,
      sunLeavesInMin: currentlyExposed ? endMin - nowMin : null,
      arrivesTomorrow: false,
      lastsUntilSunset,
    };
  }

  private checkOpen(venue: Venue, date: Date): boolean {
    const day = lisbonWeekday(date);
    const hours = venue.openingHours[day];
    if (!hours) return false;

    const nowMin = lisbonMinutesOfDay(date);
    const [openH, openM] = hours.open.split(':').map(Number);
    const [closeH, closeM] = hours.close.split(':').map(Number);
    const openMin = openH * 60 + openM;
    let closeMin = closeH * 60 + closeM;
    if (closeMin <= openMin) closeMin += 24 * 60;

    return nowMin >= openMin && nowMin <= closeMin;
  }

  getBestTime(venue: Venue, mode: SunMode, date: Date): { start: string; end: string } | null {
    const exposure =
      mode === 'SUN'
        ? VenueSunService.getSunExposureByHour(venue, lisbonBuildings, date)
        : VenueSunService.getShadeExposureByHour(venue, lisbonBuildings, date);
    const threshold = mode === 'SUN' ? 50 : 60;

    let bestStart = -1;
    let bestEnd = -1;
    let bestDuration = 0;

    let curStart = -1;
    for (let h = 6; h <= 21; h++) {
      if (exposure[h] >= threshold) {
        if (curStart === -1) curStart = h;
      } else {
        if (curStart !== -1) {
          const dur = h - curStart;
          if (dur > bestDuration) {
            bestDuration = dur;
            bestStart = curStart;
            bestEnd = h;
          }
          curStart = -1;
        }
      }
    }
    if (curStart !== -1) {
      const dur = 22 - curStart;
      if (dur > bestDuration) {
        bestStart = curStart;
        bestEnd = 22;
      }
    }

    if (bestStart === -1) return null;
    return {
      start: `${String(bestStart).padStart(2, '0')}:00`,
      end: `${String(bestEnd).padStart(2, '0')}:00`,
    };
  }

  formatDuration(min: number): string {
    if (min <= 0) return '0 min';
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (h === 0) return `${m} min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  }
}

export const RecommendationService = new RecommendationServiceClass();
