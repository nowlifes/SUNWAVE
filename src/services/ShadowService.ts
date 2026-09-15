import type { GeoPoint, BuildingFootprint, HeightSource } from '@/types';
import { SunService } from './SunService';
import { TerrainService } from './TerrainService';

const EARTH_RADIUS_M = 6378137;

// ---------------------------------------------------------------------------
// TERRAIN — why every height here is a DIFFERENCE, not a building height
//
// This engine used to assume a flat city: occlusion was `atan(height /
// distance) > sunElevation`, which is only true if the building's base and the
// observed point sit at the same altitude. Lisbon is built on hills and that
// assumption fails hardest exactly where the app is most visible: at a
// miradouro the altitude gap to the buildings below routinely EXCEEDS their
// height, so the model draped a viewpoint in shadows cast by rooftops sitting
// well below its own feet.
//
// What actually matters is how far a building's roof rises ABOVE the observed
// point: `(buildingAltitude + buildingHeight) - pointAltitude`. Negative or
// zero means the building is entirely below the observer and can never occlude
// the sun for them, at any hour, in any season.
//
// Altitudes come from TerrainService's frozen ~90m DEM grid — see the limits
// documented there and in src/data/lisbonTerrain.ts.
// ---------------------------------------------------------------------------

/** Below this the sun is on the horizon and shadow lengths explode to infinity. */
const MIN_ELEVATION_RAD = 0.02;
/** Cap for shadow length so a near-horizon sun can't produce a city-wide polygon. */
const MAX_SHADOW_LENGTH_M = 2000;
/** Radius of the ring of points a venue's exposure is averaged over. */
const SAMPLE_RING_RADIUS_M = 15;
/** Ray-march step when following a shadow down sloping ground. */
const TERRAIN_MARCH_STEP_M = 20;
// ---------------------------------------------------------------------------
// HEIGHT UNCERTAINTY — why a figure here comes with a bracket
//
// Shadow length is `height / tan(elevation)`: an error of one storey on a
// neighbour moves the edge of its shadow by several metres, which is the width
// of a terrace. And the heights are mostly not measured — across the 9112
// footprints in lisbonBuildings.ts, 7.4% carry an OSM `height` tag, 21.8% are
// derived from a floor count, and 70.7% are a typology guess.
//
// So every exposure figure can be recomputed with `heightBias` = +1 / -1,
// which moves each building by the uncertainty OF ITS OWN PROVENANCE. A
// measured height does not move; a guessed one moves a whole storey. The
// spread between the two runs is the honest width of the answer.
// ---------------------------------------------------------------------------

/** Metres a height may be off by, per provenance of that height. */
const HEIGHT_UNCERTAINTY_M: Record<HeightSource, number> = {
  // Tagged in OSM by someone who measured it. Taken at face value.
  tagged: 0,
  // Floor count is real; the 3m-per-floor conversion is the assumption.
  levels: 1.5,
  // No height at all in the data — the neighbourhood median. One storey.
  estimated: 3,
};

/** A building's height under a bracketing run. `bias` is 0 for the central
 *  estimate, +1 for "every guessed neighbour is a storey taller", -1 for
 *  "a storey shorter". Never returns a negative height. */
export function bracketedHeight(building: BuildingFootprint, bias: number): number {
  if (bias === 0) return building.height;
  return Math.max(0, building.height + bias * HEIGHT_UNCERTAINTY_M[building.heightSource]);
}

/** Below this distance the "is it in the sun's direction" cone is unreliable
 *  (a close facade spans too much sky) and is skipped — see isBlockedByBuilding. */
const AZIMUTH_FILTER_MIN_DISTANCE_M = 60;

// ---------------------------------------------------------------------------
// COMPASS CONVENTION — and the sign bug that used to invert it
//
// Azimuths here are north-based and clockwise (0 = N, 90 = E, 180 = S), which
// is what suncalc v2 returns. In the Mercator plane used below, x is EASTING
// and y is NORTHING, so the unit vector along a bearing B is (sin B, cos B).
//
// Both of those had a stray minus sign on the northing component, in every
// place a bearing was turned into a vector and in the one place a vector was
// turned back into a bearing. The two errors were consistent with each other,
// so nothing looked obviously broken — but together they mirrored the whole
// model north/south. A synthetic test (scripts/.diag-azimuth.mjs, and the
// permanent one in scripts/verify-shadow-geometry.mjs) showed a 60m wall
// standing between the point and the midday sun casting NO shade on it, while
// an identical wall behind the point shaded it 17%. Shadows were being drawn
// toward the sun instead of away from it.
//
// Consequence for the rest of this file: bearing -> vector is (sin, cos), and
// vector -> bearing is atan2(east, north). No negations.
// ---------------------------------------------------------------------------

/** Unit vector (east, north) along a north-based clockwise bearing, in radians. */
function bearingToVector(bearingRad: number): { x: number; y: number } {
  return { x: Math.sin(bearingRad), y: Math.cos(bearingRad) };
}

function toMercator(p: GeoPoint): { x: number; y: number } {
  const x = (p.lng / 180) * Math.PI * EARTH_RADIUS_M;
  const y = Math.log(Math.tan(Math.PI / 4 + (p.lat / 180) * Math.PI / 2)) * EARTH_RADIUS_M;
  return { x, y };
}

function fromMercator(x: number, y: number): GeoPoint {
  const lng = (x / (Math.PI * EARTH_RADIUS_M)) * 180;
  const lat = (Math.atan(Math.exp(y / EARTH_RADIUS_M)) * 2 - Math.PI / 2) * (180 / Math.PI);
  return { lat, lng };
}

export interface ShadowProjection {
  shadowPoints: GeoPoint[];
  shadowLengthM: number;
  shadowDirectionDeg: number;
}

class ShadowServiceClass {
  projectBuildingShadow(
    building: BuildingFootprint,
    date: Date,
    lat: number,
    lng: number
  ): ShadowProjection {
    const sunPos = SunService.getSunPosition(date, lat, lng);
    const elevationRad = (sunPos.elevation * Math.PI) / 180;
    const azimuthRad = ((sunPos.azimuth + 180) % 360) * (Math.PI / 180);

    if (elevationRad <= MIN_ELEVATION_RAD) {
      // Sun on the horizon: the true shadow is effectively unbounded. Clamp
      // rather than draw a polygon across the whole city.
      const shadowLengthM = MAX_SHADOW_LENGTH_M;
      const v = bearingToVector(azimuthRad);
      const dx = v.x * shadowLengthM;
      const dy = v.y * shadowLengthM;
      return {
        shadowPoints: this.extrudePolygon(building.points, dx, dy),
        shadowLengthM,
        shadowDirectionDeg: sunPos.azimuth,
      };
    }

    const shadowLengthM = this.terrainAwareShadowLength(building, elevationRad, azimuthRad);
    const v = bearingToVector(azimuthRad);
    const dx = v.x * shadowLengthM;
    const dy = v.y * shadowLengthM;

    return {
      shadowPoints: this.extrudePolygon(building.points, dx, dy),
      shadowLengthM,
      shadowDirectionDeg: sunPos.azimuth,
    };
  }

  /**
   * How far the shadow actually runs before the ground rises to meet it.
   *
   * Flat-ground math (`height / tan(elevation)`) is wrong in both directions in
   * Lisbon: a shadow cast DOWNHILL runs much further than that, and one cast
   * UPHILL is cut short by the slope climbing into the light. We march the
   * shadow ray in ${TERRAIN_MARCH_STEP_M}m steps and stop where the ray's
   * altitude drops to the terrain's.
   *
   * REMAINING LIMIT, deliberately not solved — read before trusting the map.
   * This corrects the shadow's LENGTH, not its SHAPE. The polygon is still a
   * parallel extrusion of the footprint, which is only exact on flat ground:
   * on a slope a real shadow's outline stretches and skews, and it can break
   * over a ridge into disjoint patches. Doing that properly means rasterising
   * the whole scene against a real DEM (a horizon/shadow-map pass), which is a
   * different program from this one. On top of that the DEM here is ~90m and
   * smooths exactly the sharp crests where the error is largest.
   *
   * The map polygons are therefore an honest approximation of WHERE shade
   * falls and roughly HOW FAR, not a survey. The venue-level sun percentages
   * — which is what the app actually recommends on — do not go through this
   * path: they use isBlockedByBuilding, which compares altitudes directly.
   */
  private terrainAwareShadowLength(
    building: BuildingFootprint,
    elevationRad: number,
    azimuthRad: number
  ): number {
    const roofAltitude = building.altitude + building.height;
    const center = this.polygonCenter(building.points);
    const c = toMercator(center);
    const tanEl = Math.tan(elevationRad);

    const marchDir = bearingToVector(azimuthRad);
    const stepX = marchDir.x * TERRAIN_MARCH_STEP_M;
    const stepY = marchDir.y * TERRAIN_MARCH_STEP_M;

    let previous = 0;
    for (let d = TERRAIN_MARCH_STEP_M; d <= MAX_SHADOW_LENGTH_M; d += TERRAIN_MARCH_STEP_M) {
      const steps = d / TERRAIN_MARCH_STEP_M;
      const here = fromMercator(c.x + stepX * steps, c.y + stepY * steps);
      const rayAltitude = roofAltitude - d * tanEl;
      const groundAltitude = TerrainService.altitudeAt(here);
      if (rayAltitude <= groundAltitude) {
        // Linear interpolation inside the step we overshot.
        const prevRay = roofAltitude - previous * tanEl;
        const prevGround = TerrainService.altitudeAt(
          fromMercator(c.x + stepX * (previous / TERRAIN_MARCH_STEP_M), c.y + stepY * (previous / TERRAIN_MARCH_STEP_M))
        );
        const gapBefore = prevRay - prevGround;
        const gapAfter = rayAltitude - groundAltitude;
        const t = gapBefore === gapAfter ? 0 : gapBefore / (gapBefore - gapAfter);
        return previous + t * TERRAIN_MARCH_STEP_M;
      }
      previous = d;
    }

    // Ray never met the ground inside the cap — the building overlooks a drop
    // (a miradouro wall above the river) or the sun is very low. The true
    // shadow is longer than the cap; the cap is what we are willing to draw.
    return MAX_SHADOW_LENGTH_M;
  }

  private extrudePolygon(points: GeoPoint[], dx: number, dy: number): GeoPoint[] {
    return points.map((p) => {
      const m = toMercator(p);
      return fromMercator(m.x + dx, m.y + dy);
    });
  }

  /**
   * The ground a building's shadow actually covers: the footprint SWEPT along
   * the shadow vector, not merely translated to the end of it.
   *
   * `extrudePolygon` alone returns the footprint moved by (dx, dy), which is
   * the far end of the shadow and nothing in between. Tested on a 60m wall
   * with its near face 25m from the point and the sun 54 degrees up, that made
   * the shadow a 10m-deep band floating 8m to 18m past the point, leaving the
   * point itself — and every terrace hard up against a building — in full sun.
   * For an app whose entire job is "is this terrace in the shade", that is the
   * wrong answer in the most common case there is.
   *
   * The swept region is the Minkowski sum of the footprint and the shadow
   * segment; for a convex footprint that is exactly the convex hull of the
   * footprint and its translate, which is what this returns.
   *
   * APPROXIMATION: for a CONCAVE footprint (an L-shaped block, a courtyard)
   * the hull also fills the notch, over-shading it slightly. Footprints here
   * average 4.7 vertices after simplification, so notches are rare and small;
   * over-shading a re-entrant corner is also the safer error for this app than
   * declaring it sunny.
   */
  private sweptShadowPolygon(points: GeoPoint[], dx: number, dy: number): GeoPoint[] {
    const base = points.map(toMercator);
    const moved = base.map((m) => ({ x: m.x + dx, y: m.y + dy }));
    return this.convexHull([...base, ...moved]).map((m) => fromMercator(m.x, m.y));
  }

  /**
   * Ground distance in metres from a point to the closest point ON THE
   * FOOTPRINT'S BOUNDARY (not its nearest corner, and not its centroid).
   *
   * The nearest VERTEX is not a conservative substitute: along a 200m wall the
   * nearest wall face can be 25m away while both corners are over 100m away,
   * so a vertex-based test rejects shading that plainly happens. Only the
   * nearest point on an edge is guaranteed to be <= the true distance.
   *
   * Note the `* Math.cos(lat)`: web-Mercator units are metres AT THE EQUATOR,
   * inflated by 1/cos(latitude) elsewhere. At Lisbon's 38.7 degrees that is a
   * factor of 1.28, so raw Mercator lengths overstate ground distance by 28%
   * — which, in a test of the form "is the building close enough to matter",
   * silently discards real shade.
   */
  private nearestEdgeDistanceM(
    pointM: { x: number; y: number },
    points: GeoPoint[],
    latitudeDeg: number
  ): number {
    const poly = points.map(toMercator);
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j];
      const b = poly[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) {
        t = ((pointM.x - a.x) * dx + (pointM.y - a.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const d = Math.hypot(pointM.x - (a.x + t * dx), pointM.y - (a.y + t * dy));
      if (d < best) best = d;
    }
    return best * Math.cos((latitudeDeg * Math.PI) / 180);
  }

  /** Monotone chain convex hull, counter-clockwise. */
  private convexHull(points: { x: number; y: number }[]): { x: number; y: number }[] {
    if (points.length < 3) return points;
    const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
    const cross = (
      o: { x: number; y: number },
      a: { x: number; y: number },
      b: { x: number; y: number }
    ) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const build = (src: { x: number; y: number }[]) => {
      const out: { x: number; y: number }[] = [];
      for (const p of src) {
        while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
        out.push(p);
      }
      out.pop();
      return out;
    };

    const hull = [...build(pts), ...build([...pts].reverse())];
    return hull.length >= 3 ? hull : points;
  }

  private polygonCenter(points: GeoPoint[]): GeoPoint {
    let lat = 0,
      lng = 0;
    for (const p of points) {
      lat += p.lat;
      lng += p.lng;
    }
    return { lat: lat / points.length, lng: lng / points.length };
  }

  pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
    const mercator = toMercator(point);
    const poly = polygon.map(toMercator);
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x,
        yi = poly[i].y;
      const xj = poly[j].x,
        yj = poly[j].y;
      const intersect =
        yi > mercator.y !== yj > mercator.y &&
        mercator.x < ((xj - xi) * (mercator.y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  /** Ring points that are not built over, keyed by point+orientation. */
  private usableSamplesCache = new Map<string, GeoPoint[]>();

  computeShadowCoverage(
    targetPoint: GeoPoint,
    targetOrientationDeg: number,
    buildings: BuildingFootprint[],
    date: Date,
    lat: number,
    lng: number,
    heightBias: number = 0
  ): number {
    if (!SunService.isDaytime(date, lat, lng)) return 100;

    const sunPos = SunService.getSunPosition(date, lat, lng);
    const elevation = sunPos.elevation;
    if (elevation < 1) return 80;

    let shadowedCount = 0;
    const samplePoints = this.usableSamplePoints(targetPoint, targetOrientationDeg, buildings);
    const samples = samplePoints.length;

    // One terrain lookup for the whole venue: the sample ring has a 15m radius
    // and the DEM cell is ~90m, so every sample sits in the same cell anyway.
    // Sampling per point would cost 12x for a difference the data cannot see.
    const pointAltitude = TerrainService.altitudeAt(targetPoint);

    for (const sp of samplePoints) {
      let inShadow = false;
      for (const building of buildings) {
        if (this.isBlockedByBuilding(sp, building, sunPos, pointAltitude, heightBias)) {
          inShadow = true;
          break;
        }
      }
      if (inShadow) shadowedCount++;
    }

    return (shadowedCount / samples) * 100;
  }

  /**
   * The sample ring, minus every point that falls INSIDE a building.
   *
   * The ring has a 15m radius, which in the Alfama or around a miradouro puts
   * half its points inside the neighbouring blocks. A point inside a block is
   * not somewhere anyone can sit: counting it as shaded drags the venue's
   * exposure down with ground that is not the venue. Measured at 13:30 before
   * this filter: 5 of 12 points inside a building at Portas do Sol, 10 of 12
   * at Santa Catarina, 9 of 12 at Jardim da Estrela — a park, whose ring lands
   * in its own glasshouses.
   *
   * Points merely ADJACENT to a wall are kept. A terrace hard against a
   * building is the most common case this app has to get right, and it is
   * genuinely shaded by it.
   *
   * Fallback: if every point is built over, the venue's own coordinate is used
   * alone. That is the rooftop case (a rooftop bar IS inside its footprint),
   * and it keeps the old behaviour rather than returning nothing.
   *
   * Cached per (point, orientation): the ring does not depend on the hour, so
   * this runs once per venue instead of 24 times.
   */
  private usableSamplePoints(
    center: GeoPoint,
    orientationDeg: number,
    buildings: BuildingFootprint[]
  ): GeoPoint[] {
    const key = `${center.lat},${center.lng},${orientationDeg},${buildings.length}`;
    const cached = this.usableSamplesCache.get(key);
    if (cached) return cached;

    const ring = this.generateSamplePoints(center, orientationDeg, SAMPLE_RING_RADIUS_M);
    const open = ring.filter((p) => !buildings.some((b) => this.pointInPolygon(p, b.points)));
    const usable = open.length > 0 ? open : [center];
    this.usableSamplesCache.set(key, usable);
    return usable;
  }

  private generateSamplePoints(center: GeoPoint, orientationDeg: number, radiusM: number): GeoPoint[] {
    const points: GeoPoint[] = [];
    const c = toMercator(center);
    for (let i = 0; i < 12; i++) {
      const angle = (orientationDeg + (i / 12) * 360) * (Math.PI / 180);
      const x = c.x + Math.cos(angle) * radiusM;
      const y = c.y + Math.sin(angle) * radiusM;
      points.push(fromMercator(x, y));
    }
    return points;
  }

  private isBlockedByBuilding(
    point: GeoPoint,
    building: BuildingFootprint,
    sunPos: { azimuth: number; elevation: number },
    pointAltitude: number,
    heightBias: number = 0
  ): boolean {
    const sunElRad = sunPos.elevation * (Math.PI / 180);
    if (sunElRad < 0.01) return true;

    // THE TERRAIN FIX. What can shadow this point is not the building's own
    // height but how far its roof stands above the point's ground. A building
    // downhill from a miradouro has a negative effective height and is
    // dismissed here, before any geometry runs.
    const effectiveHeight = building.altitude + bracketedHeight(building, heightBias) - pointAltitude;
    if (effectiveHeight <= 0) return false;

    const pointM = toMercator(point);
    const buildingCenter = this.polygonCenter(building.points);
    const buildingM = toMercator(buildingCenter);

    const dx = buildingM.x - pointM.x;
    const dy = buildingM.y - pointM.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 1) return false;

    // Bearing of the building as seen from the point: atan2(east, north).
    const buildingAzimuth = (Math.atan2(dx, dy) * 180) / Math.PI;
    const azDiff = this.normalizeAngle(buildingAzimuth - sunPos.azimuth);

    // Cheap early-out #1: is the building even roughly in the sun's direction?
    // Only safe for buildings that are FAR. Measured from 8m away, a facade
    // spans most of the sky, and its centroid's bearing swings right across
    // the sample ring — so a fixed 60-degree cone around the centroid throws
    // away the shade of the very building you are sitting against, which is
    // the single most common case this app has to get right. Close buildings
    // skip straight to the exact polygon test; there are few enough of them
    // for that to be cheap.
    const nearest = this.nearestEdgeDistanceM(pointM, building.points, point.lat);
    if (nearest > AZIMUTH_FILTER_MIN_DISTANCE_M && Math.abs(azDiff) > 60) return false;

    // Cheap early-out #2: could this building possibly be tall enough, from here,
    // to reach above the sun? It must be CONSERVATIVE — it may only reject
    // cases the polygon test would also reject, never the reverse.
    //
    // Measuring to the centroid is not conservative: for a long building the
    // nearest wall can be metres away while the centroid is far, so the test
    // declared "too low to matter" for points the building plainly shades. The
    // nearest vertex is the right yardstick — it under-states the distance,
    // which over-states the angular size, which can only ever let a candidate
    // through to the exact polygon test below.
    const angularSize = Math.atan(effectiveHeight / Math.max(1, nearest)) * (180 / Math.PI);
    if (angularSize < sunPos.elevation) return false;

    // Shadow reach is likewise driven by the effective height: a building that
    // stands only 2m above the observer throws a short shadow at their level,
    // whatever its absolute height.
    const reach = Math.min(MAX_SHADOW_LENGTH_M, effectiveHeight / Math.tan(sunElRad));
    const shadowDirRad = ((sunPos.azimuth + 180) % 360) * (Math.PI / 180);
    const shadowVec = bearingToVector(shadowDirRad);
    const shadowDx = shadowVec.x * reach;
    const shadowDy = shadowVec.y * reach;

    const shadowPolygon = this.sweptShadowPolygon(building.points, shadowDx, shadowDy);
    return this.pointInPolygon(point, shadowPolygon);
  }

  private normalizeAngle(angle: number): number {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  }

  computeSunExposureForHour(
    hour: number,
    venueLat: number,
    venueLng: number,
    venueOrientation: number,
    buildings: BuildingFootprint[],
    date: Date,
    heightBias: number = 0
  ): number {
    const testDate = new Date(date);
    testDate.setHours(hour, 30, 0, 0);

    if (!SunService.isDaytime(testDate, venueLat, venueLng)) return 0;

    const coverage = this.computeShadowCoverage(
      { lat: venueLat, lng: venueLng },
      venueOrientation,
      buildings,
      testDate,
      venueLat,
      venueLng,
      heightBias
    );

    const sunData = SunService.getSunData(testDate, venueLat, venueLng);
    const elevation = sunData.elevation;
    const intensityFactor = Math.max(0, Math.min(1, elevation / 60));

    return Math.round(Math.max(0, 100 - coverage) * (0.6 + 0.4 * intensityFactor));
  }
}

export const ShadowService = new ShadowServiceClass();
