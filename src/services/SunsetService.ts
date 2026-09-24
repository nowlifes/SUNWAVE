import type { Venue } from '@/types';
import { SunService } from './SunService';
import { SUNSET_AZ_MAX, SUNSET_AZ_MIN, sunsetHorizons } from '@/data/sunsetHorizons';

/** Ce qui cache le soleil au dernier rayon. */
export type HorizonKind = 'water' | 'building' | 'hill' | 'relief';

/** Codes de scripts/fetch-sunset-horizons.mjs. Une côte lointaine plus haute
 *  que l'horizon géométrique (`f`) se lit comme de la terre, pas de l'eau. */
const HORIZON_KIND: Record<string, HorizonKind> = { w: 'water', f: 'hill', h: 'hill', b: 'building', r: 'relief' };

/** L'heure officielle place le haut du disque sur un horizon plat au niveau
 *  de la mer : centre à −0,833° (demi-diamètre 0,27° + réfraction 0,57°). */
const SUNSET_DEPRESSION_DEG = 0.833;

/** Au-delà, le soleil n'est pas « couché » : un mur l'a caché en plein
 *  après-midi, et c'est la bande de lumière qui le dit, pas le coucher. */
const SEARCH_BEFORE_MIN = 90;
const SEARCH_AFTER_MIN = 15;

export interface LastLight {
  venue: Venue;
  /** La minute où le soleil disparaît vraiment, vu du meilleur coin du lieu. */
  time: Date;
  over: HorizonKind;
  /** Positif : après l'heure officielle (horizon marin dégagé). */
  minutesAfterOfficial: number;
}

class SunsetServiceClass {
  /** Angle de l'horizon (degrés) et sa nature à cet azimut, interpolés. */
  horizonAt(venue: Venue, azimuthDeg: number): { angle: number; kind: HorizonKind } | null {
    const h = sunsetHorizons[venue.id];
    if (!h || azimuthDeg < SUNSET_AZ_MIN || azimuthDeg > SUNSET_AZ_MAX) return null;
    const [angles, kinds] = h;
    const x = azimuthDeg - SUNSET_AZ_MIN;
    const i = Math.min(Math.floor(x), angles.length - 2);
    const f = x - i;
    const angle = (angles[i] * (1 - f) + angles[i + 1] * f) / 10;
    return { angle, kind: HORIZON_KIND[kinds[Math.round(x)]] ?? 'relief' };
  }

  /** Le dernier rayon vu du lieu ce jour-là, à la minute ; `null` si le lieu
   *  n'a pas d'horizon calculé ou perd le soleil bien avant le coucher. */
  lastLight(venue: Venue, day: Date): LastLight | null {
    const official = SunService.getSunset(day, venue.latitude, venue.longitude);
    const hiddenAt = (m: number) => {
      const t = new Date(official.getTime() + m * 60000);
      const pos = SunService.getSunPosition(t, venue.latitude, venue.longitude);
      const hz = this.horizonAt(venue, pos.azimuth);
      if (!hz) return null;
      return pos.elevation < hz.angle - SUNSET_DEPRESSION_DEG ? { t, kind: hz.kind } : null;
    };
    // Déjà caché au début de la fenêtre : pas un coucher, un mur.
    if (hiddenAt(-SEARCH_BEFORE_MIN)) return null;
    for (let m = -SEARCH_BEFORE_MIN + 1; m <= SEARCH_AFTER_MIN; m++) {
      const h = hiddenAt(m);
      if (h) return { venue, time: h.t, over: h.kind, minutesAfterOfficial: m };
    }
    return null;
  }

  /** Les lieux d'où l'on voit le soleil toucher l'eau, les plus tardifs d'abord. */
  waterSunsets(venues: Venue[], day: Date): LastLight[] {
    return venues
      .map((v) => this.lastLight(v, day))
      .filter((r): r is LastLight => r !== null && r.over === 'water')
      .sort((a, b) => b.time.getTime() - a.time.getTime());
  }
}

export const SunsetService = new SunsetServiceClass();
