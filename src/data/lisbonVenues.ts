import type {
  Confidence,
  GeoPoint,
  OutdoorPolygon,
  Venue,
  VenueCategory,
  WeeklyHours,
} from '@/types';
import { lisbonBuildings } from './lisbonBuildings';
import { VenueSunService } from '@/services/VenueSunService';
import { TerrainService } from '@/services/TerrainService';

// The venue module is evaluated once when the app loads, for "today" — see
// the architecture note in the research log: TimeSlider only ever scrubs the
// hour within the current calendar day, never the day itself, so a curve
// computed once at load time for `new Date()` is accurate for the whole
// session (it goes slightly stale only if the tab is left open past
// midnight, which is an accepted edge case).
const TODAY = new Date();

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

function offsetPoint(center: GeoPoint, dxM: number, dyM: number): GeoPoint {
  const latRad = (center.lat * Math.PI) / 180;
  const dLat = dyM / 111111;
  const dLng = dxM / (111111 * Math.cos(latRad));
  return { lat: center.lat + dLat, lng: center.lng + dLng };
}

/**
 * Creates a small rectangle (roughly `widthM` x `depthM` meters) representing an
 * outdoor terrace / garden area. `orientationDeg` records which way the longest
 * edge faces (0 = north, 90 = east, 180 = south, 270 = west).
 */
function makeOutdoorPolygon(
  center: GeoPoint,
  widthM: number,
  depthM: number,
  orientationDeg: number
): OutdoorPolygon {
  const w = widthM / 2;
  const d = depthM / 2;
  const areaM2 = Math.round(widthM * depthM);
  return {
    points: [
      offsetPoint(center, -w, -d),
      offsetPoint(center, w, -d),
      offsetPoint(center, w, d),
      offsetPoint(center, -w, d),
    ],
    areaM2,
    orientationDeg,
  };
}

// ---------------------------------------------------------------------------
// Sun / shade curve — REAL physics, not invented curves
// ---------------------------------------------------------------------------
// Historically this file generated 24-value arrays from a hand-picked
// "archetype" bell curve per venue (rooftop/park/street-dense/...). That
// never called the real shadow-physics engine. It now delegates to
// VenueSunService, which runs ShadowService.computeSunExposureForHour against
// the real OSM building footprints in lisbonBuildings.ts for every hour.
//
// `SunProfile` is kept purely as descriptive metadata on each venue spec
// (documents the intended character of the spot) — it no longer drives the
// calculation, VenueSpec still carries it so none of the 64 venue() call
// sites below need touching.
type SunProfile =
  | 'rooftop'
  | 'viewpoint'
  | 'park'
  | 'beach'
  | 'square'
  | 'street-dense'
  | 'street-mixed'
  | 'street-open'
  | 'indoor-shaded';

// ---------------------------------------------------------------------------
// Opening-hours helpers
// ---------------------------------------------------------------------------

function cafeHours(shortSunday = true): WeeklyHours {
  const weekdays = [1, 2, 3, 4, 5] as const;
  const hours: WeeklyHours = {};
  for (const d of weekdays) hours[d] = { open: '08:00', close: '19:00' };
  hours[6] = { open: '09:00', close: '19:00' };
  hours[0] = shortSunday ? { open: '09:00', close: '17:00' } : null;
  return hours;
}

function restaurantHours(): WeeklyHours {
  const weekdays = [1, 2, 3, 4, 5, 6] as const;
  const hours: WeeklyHours = {};
  for (const d of weekdays) hours[d] = { open: '12:00', close: '23:00' };
  hours[0] = { open: '12:00', close: '22:00' };
  return hours;
}

function barHours(): WeeklyHours {
  const weekdays = [2, 3, 4, 5, 6] as const;
  const hours: WeeklyHours = {};
  for (const d of weekdays) hours[d] = { open: '18:00', close: '02:00' };
  hours[1] = { open: '18:00', close: '24:00' };
  hours[0] = { open: '17:00', close: '24:00' };
  return hours;
}

function rooftopHours(): WeeklyHours {
  const weekdays = [1, 2, 3, 4, 5, 6] as const;
  const hours: WeeklyHours = {};
  for (const d of weekdays) hours[d] = { open: '17:00', close: '01:00' };
  hours[0] = { open: '17:00', close: '24:00' };
  return hours;
}

function parkHours(): WeeklyHours {
  const hours: WeeklyHours = {};
  for (let d = 0; d <= 6; d++) hours[d] = { open: '06:00', close: '22:00' };
  return hours;
}

function alwaysOpen(): WeeklyHours {
  const hours: WeeklyHours = {};
  for (let d = 0; d <= 6; d++) hours[d] = { open: '00:00', close: '23:59' };
  return hours;
}

// ---------------------------------------------------------------------------
// Venue builder
// ---------------------------------------------------------------------------

let idCounter = 0;

interface VenueSpec {
  name: string;
  category: VenueCategory;
  lat: number;
  lng: number;
  address: string;
  rating: number;
  isOpen: boolean;
  hours: WeeklyHours;
  hasOutdoor: boolean;
  polygon: OutdoorPolygon | null;
  buildingHeight: number;
  confidence: Confidence;
  sunProfile: SunProfile;
  description: string;
}

function venue(spec: VenueSpec): Venue {
  const seed = ++idCounter;
  const id = `v_${String(seed).padStart(2, '0')}`;
  const sun = VenueSunService.computeExposureCurve(
    {
      id,
      lat: spec.lat,
      lng: spec.lng,
      orientationDeg: spec.polygon?.orientationDeg ?? 180,
    },
    lisbonBuildings,
    TODAY
  );
  return {
    id,
    name: spec.name,
    category: spec.category,
    latitude: spec.lat,
    longitude: spec.lng,
    address: spec.address,
    rating: spec.rating,
    photo: '',
    isOpen: spec.isOpen,
    openingHours: spec.hours,
    hasOutdoorArea: spec.hasOutdoor,
    outdoorPolygon: spec.polygon,
    buildingHeight: spec.buildingHeight,
    // Ground elevation from the frozen ~90m terrain grid. This is what lets
    // the shadow engine know a miradouro stands above the roofs below it.
    altitude: TerrainService.altitudeAtRounded({ lat: spec.lat, lng: spec.lng }),
    confidence: spec.confidence,
    sunExposureByHour: sun,
    shadeExposureByHour: sun.map((s) => 100 - s),
    description: spec.description,
  };
}

function poly(
  lat: number,
  lng: number,
  w: number,
  d: number,
  orient: number
): OutdoorPolygon {
  return makeOutdoorPolygon({ lat, lng }, w, d, orient);
}

// ---------------------------------------------------------------------------
// 64 Venues
// ---------------------------------------------------------------------------

export const lisbonVenues: Venue[] = [
  // --- Chiado (38.7138, -9.1420) ---
  venue({
    name: 'Café Miradouro',
    category: 'cafe',
    lat: 38.714041,
    lng: -9.14103,
    address: 'Rua da Misericórdia 2, Chiado',
    rating: 4.5,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.714041, -9.14103, 12, 8, 180),
    buildingHeight: 24,
    confidence: 'HIGH',
    sunProfile: 'street-mixed',
    description:
      'Charming café terrace overlooking the Misericórdia, a sunny mid-morning spot in the heart of Chiado.',
  }),
  venue({
    name: 'Hello, Kristof',
    category: 'cafe',
    lat: 38.715423,
    lng: -9.14285,
    address: 'Rua da Rosa 9, Bairro Alto',
    rating: 4.6,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.715423, -9.14285, 10, 6, 90),
    buildingHeight: 18,
    confidence: 'MEDIUM',
    sunProfile: 'street-dense',
    description:
      'Cozy specialty coffee bar on the Bairro Alto slope, shaded by tall neighbours in the early afternoon.',
  }),
  venue({
    name: 'Dear Breakfast',
    category: 'cafe',
    lat: 38.713122,
    lng: -9.140724,
    address: 'Rua da Madalena 83, Baixa',
    rating: 4.4,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: false,
    polygon: null,
    buildingHeight: 22,
    confidence: 'MEDIUM',
    sunProfile: 'street-dense',
    description:
      'Popular all-day brunch café in the Baixa grid, indoor seating with a small step-out balcony.',
  }),
  venue({
    name: 'Taberna da Rua das Flores',
    category: 'restaurant',
    lat: 38.7148,
    lng: -9.1438,
    address: 'Rua das Flores 103, Chiado',
    rating: 4.7,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.7148, -9.1438, 8, 6, 180),
    buildingHeight: 20,
    confidence: 'HIGH',
    sunProfile: 'street-mixed',
    description:
      'Historic tavern on a pedestrian street, tiny outdoor stools that catch afternoon sun between the buildings.',
  }),
  venue({
    name: 'Sea Me',
    category: 'restaurant',
    lat: 38.7125,
    lng: -9.1415,
    address: 'Rua das Salgadeiras 2, Bairro Alto',
    rating: 4.5,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.7125, -9.1415, 10, 7, 180),
    buildingHeight: 19,
    confidence: 'HIGH',
    sunProfile: 'street-mixed',
    description:
      'Modern Portuguese-Japanese fusion seafood in Bairro Alto with a lively sidewalk terrace.',
  }),
  venue({
    name: 'Bairro do Avillez',
    category: 'restaurant',
    lat: 38.714323,
    lng: -9.142231,
    address: 'R. de D. Pedro V 13, Chiado',
    rating: 4.8,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: false,
    polygon: null,
    buildingHeight: 26,
    confidence: 'HIGH',
    sunProfile: 'street-dense',
    description:
      "José Avillez's flagship gastronomic complex — indoor only, no outdoor seating.",
  }),

  // --- Baixa (38.7118, -9.1375) ---
  venue({
    name: 'Time Out Market',
    category: 'restaurant',
    lat: 38.7065,
    lng: -9.1445,
    address: 'Av. 24 de Julho 50, Cais do Sodré',
    rating: 4.6,
    isOpen: true,
    hours: {
      0: { open: '10:00', close: '24:00' },
      1: { open: '10:00', close: '24:00' },
      2: { open: '10:00', close: '24:00' },
      3: { open: '10:00', close: '24:00' },
      4: { open: '10:00', close: '24:00' },
      5: { open: '10:00', close: '01:00' },
      6: { open: '10:00', close: '01:00' },
    },
    hasOutdoor: false,
    polygon: null,
    buildingHeight: 18,
    confidence: 'HIGH',
    sunProfile: 'street-dense',
    description:
      'Lisbon’s celebrated food hall inside the Mercado da Ribeira — indoor counters, no outdoor area.',
  }),
  venue({
    name: 'A Cevicheria',
    category: 'restaurant',
    lat: 38.7120,
    lng: -9.1368,
    address: 'Rua de São Nicolau 8, Baixa',
    rating: 4.6,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: false,
    polygon: null,
    buildingHeight: 24,
    confidence: 'MEDIUM',
    sunProfile: 'street-dense',
    description:
      'Peruvian ceviche counter under a giant octopus, tucked into the narrow Baixa grid.',
  }),
  venue({
    name: 'Copenhagen Coffee Lab',
    category: 'cafe',
    lat: 38.7108,
    lng: -9.1382,
    address: 'R. Nova da Trindade 16, Baixa',
    rating: 4.5,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.7108, -9.1382, 9, 5, 90),
    buildingHeight: 25,
    confidence: 'HIGH',
    sunProfile: 'street-dense',
    description:
      'Nordic roastery on a busy Baixa corner; a slim outdoor bench facing east that warms up mid-morning.',
  }),
  venue({
    name: 'Praça do Comércio',
    category: 'square',
    lat: 38.707461,
    lng: -9.136529,
    address: 'Praça do Comércio, Baixa',
    rating: 4.8,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.707461, -9.136529, 30, 20, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      'Lisbon’s grand riverside square — vast open plaza with a south-facing arcaded waterfront.',
  }),
  venue({
    name: 'Praça da Figueira',
    category: 'square',
    lat: 38.7140,
    lng: -9.1385,
    address: 'Praça da Figueira, Baixa',
    rating: 4.3,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.7140, -9.1385, 25, 18, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      'Lively Baixa square ringed by pastel buildings, with café terraces along the south edge.',
  }),
  venue({
    name: 'Rossio Square',
    category: 'square',
    lat: 38.7150,
    lng: -9.1395,
    address: 'Praça D. Pedro IV (Rossio), Baixa',
    rating: 4.4,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.7150, -9.1395, 28, 20, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      'Wave-paved Rossio square with fountains and kiosks, a sun-trap between the Baixa blocks.',
  }),

  // --- Bairro Alto (38.7155, -9.1445) ---
  venue({
    name: 'Pensão Amor',
    category: 'bar',
    lat: 38.715845,
    lng: -9.1455,
    address: 'R. da Alecrim 58, Cais do Sodré',
    rating: 4.4,
    isOpen: true,
    hours: barHours(),
    hasOutdoor: true,
    polygon: poly(38.715845, -9.1455, 10, 6, 180),
    buildingHeight: 20,
    confidence: 'HIGH',
    sunProfile: 'street-mixed',
    description:
      'Former brothel turned cocktail bar with a sidewalk drinking spot facing the river breeze.',
  }),
  venue({
    name: 'Red Frog',
    category: 'bar',
    lat: 38.7162,
    lng: -9.1448,
    address: 'R. da Atalaia 18, Bairro Alto',
    rating: 4.5,
    isOpen: true,
    hours: barHours(),
    hasOutdoor: false,
    polygon: null,
    buildingHeight: 17,
    confidence: 'MEDIUM',
    sunProfile: 'street-dense',
    description:
      'Speakeasy cocktail bar down a Bairro Alto lane — intimate, indoor-only.',
  }),
  venue({
    name: 'The Decadente',
    category: 'bar',
    lat: 38.715072,
    lng: -9.14604,
    address: 'R. da Rosa 15, Bairro Alto',
    rating: 4.3,
    isOpen: true,
    hours: barHours(),
    hasOutdoor: true,
    polygon: poly(38.715072, -9.14604, 8, 5, 180),
    buildingHeight: 18,
    confidence: 'MEDIUM',
    sunProfile: 'street-dense',
    description:
      'Hotel bar with a small rear terrace that catches late-afternoon light over the rooftops.',
  }),
  venue({
    name: 'Largo do Carmo',
    category: 'square',
    lat: 38.713852,
    lng: -9.139921,
    address: 'Largo do Carmo, Chiado',
    rating: 4.5,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.713852, -9.139921, 18, 14, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      'Pedestrian square by the Carmo convent ruins — leafy, partially shaded, a favourite sunset café spot.',
  }),

  // --- Príncipe Real (38.7170, -9.1480) ---
  venue({
    name: 'Príncipe Real Garden',
    category: 'park',
    lat: 38.7168,
    lng: -9.1482,
    address: 'Praça do Príncipe Real, Príncipe Real',
    rating: 4.6,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.7168, -9.1482, 22, 16, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      'Tree-shaded garden on the Príncipe Real plateau with a cedar canopy and kiosk terrace.',
  }),
  venue({
    name: 'Cantinho das Gáveas',
    category: 'restaurant',
    lat: 38.7174,
    lng: -9.1486,
    address: 'R. da Escola Politécnica 78, Príncipe Real',
    rating: 4.4,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.7174, -9.1486, 10, 7, 180),
    buildingHeight: 21,
    confidence: 'HIGH',
    sunProfile: 'street-mixed',
    description:
      'Beloved neighbourhood bistro with a few street tables that fill with sun at lunchtime.',
  }),
  venue({
    name: 'Praça do Príncipe Real',
    category: 'square',
    lat: 38.7172,
    lng: -9.1484,
    address: 'Praça do Príncipe Real, Príncipe Real',
    rating: 4.5,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.7172, -9.1484, 24, 18, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      'Elegant square encircled by 19th-century mansions, home to the famous cedar tree.',
  }),

  // --- Alfama (38.7125, -9.1295) ---
  venue({
    name: 'Miradouro das Portas do Sol',
    category: 'viewpoint',
    lat: 38.713262,
    lng: -9.129733,
    address: 'Largo das Portas do Sol, Alfama',
    rating: 4.9,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.713262, -9.129733, 20, 12, 90),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      'Iconic Alfama terrace with sweeping views over the Tagus and the red-tile roofs — fully sun-exposed.',
  }),
  venue({
    name: 'Miradouro de Santa Luzia',
    category: 'viewpoint',
    lat: 38.7128,
    lng: -9.1302,
    address: 'Largo de Santa Luzia, Alfama',
    rating: 4.8,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.7128, -9.1302, 16, 10, 90),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      'Wisteria-draped viewpoint just below Portas do Sol; morning sun, afternoon pergola shade.',
  }),
  venue({
    name: 'Café da Garagem',
    category: 'cafe',
    lat: 38.712653,
    lng: -9.130988,
    address: 'Costa do Castelo 74, Graça',
    rating: 4.7,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.712653, -9.130988, 12, 8, 90),
    buildingHeight: 14,
    confidence: 'HIGH',
    sunProfile: 'street-open',
    description:
      'Bohemian café above a parking garage with a balcony terrace facing the river — a sunrise favourite.',
  }),
  venue({
    name: 'Faz Figura',
    category: 'restaurant',
    lat: 38.711628,
    lng: -9.128927,
    address: 'R. dos Bacalhoeiros 12, Alfama',
    rating: 4.5,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.711628, -9.128927, 8, 6, 180),
    buildingHeight: 15,
    confidence: 'MEDIUM',
    sunProfile: 'street-mixed',
    description:
      'Traditional Portuguese kitchen in the Alfama lanes, a tiny outdoor table on the cobbled slope.',
  }),

  // --- Cais do Sodré (38.7068, -9.1450) ---
  venue({
    name: 'Goa Labs',
    category: 'bar',
    lat: 38.70738,
    lng: -9.145527,
    address: 'R. da Boavista 84, Cais do Sodré',
    rating: 4.3,
    isOpen: true,
    hours: barHours(),
    hasOutdoor: true,
    polygon: poly(38.70738, -9.145527, 10, 6, 180),
    buildingHeight: 20,
    confidence: 'MEDIUM',
    sunProfile: 'street-mixed',
    description:
      'Indian-inspired cocktail bar with a leafy back patio that gets afternoon rays between the walls.',
  }),
  venue({
    name: 'Comoba',
    category: 'cafe',
    lat: 38.7060,
    lng: -9.1462,
    address: 'R. da Boavista 120, Cais do Sodré',
    rating: 4.4,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.7060, -9.1462, 12, 7, 180),
    buildingHeight: 19,
    confidence: 'HIGH',
    sunProfile: 'street-mixed',
    description:
      'Australian-run brunch spot with a pavement terrace — bright and sunny from late morning.',
  }),
  venue({
    name: 'Cervejaria Ramiro',
    category: 'restaurant',
    lat: 38.7058,
    lng: -9.1438,
    address: 'Av. Almirante Reis 1H, Cais do Sodré',
    rating: 4.7,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: false,
    polygon: null,
    buildingHeight: 16,
    confidence: 'HIGH',
    sunProfile: 'indoor-shaded',
    description:
      "Lisbon's legendary seafood house — a bustling indoor cervejaria, no outdoor seating.",
  }),
  venue({
    name: 'Pensão Amor Santos',
    category: 'bar',
    lat: 38.7075,
    lng: -9.1505,
    address: 'R. da Boavista 120, Santos',
    rating: 4.1,
    isOpen: false,
    hours: barHours(),
    hasOutdoor: true,
    polygon: poly(38.7075, -9.1505, 8, 5, 180),
    buildingHeight: 18,
    confidence: 'LOW',
    sunProfile: 'street-mixed',
    description:
      'Closed sibling of the Cais do Sodré cocktail bar — a small Santos patio awaiting reopening.',
  }),

  // --- Santa Catarina (38.7105, -9.1465) ---
  venue({
    name: 'Miradouro de Santa Catarina',
    category: 'viewpoint',
    lat: 38.710759,
    lng: -9.14691,
    address: 'R. de Santa Catarina, Santa Catarina',
    rating: 4.7,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.710759, -9.14691, 22, 14, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      'Riverside viewpoint with the famous "No. 4" kiosk — open to the sun all afternoon with river views.',
  }),
  venue({
    name: 'Wish Slow',
    category: 'cafe',
    lat: 38.711289,
    lng: -9.14738,
    address: 'R. de Santa Catarina 86, Santa Catarina',
    rating: 4.5,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.711289, -9.14738, 10, 6, 180),
    buildingHeight: 19,
    confidence: 'MEDIUM',
    sunProfile: 'street-open',
    description:
      'Healthy brunch café steps from the viewpoint — a small terrace that gets full midday sun.',
  }),
  venue({
    name: 'House of Wonders',
    category: 'cafe',
    lat: 38.7110,
    lng: -9.1480,
    address: 'R. da Boavista 24, Santa Catarina',
    rating: 4.5,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.7110, -9.1480, 9, 6, 90),
    buildingHeight: 18,
    confidence: 'MEDIUM',
    sunProfile: 'street-mixed',
    description:
      'Quirky vegetarian café with a rooftop nook — east-facing, morning sun, shaded by afternoon.',
  }),

  // --- Estrela / Lapa (38.7145, -9.1550) ---
  venue({
    name: 'Jardim da Estrela',
    category: 'park',
    lat: 38.714765,
    lng: -9.155447,
    address: 'R. da Estrela, Estrela',
    rating: 4.7,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.714765, -9.155447, 28, 20, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      'Romantic 19th-century garden with ponds, palms and a kiosk — a green sun-and-shade oasis in Estrela.',
  }),
  venue({
    name: 'Estrela Park',
    category: 'park',
    lat: 38.7152,
    lng: -9.1558,
    address: 'Campo de Ourique, Estrela',
    rating: 4.6,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.7152, -9.1558, 26, 18, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      'Formal park beside the Basílica da Estrela — wide lawns that bake in the afternoon sun.',
  }),
  venue({
    name: 'Os Lusiadas',
    category: 'restaurant',
    lat: 38.7142,
    lng: -9.1548,
    address: 'R. do Telhal 5, Lapa',
    rating: 4.4,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.7142, -9.1548, 9, 6, 180),
    buildingHeight: 22,
    confidence: 'MEDIUM',
    sunProfile: 'street-mixed',
    description:
      'Quiet Lapa restaurant with a south-facing patio — dappled sun through the plane trees at lunch.',
  }),
  venue({
    name: 'The Mill',
    category: 'cafe',
    lat: 38.7162,
    lng: -9.1552,
    address: 'R. de São Domingos 42, Lapa',
    rating: 4.5,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.7162, -9.1552, 10, 6, 90),
    buildingHeight: 20,
    confidence: 'MEDIUM',
    sunProfile: 'street-mixed',
    description:
      'Specialty coffee shop on the Lapa ridge — east-facing window counter warms up by mid-morning.',
  }),

  // --- Santos (38.7070, -9.1510) ---
  venue({
    name: 'Fauna & Flora',
    category: 'cafe',
    lat: 38.7072,
    lng: -9.1512,
    address: 'R. da Boavista 43A, Santos',
    rating: 4.6,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.7072, -9.1512, 11, 7, 180),
    buildingHeight: 18,
    confidence: 'HIGH',
    sunProfile: 'street-open',
    description:
      'Plant-filled brunch café in Santos — a sunny street terrace popular with freelancers.',
  }),
  venue({
    name: 'LX Factory Bar',
    category: 'bar',
    lat: 38.7068,
    lng: -9.1520,
    address: 'R. Rodrigues de Faria 103, Alcântara',
    rating: 4.4,
    isOpen: true,
    hours: barHours(),
    hasOutdoor: true,
    polygon: poly(38.7068, -9.1520, 14, 9, 180),
    buildingHeight: 15,
    confidence: 'HIGH',
    sunProfile: 'street-open',
    description:
      'Industrial-chic bar inside the LX Factory complex — a courtyard that holds the sun until dusk.',
  }),
  venue({
    name: 'Rio Maravilha',
    category: 'rooftop',
    lat: 38.7065,
    lng: -9.1528,
    address: 'Edifício LX Factory, Rooftop, Alcântara',
    rating: 4.6,
    isOpen: true,
    hours: rooftopHours(),
    hasOutdoor: true,
    polygon: poly(38.7065, -9.1528, 16, 10, 180),
    buildingHeight: 26,
    confidence: 'HIGH',
    sunProfile: 'rooftop',
    description:
      'Open-air rooftop bar atop the LX Factory building — panoramic river and 25 de Abril bridge views, fully exposed.',
  }),

  // --- Avenida da Liberdade (38.7190, -9.1435) ---
  venue({
    name: 'Stubborn',
    category: 'cafe',
    lat: 38.718539,
    lng: -9.143171,
    address: 'R. de São José 23, Avenida',
    rating: 4.5,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.718539, -9.143171, 9, 6, 90),
    buildingHeight: 26,
    confidence: 'MEDIUM',
    sunProfile: 'street-mixed',
    description:
      'Specialty espresso bar one street off the Avenida — east-facing bench, bright mornings.',
  }),
  venue({
    name: 'Avenida Café',
    category: 'cafe',
    lat: 38.719138,
    lng: -9.143733,
    address: 'Av. da Liberdade 24A, Avenida',
    rating: 4.3,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.719138, -9.143733, 12, 7, 180),
    buildingHeight: 28,
    confidence: 'HIGH',
    sunProfile: 'street-open',
    description:
      'Classic café kiosk under the Avenida’s plane trees — dappled shade with sunny patches all day.',
  }),
  venue({
    name: 'Saldanha Grill',
    category: 'restaurant',
    lat: 38.723982,
    lng: -9.14484,
    address: 'Av. da República 84A, Saldanha',
    rating: 4.3,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.723982, -9.14484, 9, 6, 180),
    buildingHeight: 27,
    confidence: 'HIGH',
    sunProfile: 'street-mixed',
    description:
      'Neighbourhood steakhouse with a sidewalk table row — sunny from noon until the buildings shade it at 18:00.',
  }),

  // --- Saldanha (38.7235, -9.1450) ---
  venue({
    name: 'Cocktail Bar Lisbon',
    category: 'bar',
    lat: 38.7228,
    lng: -9.1458,
    address: 'R. Andrade 22, Saldanha',
    rating: 4.2,
    isOpen: true,
    hours: barHours(),
    hasOutdoor: false,
    polygon: null,
    buildingHeight: 25,
    confidence: 'LOW',
    sunProfile: 'indoor-shaded',
    description:
      'Hidden cocktail lounge in the Saldanha backstreets — dark interior, no terrace.',
  }),

  // --- Graça (38.7140, -9.1335) ---
  venue({
    name: 'Miradouro da Senhora do Monte',
    category: 'viewpoint',
    lat: 38.7185,
    lng: -9.1338,
    address: 'Campo de Santana, Graça',
    rating: 4.9,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.7185, -9.1338, 24, 14, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      'Lisbon’s highest viewpoint — a sun-drenched terrace with 360° views, the best sunset spot in the city.',
  }),
  venue({
    name: 'Miradouro da Graça',
    category: 'viewpoint',
    lat: 38.7142,
    lng: -9.1340,
    address: 'Largo da Graça, Graça',
    rating: 4.8,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.7142, -9.1340, 20, 12, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      'Shaded pine terrace by the Graça church — morning sun, pine-shade afternoons, sunset glow over the castle.',
  }),
  venue({
    name: 'Topo Martim Moniz',
    category: 'rooftop',
    lat: 38.7155,
    lng: -9.1358,
    address: 'Martim Moniz Sq, Rooftop, Mouraria',
    rating: 4.5,
    isOpen: true,
    hours: rooftopHours(),
    hasOutdoor: true,
    polygon: poly(38.7155, -9.1358, 18, 12, 180),
    buildingHeight: 22,
    confidence: 'HIGH',
    sunProfile: 'rooftop',
    description:
      'Rooftop bar atop the Martim Moniz shopping centre — fully open sky, sunset views toward the castle hill.',
  }),
  venue({
    name: '8a Colina',
    category: 'restaurant',
    lat: 38.7148,
    lng: -9.1332,
    address: 'R. da Senhora da Glória 16, Graça',
    rating: 4.4,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.7148, -9.1332, 10, 7, 180),
    buildingHeight: 17,
    confidence: 'MEDIUM',
    sunProfile: 'street-open',
    description:
      'Neighbourhood table on the Graça slope — a south-facing terrace with afternoon sun over the rooftops.',
  }),

  // --- Belém (38.6975, -9.2050) ---
  venue({
    name: 'Pastéis de Belém',
    category: 'cafe',
    lat: 38.6968,
    lng: -9.2030,
    address: 'R. de Belém 84-92, Belém',
    rating: 4.7,
    isOpen: true,
    hours: {
      0: { open: '08:00', close: '23:00' },
      1: { open: '08:00', close: '23:00' },
      2: { open: '08:00', close: '23:00' },
      3: { open: '08:00', close: '23:00' },
      4: { open: '08:00', close: '23:00' },
      5: { open: '08:00', close: '23:00' },
      6: { open: '08:00', close: '23:00' },
    },
    hasOutdoor: true,
    polygon: poly(38.6968, -9.2030, 14, 9, 180),
    buildingHeight: 16,
    confidence: 'HIGH',
    sunProfile: 'street-open',
    description:
      'The original custard-tart bakery since 1837 — a small street-side terrace in the Belém grid.',
  }),
  venue({
    name: 'Praça do Império',
    category: 'square',
    lat: 38.6975,
    lng: -9.2050,
    address: 'Praça do Império, Belém',
    rating: 4.6,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.6975, -9.2050, 35, 25, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      'Vast formal square between the Jerónimos Monastery and the gardens — wide open, little shade.',
  }),
  venue({
    name: 'Belém Riverside',
    category: 'viewpoint',
    lat: 38.6958,
    lng: -9.2070,
    address: 'Doca de Belém, Belém',
    rating: 4.7,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.6958, -9.2070, 22, 12, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      'Open riverside promenade by the Belém Tower — unobstructed sun and river breeze all afternoon.',
  }),
  venue({
    name: 'Choupana',
    category: 'restaurant',
    lat: 38.6965,
    lng: -9.2042,
    address: 'R. de Belém 70, Belém',
    rating: 4.3,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.6965, -9.2042, 8, 6, 180),
    buildingHeight: 16,
    confidence: 'LOW',
    sunProfile: 'street-open',
    description:
      'Small Portuguese tasca near Pastéis de Belém — a couple of sunny street tables under an awning.',
  }),

  // --- Costa da Caparica beaches (38.6450, -9.2300) ---
  venue({
    name: 'Praia da Costa da Caparica',
    category: 'beach',
    lat: 38.6450,
    lng: -9.2300,
    address: 'Costa da Caparica, Almada',
    rating: 4.6,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.6450, -9.2300, 40, 20, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'beach',
    description:
      'The long sandy town beach of Costa da Caparica — fully sun-exposed Atlantic shore with beach bars.',
  }),
  venue({
    name: 'Praia do Tamariz',
    category: 'beach',
    lat: 38.6455,
    lng: -9.2312,
    address: 'Praia do Tamariz, Costa da Caparica',
    rating: 4.5,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.6455, -9.2312, 35, 18, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'beach',
    description:
      'Sheltered cove beach south of Caparica — open to the sun with cliff backdrop to the north.',
  }),
  venue({
    name: 'Praia de São Pedro',
    category: 'beach',
    lat: 38.6462,
    lng: -9.2288,
    address: 'São Pedro de Caparica, Almada',
    rating: 4.4,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.6462, -9.2288, 32, 18, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'beach',
    description:
      'Family beach at the northern end of the Caparica coast — wide sand, full sun from morning to evening.',
  }),
  venue({
    name: 'Praia de Carcavelos',
    category: 'beach',
    lat: 38.6820,
    lng: -9.2400,
    address: 'Praia de Carcavelos, Cascais',
    rating: 4.7,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.6820, -9.2400, 42, 22, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'beach',
    description:
      "Lisbon's closest surf beach west of the city — a long open bay with near-constant sun and a fort café.",
  }),

  // --- Rooftops & high spots ---
  venue({
    name: 'Park Bar',
    category: 'rooftop',
    lat: 38.7160,
    lng: -9.1468,
    address: 'Calçada do Combro 58, Bairro Alto (rooftop)',
    rating: 4.6,
    isOpen: true,
    hours: rooftopHours(),
    hasOutdoor: true,
    polygon: poly(38.7160, -9.1468, 16, 10, 180),
    buildingHeight: 20,
    confidence: 'HIGH',
    sunProfile: 'rooftop',
    description:
      'Hidden rooftop atop a multi-storey car park in Bairro Alto — open sky, sunset views over the river.',
  }),
  venue({
    name: 'Memmo Rooftop',
    category: 'rooftop',
    lat: 38.7122,
    lng: -9.1305,
    address: 'Hotel Memmo Alfama, Terraço, Alfama',
    rating: 4.7,
    isOpen: true,
    hours: rooftopHours(),
    hasOutdoor: true,
    polygon: poly(38.7122, -9.1305, 15, 10, 180),
    buildingHeight: 18,
    confidence: 'HIGH',
    sunProfile: 'rooftop',
    description:
      'Boutique hotel rooftop in Alfama — infinity-edge pool terrace with full sun and Tagus views.',
  }),
  venue({
    name: 'Santa Justa',
    category: 'viewpoint',
    lat: 38.7136,
    lng: -9.1398,
    address: 'Elevador de Santa Justa, Baixa',
    rating: 4.4,
    isOpen: true,
    hours: {
      0: { open: '08:30', close: '20:00' },
      1: { open: '07:00', close: '21:00' },
      2: { open: '07:00', close: '21:00' },
      3: { open: '07:00', close: '21:00' },
      4: { open: '07:00', close: '21:00' },
      5: { open: '07:00', close: '21:00' },
      6: { open: '07:00', close: '21:00' },
    },
    hasOutdoor: true,
    polygon: poly(38.7136, -9.1398, 10, 8, 180),
    buildingHeight: 45,
    confidence: 'HIGH',
    sunProfile: 'rooftop',
    description:
      'Viewing platform atop the Santa Justa lift — 45 m up, completely exposed, panoramic Baixa views.',
  }),

  // --- Parque Eduardo VII & Av. Liberdade parks ---
  venue({
    name: 'Parque Eduardo VII',
    category: 'park',
    lat: 38.7230,
    lng: -9.1460,
    address: 'Parque Eduardo VII, Avenida',
    rating: 4.7,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.7230, -9.1460, 40, 24, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      'Lisbon’s grand formal park — terraced hedges and a long lawned slope facing down to the river, full sun.',
  }),
  venue({
    name: 'Jardim da São Pedro de Alcântara',
    category: 'park',
    lat: 38.7170,
    lng: -9.1418,
    address: 'R. da São Pedro de Alcântara, Bairro Alto',
    rating: 4.5,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.7170, -9.1418, 24, 14, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      'Tiered garden on the Bairro Alto escarpment with a viewpoint over the Baixa — pergola shade, sunny benches.',
  }),
  venue({
    name: 'Tapada das Mercês',
    category: 'park',
    lat: 38.712772,
    lng: -9.147097,
    address: 'Calçada da Estrela, Estrela',
    rating: 4.2,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.712772, -9.147097, 20, 14, 180),
    buildingHeight: 0,
    confidence: 'MEDIUM',
    sunProfile: 'park',
    description:
      'Quiet wooded pocket park near Estrela — dense canopy, sunny only in the central clearing.',
  }),

  // --- More restaurants & bars to round out 64 ---
  venue({
    name: 'Grelhado',
    category: 'restaurant',
    lat: 38.7158,
    lng: -9.1432,
    address: 'R. do Século 96, Bairro Alto',
    rating: 4.4,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.7158, -9.1432, 9, 6, 180),
    buildingHeight: 19,
    confidence: 'MEDIUM',
    sunProfile: 'street-mixed',
    description:
      'Casual grill house on the Bairro Alto ridge — a few street tables that see afternoon sun.',
  }),
  venue({
    name: 'Ponto Final',
    category: 'restaurant',
    lat: 38.708595,
    lng: -9.149791,
    address: 'Cais do Sodré riverside terrace',
    rating: 4.7,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.708595, -9.149791, 16, 10, 180),
    buildingHeight: 12,
    confidence: 'MEDIUM',
    sunProfile: 'street-open',
    description:
      "Iconic riverside terrace — afternoon sun, golden-hour cocktails and the city's most photographed sunset.",
  }),
  venue({
    name: 'Café Janis',
    category: 'cafe',
    lat: 38.7165,
    lng: -9.1470,
    address: 'R. das Gáveas 74, Príncipe Real',
    rating: 4.4,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.7165, -9.1470, 11, 7, 180),
    buildingHeight: 20,
    confidence: 'HIGH',
    sunProfile: 'street-mixed',
    description:
      'Parisian-style bistro-café in Príncipe Real — a sunny pavement terrace popular for weekend brunch.',
  }),
  venue({
    name: 'Biblioteca LX',
    category: 'cafe',
    lat: 38.7062,
    lng: -9.1532,
    address: 'R. Rodrigues de Faria 103, LX Factory',
    rating: 4.3,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.7062, -9.1532, 10, 6, 180),
    buildingHeight: 15,
    confidence: 'MEDIUM',
    sunProfile: 'street-open',
    description:
      'Bookshop-café inside the LX Factory — a courtyard terrace that catches midday sun against the brick walls.',
  }),
  venue({
    name: 'Pavilhão Chinês',
    category: 'bar',
    lat: 38.7172,
    lng: -9.1460,
    address: 'R. D. Pedro V 89, Príncipe Real',
    rating: 4.5,
    isOpen: true,
    hours: barHours(),
    hasOutdoor: false,
    polygon: null,
    buildingHeight: 22,
    confidence: 'MEDIUM',
    sunProfile: 'indoor-shaded',
    description:
      "Lisbon's legendary cabinet-of-curiosities bar — indoor only, no terrace, a dark wonderland.",
  }),
];
