import type { BuildingFootprint, ExposureBand, GeoPoint, HeightProvenance, Venue } from '@/types';
import { ShadowService } from './ShadowService';
import { ReportService } from './ReportService';
import { lisbonParts } from '@/utils/lisbonTime';

// ---------------------------------------------------------------------------
// Bridges the real physics engine (ShadowService + real building footprints)
// to the venue-level 24-hour sun/shade curves consumed across the app.
//
// Previously `lisbonVenues.ts` invented these curves from a hand-picked
// "archetype" bell curve per venue (rooftop/park/street-dense/...) and
// `ShadowService.computeSunExposureForHour` — which does the correct
// shadow-length/elevation math — was never called. This service is the one
// place that now calls it, for every venue, using the real OSM building
// footprints from `lisbonBuildings.ts`.
//
// Perf: a naive per-hour call would test every building in the city against
// every venue. Buildings more than NEARBY_RADIUS_M away cannot cast a shadow
// reaching the venue at realistic Lisbon sun elevations/heights, so we
// pre-filter to nearby buildings once per venue (not once per hour) before
// handing them to ShadowService.
// ---------------------------------------------------------------------------

const NEARBY_RADIUS_M = 150;
const DEFAULT_ORIENTATION_DEG = 180; // south-facing default when a venue has no outdoor polygon

/** Cheap equirectangular distance in meters — accurate enough at city scale. */
function distanceM(a: GeoPoint, b: GeoPoint): number {
  const latRad = (a.lat * Math.PI) / 180;
  const dx = (b.lng - a.lng) * 111320 * Math.cos(latRad);
  const dy = (b.lat - a.lat) * 110540;
  return Math.sqrt(dx * dx + dy * dy);
}

function buildingCentroid(building: BuildingFootprint): GeoPoint {
  let lat = 0;
  let lng = 0;
  for (const p of building.points) {
    lat += p.lat;
    lng += p.lng;
  }
  return { lat: lat / building.points.length, lng: lng / building.points.length };
}

export interface SunTarget {
  id: string;
  lat: number;
  lng: number;
  orientationDeg: number;
  /** Observer elevation, metres above sea level, when it's known to differ
   *  from bare ground at this lat/lng (a rooftop bar on its building's roof,
   *  a miradouro's own surveyed altitude). Omitted lets ShadowService read
   *  ground level from TerrainService, as before. */
  altitude?: number;
}

class VenueSunServiceClass {
  /** Cache of nearby-buildings-per-venue, keyed by venue id — the building
   *  dataset doesn't change at runtime, so this only needs computing once. */
  private nearbyBuildingsCache = new Map<string, BuildingFootprint[]>();

  /** Cache of computed 24h BANDS, keyed by `${venueId}|${YYYY-MM-DD}` so the
   *  (rare, currently unreachable via the UI) case of a different calendar
   *  day still gets a physically-correct curve instead of a stale one — see
   *  the architecture note in the research log for why this matters less
   *  than it sounds today (TimeSlider never changes the day). */
  private bandCache = new Map<string, ExposureBand>();

  constructor() {
    // A new report must take effect immediately, not on next page load.
    ReportService.onChange((venueId) => this.invalidateVenue(venueId));
  }

  private nearbyBuildings(target: SunTarget, buildings: BuildingFootprint[]): BuildingFootprint[] {
    const cached = this.nearbyBuildingsCache.get(target.id);
    if (cached) return cached;
    const origin = { lat: target.lat, lng: target.lng };
    const nearby = buildings.filter((b) => distanceM(origin, buildingCentroid(b)) <= NEARBY_RADIUS_M);
    this.nearbyBuildingsCache.set(target.id, nearby);
    return nearby;
  }

  /** Le jour de LISBONNE : le jour local du navigateur changeait la clé au
   *  milieu d'un glissement d'heure hors fuseau (970 courbes recalculées, 2 s
   *  de gel) et pouvait servir la courbe d'un autre jour. */
  private dateKey(date: Date): string {
    const p = lisbonParts(date);
    return `${p.year}-${p.month}-${p.day}`;
  }

  /** Real 24-value (0-23h) sun-exposure curve for an arbitrary target point,
   *  computed from actual sun position + real nearby building shadows.
   *  This is the central estimate — `computeExposureBand` gives it its bracket. */
  computeExposureCurve(target: SunTarget, buildings: BuildingFootprint[], date: Date): number[] {
    return this.computeExposureBand(target, buildings, date).mid;
  }

  /**
   * The same curve, plus the two curves obtained by re-running the identical
   * geometry with every UNMEASURED neighbour one storey taller, then one
   * storey shorter (see HEIGHT_UNCERTAINTY_M in ShadowService).
   *
   * Three passes instead of one. That is the whole cost of the feature, and it
   * is paid once per venue per day at module load, behind the map.
   *
   * The band is NOT assumed to be ordered pointwise: raising a neighbour can
   * occasionally ADD sun at an hour (a taller building stops occluding the
   * point and starts occluding the one that used to shade it). `low` and
   * `high` are therefore the per-hour min and max of the three passes, which
   * keeps `low <= mid <= high` true by construction.
   */
  computeExposureBand(target: SunTarget, buildings: BuildingFootprint[], date: Date): ExposureBand {
    const key = `${target.id}|${this.dateKey(date)}`;
    const cached = this.bandCache.get(key);
    if (cached) return cached;

    const nearby = this.nearbyBuildings(target, buildings);

    // User reports override the geometry, because they see what it cannot:
    // parasols, awnings, trees, scaffolding, a terrace that moved. The engine
    // models buildings and nothing else, so a terrace reported shaded stays
    // shaded however perfect the shadow math is. Applied to every pass, so a
    // report narrows the whole band rather than only its middle.
    const pass = (heightBias: number): number[] => {
      const curve: number[] = new Array(24);
      for (let h = 0; h < 24; h++) {
        curve[h] = ShadowService.computeSunExposureForHour(
          h, target.lat, target.lng, target.orientationDeg, nearby, date, heightBias, target.altitude
        );
      }
      return ReportService.applyToCurve(target.id, curve);
    };

    const mid = pass(0);
    const taller = pass(1);
    const shorter = pass(-1);

    const band: ExposureBand = {
      mid,
      low: mid.map((m, h) => Math.min(m, taller[h], shorter[h])),
      high: mid.map((m, h) => Math.max(m, taller[h], shorter[h])),
    };

    this.bandCache.set(key, band);
    return band;
  }

  /** Cache des courbes au quart d'heure, même clé que `bandCache`. */
  private quarterCache = new Map<string, number[]>();

  /**
   * Soleil au quart d'heure : 96 valeurs, la n-ième au milieu du quart
   * [n×15, n×15+15[ (heure de Lisbonne).
   *
   * La courbe horaire, échantillonnée à hh:30, ne sait dire que « jusqu'à
   * 19:00 » : l'heure du coucher (19:25) y vaut 0, et tous les lieux en plein
   * ciel finissaient ensemble. Ce qui distingue deux terrasses, c'est le
   * quart d'heure où un toit les rattrape — il faut le voir.
   *
   * Estimation centrale seulement : la fourchette reste horaire, c'est la
   * durée annoncée qui a besoin de la précision.
   */
  getSunExposureByQuarter(venue: Venue, buildings: BuildingFootprint[], date: Date): number[] {
    return this.quarterCurve(this.targetOf(venue), buildings, date);
  }

  /**
   * La même courbe pour un point que personne n'a relevé — l'endroit touché
   * sur la carte. Au sol (altitude du relief), orientation par défaut :
   * un trottoir n'a pas de façade privilégiée. Arrondi au mètre près, pour
   * que deux touchers au même endroit partagent le cache.
   */
  getPointSunByQuarter(point: GeoPoint, buildings: BuildingFootprint[], date: Date): number[] {
    const lat = Math.round(point.lat * 1e5) / 1e5;
    const lng = Math.round(point.lng * 1e5) / 1e5;
    return this.quarterCurve({ id: `pt:${lat},${lng}`, lat, lng, orientationDeg: DEFAULT_ORIENTATION_DEG }, buildings, date);
  }

  private quarterCurve(target: SunTarget, buildings: BuildingFootprint[], date: Date): number[] {
    const key = `${target.id}|${this.dateKey(date)}`;
    const cached = this.quarterCache.get(key);
    if (cached) return cached;

    const nearby = this.nearbyBuildings(target, buildings);
    const curve: number[] = new Array(96);
    for (let q = 0; q < 96; q++) {
      curve[q] = ShadowService.computeSunExposureAt(
        Math.floor(q / 4), (q % 4) * 15 + 7, target.lat, target.lng, target.orientationDeg,
        nearby, date, 0, target.altitude
      );
    }
    const out = ReportService.applyToCurve(target.id, curve);
    this.quarterCache.set(key, out);
    return out;
  }

  /** Provenance mix of the heights that produced this target's figures — the
   *  buildings the engine actually tested, not the whole city. */
  heightProvenance(target: SunTarget, buildings: BuildingFootprint[]): HeightProvenance {
    const nearby = this.nearbyBuildings(target, buildings);
    const out: HeightProvenance = { tagged: 0, levels: 0, estimated: 0, total: nearby.length };
    for (const b of nearby) out[b.heightSource]++;
    return out;
  }

  /** A new report invalidates the cached curves it contradicts. Without this
   *  a user would report a terrace shaded and see the old number until reload. */
  invalidateVenue(venueId: string): void {
    for (const key of [...this.bandCache.keys()]) {
      if (key.startsWith(`${venueId}|`)) this.bandCache.delete(key);
    }
    for (const key of [...this.quarterCache.keys()]) {
      if (key.startsWith(`${venueId}|`)) this.quarterCache.delete(key);
    }
  }

  /** Convenience overload for an already-built Venue. */
  getSunExposureByHour(venue: Venue, buildings: BuildingFootprint[], date: Date): number[] {
    return this.computeExposureCurve(this.targetOf(venue), buildings, date);
  }

  /** Band for an already-built Venue, in SUN terms. */
  getSunBand(venue: Venue, buildings: BuildingFootprint[], date: Date): ExposureBand {
    return this.computeExposureBand(this.targetOf(venue), buildings, date);
  }

  private targetOf(venue: Venue): SunTarget {
    return {
      id: venue.id,
      lat: venue.latitude,
      lng: venue.longitude,
      orientationDeg: venue.outdoorPolygon?.orientationDeg ?? DEFAULT_ORIENTATION_DEG,
      altitude: venue.altitude,
    };
  }

  getShadeExposureByHour(venue: Venue, buildings: BuildingFootprint[], date: Date): number[] {
    return this.getSunExposureByHour(venue, buildings, date).map((s) => 100 - s);
  }
}

export const VenueSunService = new VenueSunServiceClass();
