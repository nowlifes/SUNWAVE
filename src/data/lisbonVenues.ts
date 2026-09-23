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

/**
 * Un lieu retiré garde son numéro : les ids suivent l'ordre de ce fichier, et
 * ils vivent déjà dans des favoris et des liens partagés (« ?lieu=v_42 »).
 * Retirer sans réserver décalerait tous ceux d'après.
 */
function retired(): null {
  ++idCounter;
  return null;
}

/** Un lien ou un favori vers un doublon retiré ouvre le lieu gardé. */
export const RETIRED_VENUE_IDS: Record<string, string> = {
  v_19: 'v_17', // Praça do Príncipe Real → Príncipe Real Garden
  v_32: 'v_31', // Estrela Park → Jardim da Estrela
};

function venue(spec: VenueSpec): Venue {
  const seed = ++idCounter;
  const id = `v_${String(seed).padStart(2, '0')}`;
  const groundAltitude = TerrainService.altitudeAtRounded({ lat: spec.lat, lng: spec.lng });
  // A rooftop venue sits on TOP of its own building, not on the street below
  // it: `TerrainService` only ever answers "how high is the ground here",
  // which for a rooftop bar is the base of the car park it's built over, not
  // where anyone is standing. See docs/memory sunwave-rooftop-vertical-bug —
  // Park Bar measured at 219 sun-minutes/day vs 469 average before this line
  // existed, read as if it stood in the street surrounded by its own building.
  const altitude = spec.category === 'rooftop' ? groundAltitude + spec.buildingHeight : groundAltitude;
  const target = {
    id,
    lat: spec.lat,
    lng: spec.lng,
    orientationDeg: spec.polygon?.orientationDeg ?? 180,
    altitude,
  };
  const band = VenueSunService.computeExposureBand(target, lisbonBuildings, TODAY);
  const sun = band.mid;
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
    // Observer elevation actually used by the shadow engine: ground level,
    // except for a rooftop venue where it's ground + its own building's
    // height. See the comment above and Venue.altitude's doc.
    altitude,
    confidence: spec.confidence,
    sunExposureByHour: sun,
    shadeExposureByHour: sun.map((s) => 100 - s),
    sunBand: band,
    heightProvenance: VenueSunService.heightProvenance(target, lisbonBuildings),
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

const entries: (Venue | null)[] = [
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
      'Terrasse de café charmante donnant sur la Misericórdia, ensoleillée en milieu de matinée, en plein cœur du Chiado.',
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
      "Bar à café de spécialité douillet sur la pente du Bairro Alto, à l'ombre des immeubles voisins en début d'après-midi.",
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
      'Café brunch prisé toute la journée dans le quadrillage de la Baixa, salle intérieure avec un petit balcon.',
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
      "Taverne historique sur une rue piétonne, quelques tabourets en terrasse qui attrapent le soleil de l'après-midi entre les immeubles.",
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
      'Cuisine fusion portugaise-japonaise de fruits de mer dans le Bairro Alto, avec une terrasse animée sur le trottoir.',
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
      'Le complexe gastronomique phare de José Avillez — uniquement en intérieur, pas de terrasse.',
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
      "La célèbre halle gourmande de Lisbonne, dans le Mercado da Ribeira — comptoirs en intérieur, pas d'espace extérieur.",
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
      'Comptoir de ceviche péruvien sous un poulpe géant, niché dans les ruelles étroites de la Baixa.',
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
      "Torréfacteur nordique à l'angle d'une rue animée de la Baixa ; un petit banc en terrasse orienté à l'est qui se réchauffe en milieu de matinée.",
  }),
  venue({
    name: 'Praça do Comércio',
    category: 'square',
    lat: 38.707829,
    lng: -9.136613,
    address: 'Praça do Comércio, Baixa',
    rating: 4.8,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.707829, -9.136613, 30, 20, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      'La grande place de Lisbonne au bord du fleuve — vaste esplanade ouverte avec des arcades exposées au sud.',
  }),
  venue({
    name: 'Praça da Figueira',
    category: 'square',
    lat: 38.713834,
    lng: -9.138184,
    address: 'Praça da Figueira, Baixa',
    rating: 4.3,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.713834, -9.138184, 25, 18, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      "Place animée de la Baixa entourée d'immeubles pastel, avec des terrasses de café le long du côté sud.",
  }),
  venue({
    name: 'Rossio Square',
    category: 'square',
    lat: 38.713453,
    lng: -9.139278,
    address: 'Praça D. Pedro IV (Rossio), Baixa',
    rating: 4.4,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.713453, -9.139278, 28, 20, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      'La place du Rossio et ses pavés en vagues, ses fontaines et ses kiosques, un piège à soleil entre les immeubles de la Baixa.',
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
      'Ancienne maison close transformée en bar à cocktails, avec un coin en terrasse face à la brise du fleuve.',
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
      'Bar à cocktails caché dans une ruelle du Bairro Alto — intimiste, uniquement en intérieur.',
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
      "Bar d'hôtel avec une petite terrasse arrière qui capte la lumière de fin d'après-midi au-dessus des toits.",
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
      'Place piétonne près des ruines du couvent do Carmo — verdoyante, partiellement ombragée, un spot de café prisé au coucher du soleil.',
  }),

  // --- Príncipe Real (38.7170, -9.1480) ---
  venue({
    name: 'Príncipe Real Garden',
    category: 'park',
    lat: 38.71604,
    lng: -9.14863,
    address: 'Praça do Príncipe Real, Príncipe Real',
    rating: 4.6,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.71604, -9.14863, 22, 16, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      "Jardin ombragé d'arbres sur le plateau du Príncipe Real, avec un cèdre majestueux et une terrasse de kiosque.",
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
      'Bistrot de quartier apprécié avec quelques tables en terrasse qui se remplissent de soleil à midi.',
  }),
  // Doublon de Príncipe Real Garden (même jardin, même cèdre) : retiré.
  retired(),

  // --- Alfama (38.7125, -9.1295) ---
  venue({
    name: 'Miradouro das Portas do Sol',
    category: 'viewpoint',
    lat: 38.712422,
    lng: -9.130437,
    address: 'Largo das Portas do Sol, Alfama',
    rating: 4.9,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.712422, -9.130437, 20, 12, 90),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      "Terrasse emblématique de l'Alfama avec une vue panoramique sur le Tage et les toits de tuiles rouges — entièrement au soleil.",
  }),
  venue({
    name: 'Miradouro de Santa Luzia',
    category: 'viewpoint',
    lat: 38.711665,
    lng: -9.130289,
    address: 'Largo de Santa Luzia, Alfama',
    rating: 4.8,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.711665, -9.130289, 16, 10, 90),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      "Belvédère drapé de glycines juste en contrebas de Portas do Sol ; soleil le matin, ombre de la pergola l'après-midi.",
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
      "Café bohème au-dessus d'un parking, avec une terrasse en balcon face au fleuve — idéal au lever du soleil.",
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
      "Cuisine portugaise traditionnelle dans les ruelles de l'Alfama, une petite table en terrasse sur la pente pavée.",
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
      "Bar à cocktails d'inspiration indienne avec un patio arrière verdoyant qui reçoit le soleil l'après-midi entre les murs.",
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
      'Spot brunch tenu par des Australiens, avec une terrasse sur trottoir — lumineux et ensoleillé dès la fin de matinée.',
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
      'La légendaire maison de fruits de mer de Lisbonne — une cervejaria animée en intérieur, pas de terrasse.',
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
      'Petit frère fermé du bar à cocktails de Cais do Sodré — un petit patio à Santos qui attend sa réouverture.',
  }),

  // --- Santa Catarina (38.7105, -9.1465) ---
  venue({
    name: 'Miradouro de Santa Catarina',
    category: 'viewpoint',
    lat: 38.709605,
    lng: -9.147598,
    address: 'R. de Santa Catarina, Santa Catarina',
    rating: 4.7,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.709605, -9.147598, 22, 14, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      "Belvédère au bord du fleuve avec le célèbre kiosque « No. 4 » — en plein soleil tout l'après-midi, avec vue sur le Tage.",
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
      'Café brunch healthy à deux pas du belvédère — une petite terrasse en plein soleil à midi.',
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
      "Café végétarien atypique avec un coin sur le toit — orienté est, soleil le matin, à l'ombre l'après-midi.",
  }),

  // --- Estrela / Lapa (38.7145, -9.1550) ---
  venue({
    name: 'Jardim da Estrela',
    category: 'park',
    lat: 38.714459,
    lng: -9.159289,
    address: 'R. da Estrela, Estrela',
    rating: 4.7,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.714459, -9.159289, 28, 20, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      'Jardin romantique du XIXe siècle avec bassins, palmiers et kiosque — une oasis de verdure entre soleil et ombre à Estrela.',
  }),
  // Doublon de Jardim da Estrela (même jardin, face à la basilique) : retiré.
  retired(),
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
      'Restaurant tranquille de Lapa avec un patio exposé au sud — soleil tacheté à travers les platanes à midi.',
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
      'Café de spécialité sur les hauteurs de Lapa — le comptoir en vitrine, orienté est, se réchauffe en milieu de matinée.',
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
      'Café brunch rempli de plantes à Santos — une terrasse ensoleillée sur rue, prisée des freelances.',
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
      "Bar chic et industriel au sein du complexe LX Factory — une cour qui garde le soleil jusqu'au crépuscule.",
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
      'Bar sur le toit à ciel ouvert au sommet du bâtiment LX Factory — vue panoramique sur le fleuve et le pont du 25 de Abril, entièrement au soleil.',
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
      "Bar à espresso de spécialité à une rue de l'Avenida — banc orienté est, matinées lumineuses.",
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
      "Kiosque-café classique sous les platanes de l'Avenida — ombre tachetée avec des taches de soleil toute la journée.",
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
      "Grill de quartier avec une rangée de tables sur le trottoir — au soleil de midi jusqu'à ce que les immeubles l'ombragent à 18h.",
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
      'Lounge à cocktails caché dans les petites rues de Saldanha — intérieur sombre, pas de terrasse.',
  }),

  // --- Graça (38.7140, -9.1335) ---
  venue({
    name: 'Miradouro da Senhora do Monte',
    category: 'viewpoint',
    lat: 38.719102,
    lng: -9.132732,
    address: 'Campo de Santana, Graça',
    rating: 4.9,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.719102, -9.132732, 24, 14, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      'Le point de vue le plus haut de Lisbonne — une terrasse baignée de soleil avec une vue à 360°, le meilleur spot pour le coucher du soleil en ville.',
  }),
  venue({
    name: 'Miradouro da Graça',
    category: 'viewpoint',
    lat: 38.716505,
    lng: -9.131586,
    address: 'Largo da Graça, Graça',
    rating: 4.8,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.716505, -9.131586, 20, 12, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'viewpoint',
    description:
      "Terrasse ombragée de pins près de l'église de Graça — soleil le matin, ombre des pins l'après-midi, lueur du coucher de soleil sur le château.",
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
      'Bar sur le toit du centre commercial de Martim Moniz — ciel totalement dégagé, vue sur le coucher de soleil vers la colline du château.',
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
      "Table de quartier sur la pente de Graça — une terrasse exposée au sud, au soleil l'après-midi au-dessus des toits.",
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
      'La pâtisserie originale des pastéis de nata depuis 1837 — une petite terrasse sur rue dans le quadrillage de Belém.',
  }),
  venue({
    name: 'Praça do Império',
    category: 'square',
    lat: 38.695966,
    lng: -9.206012,
    address: 'Praça do Império, Belém',
    rating: 4.6,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.695966, -9.206012, 35, 25, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'square',
    description:
      "Vaste place à la française entre le monastère des Jerónimos et les jardins — grand espace dégagé, peu d'ombre.",
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
      "Promenade ouverte au bord du fleuve près de la tour de Belém — soleil dégagé et brise du Tage tout l'après-midi.",
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
      'Petite tasca portugaise près de Pastéis de Belém — quelques tables ensoleillées en terrasse sous un auvent.',
  }),

  // --- Plages : Costa da Caparica (rive sud) et ligne de Cascais ---
  // Positions OSM relevées le 2026-09-23 : les anciennes étaient empilées
  // dans les terres (Caparica) ou au milieu du Tage (Carcavelos).
  venue({
    name: 'Praia da Costa da Caparica',
    category: 'beach',
    lat: 38.64485,
    lng: -9.24198,
    address: 'Costa da Caparica, Almada',
    rating: 4.6,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.64485, -9.24198, 40, 20, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'beach',
    description:
      'La longue plage de sable de Costa da Caparica — un rivage atlantique entièrement exposé au soleil, avec ses bars de plage.',
  }),
  venue({
    name: 'Praia do Tamariz',
    category: 'beach',
    lat: 38.70267,
    lng: -9.40002,
    address: 'Praia do Tamariz, Estoril, Cascais',
    rating: 4.5,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.70267, -9.40002, 35, 18, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'beach',
    description:
      'Petite plage d\'Estoril tournée vers le sud, entre la digue et la piscine océanique — au soleil du matin au soir.',
  }),
  venue({
    name: 'Praia de São Pedro do Estoril',
    category: 'beach',
    lat: 38.69322,
    lng: -9.36958,
    address: 'São Pedro do Estoril, Cascais',
    rating: 4.4,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.69322, -9.36958, 32, 18, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'beach',
    description:
      "Plage de surf au pied de la falaise, face au sud — plein soleil du matin au soir.",
  }),
  venue({
    name: 'Praia de Carcavelos',
    category: 'beach',
    lat: 38.67925,
    lng: -9.33606,
    address: 'Praia de Carcavelos, Cascais',
    rating: 4.7,
    isOpen: true,
    hours: alwaysOpen(),
    hasOutdoor: true,
    polygon: poly(38.67925, -9.33606, 42, 22, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'beach',
    description:
      "La plage de surf la plus proche de Lisbonne, à l'ouest de la ville — une longue baie ouverte avec un soleil quasi constant et un café dans le fort.",
  }),

  // --- Rooftops & high spots ---
  venue({
    name: 'Park Bar',
    category: 'rooftop',
    lat: 38.7160,
    lng: -9.1468,
    address: 'Calçada do Combro 58, Bairro Alto',
    rating: 4.6,
    isOpen: true,
    hours: rooftopHours(),
    hasOutdoor: true,
    polygon: poly(38.7160, -9.1468, 16, 10, 180),
    buildingHeight: 20,
    confidence: 'HIGH',
    sunProfile: 'rooftop',
    description:
      "Toit caché au sommet d'un parking à étages dans le Bairro Alto — ciel dégagé, vue sur le coucher de soleil au-dessus du fleuve.",
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
      "Toit d'un hôtel-boutique dans l'Alfama — terrasse avec piscine à débordement, plein soleil et vue sur le Tage.",
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
      "Plateforme d'observation au sommet de l'ascenseur de Santa Justa — 45 m de haut, entièrement exposée, vue panoramique sur la Baixa.",
  }),

  // --- Parque Eduardo VII & Av. Liberdade parks ---
  venue({
    name: 'Parque Eduardo VII',
    category: 'park',
    lat: 38.727717,
    lng: -9.151576,
    address: 'Parque Eduardo VII, Avenida',
    rating: 4.7,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.727717, -9.151576, 40, 24, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      'Le grand parc à la française de Lisbonne — haies en terrasses et longue pelouse en pente vers le fleuve, plein soleil.',
  }),
  venue({
    name: 'Jardim da São Pedro de Alcântara',
    category: 'park',
    lat: 38.715118,
    lng: -9.144203,
    address: 'R. da São Pedro de Alcântara, Bairro Alto',
    rating: 4.5,
    isOpen: true,
    hours: parkHours(),
    hasOutdoor: true,
    polygon: poly(38.715118, -9.144203, 24, 14, 180),
    buildingHeight: 0,
    confidence: 'HIGH',
    sunProfile: 'park',
    description:
      "Jardin en terrasses sur l'escarpement du Bairro Alto, avec un point de vue sur la Baixa — ombre de pergola, bancs ensoleillés.",
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
      "Petit parc boisé tranquille près d'Estrela — canopée dense, soleil seulement dans la clairière centrale.",
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
      "Grill décontracté sur les hauteurs du Bairro Alto — quelques tables en terrasse qui voient le soleil l'après-midi.",
  }),
  venue({
    name: 'Ponto Final',
    category: 'restaurant',
    lat: 38.68502,
    lng: -9.1577,
    address: 'Cais do Ginjal, Almada',
    rating: 4.7,
    isOpen: true,
    hours: restaurantHours(),
    hasOutdoor: true,
    polygon: poly(38.68502, -9.1577, 16, 10, 180),
    buildingHeight: 12,
    confidence: 'LOW',
    sunProfile: 'street-open',
    description:
      "Terrasse emblématique au bord du fleuve — soleil l'après-midi, cocktails à l'heure dorée et le coucher de soleil le plus photographié de la ville.",
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
      'Bistrot-café de style parisien dans le Príncipe Real — une terrasse ensoleillée sur trottoir, prisée pour le brunch du week-end.',
  }),
  venue({
    name: 'Biblioteca LX',
    category: 'cafe',
    lat: 38.7062,
    lng: -9.1532,
    address: 'R. Rodrigues de Faria 103, LX Factory, Alcântara',
    rating: 4.3,
    isOpen: true,
    hours: cafeHours(),
    hasOutdoor: true,
    polygon: poly(38.7062, -9.1532, 10, 6, 180),
    buildingHeight: 15,
    confidence: 'MEDIUM',
    sunProfile: 'street-open',
    description:
      'Café-librairie au sein de la LX Factory — une terrasse en cour intérieure qui attrape le soleil de midi contre les murs de brique.',
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
      'Le légendaire bar-cabinet de curiosités de Lisbonne — uniquement en intérieur, pas de terrasse, un monde merveilleux et sombre.',
  }),
];

export const lisbonVenues: Venue[] = entries.filter((v): v is Venue => v !== null);
