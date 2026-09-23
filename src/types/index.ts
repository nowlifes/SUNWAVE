export type SunMode = 'SUN' | 'SHADE';

export type VenueCategory =
  | 'cafe'
  | 'restaurant'
  | 'bar'
  | 'rooftop'
  | 'park'
  | 'beach'
  | 'viewpoint'
  | 'square';

export type Confidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface OpeningHours {
  open: string; // "08:00"
  close: string; // "22:00"
}

export interface WeeklyHours {
  [key: number]: OpeningHours | null; // 0=Sun ... 6=Sat
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface OutdoorPolygon {
  points: GeoPoint[];
  areaM2: number;
  orientationDeg: number; // 0 = north-facing
}

export interface SunExposure {
  percentage: number; // 0-100
  confidence: Confidence;
  startTime: string | null;
  endTime: string | null;
}

export interface Venue {
  id: string;
  name: string;
  category: VenueCategory;
  latitude: number;
  longitude: number;
  address: string;
  rating: number;
  photo: string;
  isOpen: boolean;
  openingHours: WeeklyHours;
  hasOutdoorArea: boolean;
  outdoorPolygon: OutdoorPolygon | null;
  buildingHeight: number; // meters
  /** Ground elevation of the venue, metres above sea level (~90m DEM).
   *  Lisbon's miradouros sit tens of metres above the streets around them;
   *  without this the shadow engine hands them shadows from buildings far
   *  below that can never reach them. */
  altitude: number;
  confidence: Confidence;
  sunExposureByHour: number[]; // 24 values, 0-100
  shadeExposureByHour: number[]; // 24 values, 0-100
  /** `sunExposureByHour` bracketed by the uncertainty on neighbour heights.
   *  `sunBand.mid` IS `sunExposureByHour` — same array of numbers. */
  sunBand: ExposureBand;
  /** Where the heights used for that computation came from. */
  heightProvenance: HeightProvenance;
  description: string;
}

export interface SunData {
  timestamp: Date;
  sunrise: Date;
  sunset: Date;
  azimuth: number;
  elevation: number;
}

export interface SunPosition {
  azimuth: number;
  elevation: number;
}

/** Where a building's height number actually came from. `estimated` means the
 *  OSM data carried no height at all and the value is a typology guess — the
 *  UI must never present it as measured. */
export type HeightSource = 'tagged' | 'levels' | 'estimated';

/** How many of the buildings behind one figure had a measured height, a height
 *  derived from a floor count, or no height at all. Counted over the buildings
 *  actually fed to the shadow engine for that venue, not over the whole city. */
export interface HeightProvenance {
  tagged: number;
  levels: number;
  estimated: number;
  total: number;
}

/** A sun-exposure figure WITH the width of the doubt around it.
 *
 *  `mid` is the number the app has always shown. `low` and `high` come from
 *  re-running the same geometry with every UNMEASURED neighbour one storey
 *  taller and one storey shorter — the dominant error in this model, since 70%
 *  of Lisbon's footprints carry no height in OSM at all. A narrow band means
 *  the answer does not depend on those guesses; a wide one means it does. */
export interface ExposureBand {
  /** 24 values, 0-100 — central estimate. */
  mid: number[];
  /** 24 values, 0-100 — pessimistic end of the band. */
  low: number[];
  /** 24 values, 0-100 — optimistic end of the band. */
  high: number[];
}

export interface BuildingFootprint {
  id: string;
  points: GeoPoint[];
  /** Height of the building itself, in metres above its own base. */
  height: number;
  /** Provenance of `height` — see HeightSource. */
  heightSource: HeightSource;
  /** Ground elevation of the building's base, metres above sea level.
   *  Lisbon is built on hills: a building's roof is at `altitude + height`,
   *  and comparing that against the observed point's own altitude is the only
   *  way to know whether it can occlude the sun. ~90m DEM, +/- several metres. */
  altitude: number;
}

export interface Recommendation {
  venue: Venue;
  sunMatch: number;
  sunPercentage: number;
  shadePercentage: number;
  walkTimeMin: number;
  distanceM: number;
  sunWindowStart: string | null;
  sunWindowEnd: string | null;
  sunWindowDurationMin: number;
  confidence: Confidence;
  sunArrivesInMin: number | null;
  sunLeavesInMin: number | null;
  /** `sunArrivesInMin` pointe sur le lendemain matin (rien de plus aujourd'hui). */
  arrivesTomorrow: boolean;
  /** Mode Ombre : l'ombre tient jusqu'au coucher du soleil, qui clôt la fenêtre. */
  lastsUntilSunset: boolean;
  isOpen: boolean;
}

export interface UserLocation {
  coords: GeoPoint;
  accuracy: number;
  granted: boolean;
  /** Position GPS obtenue mais hors de Lisbonne : l'app mesure depuis le centre. */
  outsideLisbon: boolean;
}

export interface WeatherData {
  temperature: number;
  condition: 'clear' | 'partly_cloudy' | 'cloudy' | 'rain' | 'windy';
  rainProbability: number;
  windSpeedKmh: number;
  description: string;
}

export interface Report {
  id: string;
  venueId: string;
  type: ReportType;
  timestamp: number;
}

export type ReportType =
  | 'terrace_shaded'
  | 'terrace_sunny'
  | 'terrace_missing'
  | 'venue_closed'
  | 'building_missing'
  | 'outdoor_different'
  | 'other';

export type ScreenName = 'now' | 'map' | 'discover' | 'saved' | 'profile';

export interface DiscoverCategory {
  id: string;
  label: string;
  icon: string;
  mode: SunMode | 'ANY';
  categories: VenueCategory[];
  description: string;
}
