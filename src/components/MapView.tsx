import { useRef, useEffect, useState, useMemo, useCallback, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import type { GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// maplibre 6 construit l'URL de son worker à l'exécution (`new URL(nom, base)`),
// que Vite ne peut pas détecter : le fichier n'était pas émis et répondait 404
// en prod. Worker mort = toute source GeoJSON reste non chargée, donc zéro ombre
// affichée alors que le fond raster et les marqueurs DOM continuaient de marcher.
// `?worker&url` et pas `?url` : le worker importe ./maplibre-gl-shared.mjs, que
// seul le bundling embarque — copié verbatim il échoue au chargement, en silence.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Venue, SunMode, GeoPoint, Recommendation } from '@/types';
import { SunService } from '@/services/SunService';
import { liveReports } from '@/services/LiveReportService';
import { LIVE_SHORT } from '@/utils/live';
import { ShadowService } from '@/services/ShadowService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonTerrain30 } from '@/data/lisbonTerrain30';
import { caparicaTerrain30 } from '@/data/caparicaTerrain30';
import { almadaTerrain30 } from '@/data/almadaTerrain30';
import { WALK_RING_M, initialFrame, pillLabel } from '@/utils/mapGuide';
import { gridRuns } from '@/utils/landMask';
import { travelParts } from '@/utils/copy';
import { LIT_MIN_ALT, beamCone, beamRay, coneCss, edgePoint, isOnScreen, rayCss, type BeamCss, type Rect } from '@/utils/halo';
import { haloPulseMarkup, haloSvg, liveGlyphSvg } from '@/utils/haloMarkup';
import { LIGHT, NIGHT } from '@/utils/palette';
import { lightPaint } from '@/utils/light';
import { litEdges } from '@/utils/litEdges';
import { lisbonMinutesOfDay } from '@/utils/lisbonTime';
import { CLAIR } from '@/utils/mapFlags';
import { HaloIcon } from './Halo';
import { createShadowScheduler, type ShadowJob, type ShadowScheduler } from '@/utils/shadowScheduler';

setWorkerUrl(maplibreWorkerUrl);

/** Ce que la bulle « ici » affiche — calculé par MapScreen. */
export interface ProbeView {
  point: GeoPoint;
  lead: string;
  time: string | null;
  /** Message d'erreur à la place de la réponse, quand le calcul a échoué. */
  error: string | null;
  neighbour: { id: string; name: string; time: string | null; walkMin: number; point: GeoPoint } | null;
  mode: SunMode;
}

export interface MapInsets {
  top: number;
  bottom: number;
}

interface MapViewProps {
  venues: Venue[];
  recommendations: Recommendation[];
  mode: SunMode;
  currentDate: Date;
  userLocation: GeoPoint;
  mapCenter: GeoPoint;
  mapZoom: number;
  selectedVenueId: string | null;
  onVenueSelect: (venueId: string | null) => void;
  onMapCenterChange: (center: GeoPoint) => void;
  onZoomChange: (zoom: number) => void;
  /** Toucher la carte hors pastille. */
  onMapTap: (point: GeoPoint) => void;
  /** L'utilisateur fait glisser ou zoome la carte lui-même. */
  onUserMove: () => void;
  probe: ProbeView | null;
  onProbeClose: () => void;
  /** Ce que cachent l'en-tête et la feuille du bas : ni pastille ni cadrage dessous. */
  insets: MapInsets;
  /** On glisse l'heure : le soleil se montre au bord, côté azimut. */
  scrubbing?: boolean;
  /** « Revenir sur moi », quand toi est sorti de l'écran. */
  onRecenter?: () => void;
}

// Palette « raccord » : un seul bleu nuit en paliers. L'eau est le palier le
// plus profond, la ville la nuit, l'ombre un cran plus sombre que le sol ; la
// seule autre couleur est la lumière, portée par le faisceau et les halos.
const C = {
  night: NIGHT.night,
  water: NIGHT.water,
  shadow: NIGHT.deep,
  building: NIGHT.p2,
  sub: NIGHT.sub,
  shell: NIGHT.shell,
};

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY ?? '';
const cartoTiles = (style: string) =>
  ['a', 'b', 'c'].map(
    // CARTO attend `key=`, pas `api_key=` — avec l'ancien nom la clé était
    // silencieusement ignorée et les tuiles servies en quota anonyme.
    (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}@2x.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`
  );

/** Fond CARTO : mi-opacité sur la nuit ; un cran plus bas quand un lieu est
 *  choisi (le reste de la carte s'assombrit, le rayon ressort). */
const BASE_OPACITY = 0.45;
const BASE_OPACITY_CHOSEN = 0.3;

// Carte de jour (façon Bump, dans la DA Contre-jour) : sol crème, bâtiments
// blancs cernés de bleu jour ; le soleil en or pâle, l'ombre en bleu jour.
const DAYMAP = {
  ground: '#FFF7E8',
  water: '#8EA6E0',
  sun: '#FFD28A',
  shadow: '#AEBDE3',
  building: '#FFFFFF',
  outline: '#C5D1EC',
  ink: '#0B1A45',
  ember: '#A83400',
  sub: '#34487A',
};
const TONE = CLAIR ? ('day' as const) : ('night' as const);

/** Le repère « toi » de la carte claire. Point encre cerclé de crème à
 *  ombre dure, comme les étiquettes, sur une clairière crème couronnée de
 *  rayons braise (qui respirent et tournent, index.css). Le cône `.toi-cone`
 *  montre où tu regardes : caché tant que la boussole n'a pas répondu. */
function toiMarkup(): string {
  const { ink } = DAYMAP;
  const f = (n: number) => n.toFixed(1);
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const [r1, r2] = i % 2 ? [17, 22] : [16, 26];
    return `<line x1="${f(Math.sin(a) * r1)}" y1="${f(-Math.cos(a) * r1)}" x2="${f(Math.sin(a) * r2)}" y2="${f(-Math.cos(a) * r2)}"/>`;
  }).join('');
  const glow = `<span class="toi-glow" style="position:absolute;inset:0;border-radius:50%;background:radial-gradient(circle,#FFF1D6 0 30%,rgba(255,241,214,.75) 40%,rgba(255,241,214,0) 62%)"></span>`;
  const cone = `<svg class="toi-cone" width="96" height="96" viewBox="-48 -48 96 96" aria-hidden="true" style="position:absolute;inset:0;overflow:visible;opacity:0;transition:transform .25s ease-out,opacity .3s"><defs><radialGradient id="toi-cone-g" cx="0" cy="0" r="46" gradientUnits="userSpaceOnUse"><stop offset="0.2" stop-color="${ink}" stop-opacity="0.6"/><stop offset="1" stop-color="${ink}" stop-opacity="0"/></radialGradient></defs><path d="M0 0 L-27 -38 A46 46 0 0 1 27 -38 Z" fill="url(#toi-cone-g)"/></svg>`;
  const rayRing = `<svg class="toi-rays" width="96" height="96" viewBox="-48 -48 96 96" aria-hidden="true" style="position:absolute;inset:0;overflow:visible"><g stroke="#F07A2B" stroke-width="3" stroke-linecap="round">${rays}</g></svg>`;
  const dot = `<span style="position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:${ink};border:3.5px solid #FFF1D6;box-shadow:0 0 0 1.5px ${ink},2.5px 2.5px 0 1.5px ${ink};box-sizing:border-box"></span>`;
  return glow + cone + rayRing + dot;
}

const MAP_STYLE: import('maplibre-gl').StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: cartoTiles(CLAIR ? 'voyager_nolabels' : 'dark_nolabels'),
      tileSize: 256,
      attribution: '&copy; OSM &copy; CARTO',
    },
    labels: {
      type: 'raster',
      tiles: cartoTiles(CLAIR ? 'voyager_only_labels' : 'dark_only_labels'),
      tileSize: 256,
    },
  },
  layers: [
    { id: 'night', type: 'background', paint: { 'background-color': CLAIR ? DAYMAP.ground : C.night } },
    // Le fond CARTO sombre est gris neutre : posé à mi-opacité sur la nuit
    // océan, il en prend la teinte et garde rues, Tage et parcs lisibles.
    { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': BASE_OPACITY, 'raster-contrast': 0.3 } },
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.95 }, minzoom: 12 },
  ],
};

// Les emprises, redessinées au-dessus des ombres. Chaque polygone d'ombre
// contient l'emprise de son bâtiment : sans ce calque, ombre et bâtiment se
// fondaient en une seule masse et l'ombre ne se lisait plus.
const FOOTPRINTS = {
  type: 'FeatureCollection' as const,
  features: lisbonBuildings.map((building) => {
    const coords = building.points.map((p) => [p.lng, p.lat]);
    coords.push(coords[0]);
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'Polygon' as const, coordinates: [coords] },
    };
  }),
};

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

// Eau d'après les grilles de relief à 30 m (voir landMask.ts). Plus de voile
// orange sur la terre : posé sur le bleu il virait au prune ; la lumière est
// désormais le faisceau.
const TERRAIN_GRIDS = [lisbonTerrain30, caparicaTerrain30, almadaTerrain30];
const WATER = gridRuns(TERRAIN_GRIDS, 'water');
// La terre reçoit la lumière (calque « light ») ; l'eau, les ombres portées et
// les toits sont redessinés par-dessus et la laissent voir « découpée ».
const LAND = gridRuns(TERRAIN_GRIDS, 'land');
/** Les toits : la ville bleue, sur la lumière du sol. */
const ROOF = '#0F2156';

/** L'anneau de 10 min à pied, en polygone de 64 côtés. */
function ringCoords(center: GeoPoint, radiusM: number): [number, number][] {
  const dLat = radiusM / 110540;
  const dLng = radiusM / (111320 * Math.cos((center.lat * Math.PI) / 180));
  const out: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    out.push([center.lng + dLng * Math.sin(a), center.lat + dLat * Math.cos(a)]);
  }
  return out;
}

// La carte se cadre une fois par position d'arrivée et par session : ensuite,
// c'est l'utilisateur qui décide où il regarde. Changer de position (la
// géolocalisation répond après coup) recadre une fois de plus.
let framedFor: string | null = null;
/** Des pastilles à l'arrivée, au moins : une carte vide n'explique rien. */
const MIN_FRAMED_VENUES = 6;
/** 6 pastilles à l'écran, pas plus : au-delà, on ne lit plus rien. */
const MAX_PILLS = 6;
/** Discrètes (lieux hors de ce qu'on cherche) : une seule quand il y a assez
 *  de lieux dans ce qu'on cherche ; la nuit ou sans soleil, elles comblent. */
const MAX_QUIET_WITH_LOUD = 1;
const PILL_GAP_PX = 4;
/** Glyphe halo d'une pastille, et sa cible tactile. */
const GLYPH_PX = 30;
const HIT_PX = 44;
/** Le halo de bord s'accroche à cette distance du bord visible. */
const EDGE_INSET = 30;
/** Le soleil reste au bord ce temps après la fin du glissement. */
const SUN_EDGE_LINGER_MS = 500;
/** Sous ce seuil (%), un lieu est à l'ombre : son rond est éteint. */
const LIT_PCT = 50;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

/** N'écrit un style que s'il change : un fond identique réécrit ferait
 *  repeindre le faisceau pour rien. */
function applyBeam(el: HTMLDivElement, css: BeamCss | null, cache: { key: string }) {
  if (!css) {
    if (el.style.display !== 'none') el.style.display = 'none';
    cache.key = '';
    return;
  }
  if (el.style.display === 'none') el.style.display = '';
  const key = `${css.width}|${css.height}|${css.background}|${css.mask}|${css.transformOrigin}`;
  if (key !== cache.key) {
    cache.key = key;
    el.style.width = `${css.width}px`;
    el.style.height = `${css.height}px`;
    el.style.background = css.background;
    el.style.transformOrigin = css.transformOrigin;
    el.style.setProperty('mask-image', css.mask);
    el.style.setProperty('-webkit-mask-image', css.mask);
  }
  el.style.transform = css.transform;
}

type ShadowCollection = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: object; geometry: { type: 'Polygon'; coordinates: number[][][] } }[] };
type EdgeCollection = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: object; geometry: { type: 'MultiLineString'; coordinates: [number, number][][] } }[] };
/** Ce que calcule une minute : les ombres portées et les arêtes allumées. */
type ShadowResult = { shadows: ShadowCollection; edges: EdgeCollection };
const NO_SHADOWS = 'none';
/** Bâtiments projetés par morceau : ~1 ms chacun en CPU x4 plutôt qu'un bloc. */
const SHADOW_CHUNK = 1500;

/** Le calcul des ombres d'une minute (clé « instant|lat|lng »), en morceaux. */
function buildShadowJob(key: string): ShadowJob<ShadowResult> {
  const features: ShadowCollection['features'] = [];
  const lines: [number, number][][] = [];
  const result = (): ShadowResult => ({
    shadows: { type: 'FeatureCollection', features },
    edges: {
      type: 'FeatureCollection',
      features: lines.length ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } }] : [],
    },
  });
  if (key === NO_SHADOWS) return { step: () => true, result };
  const [t, lat, lng] = key.split('|').map(Number);
  const date = new Date(t);
  const azimuth = SunService.getSunPosition(date, lat, lng).azimuth;
  let i = 0;
  return {
    step() {
      const end = Math.min(lisbonBuildings.length, i + SHADOW_CHUNK);
      for (; i < end; i++) {
        const proj = ShadowService.projectBuildingShadow(lisbonBuildings[i], date, lat, lng);
        const coords = proj.shadowPoints.map((p) => [p.lng, p.lat]);
        coords.push(coords[0]);
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } });
        lines.push(...litEdges(lisbonBuildings[i].points, azimuth));
      }
      return i >= lisbonBuildings.length;
    },
    result,
  };
}

export function MapView({
  venues,
  recommendations,
  mode,
  currentDate,
  userLocation,
  mapCenter,
  mapZoom,
  selectedVenueId,
  onVenueSelect,
  onMapCenterChange,
  onZoomChange,
  onMapTap,
  onUserMove,
  probe,
  onProbeClose,
  insets,
  scrubbing = false,
  onRecenter,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Une réponse arrive (la nôtre, demain celle des autres) : les pastilles se redessinent.
  const liveVersion = useSyncExternalStore(
    (cb) => liveReports.subscribe(cb),
    () => liveReports.getVersion()
  );
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const ringLabelRef = useRef<Marker | null>(null);
  const probeMarkerRef = useRef<Marker | null>(null);
  const [probeEl] = useState(() => document.createElement('div'));
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // Le faisceau : un seul élément, sous les pastilles, piloté hors de React.
  const [beamEl] = useState(() => {
    const el = document.createElement('div');
    el.className = 'beam-breathe';
    el.setAttribute('aria-hidden', 'true');
    el.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;display:none;will-change:transform;';
    return el;
  });
  const beamCache = useRef({ key: '' });
  const edgeRef = useRef<HTMLButtonElement>(null);
  const arrowRef = useRef<HTMLSpanElement>(null);
  // « toi » hors de l'écran : un bouton, pas un halo. Un état React, mais
  // posé seulement quand la réponse change (pas à chaque image du pan).
  const [youOff, setYouOff] = useState(false);
  const youOffRef = useRef(false);
  const [sunEdge, setSunEdge] = useState(false);

  // Les gestionnaires de la carte sont posés une fois ; ils lisent la
  // dernière version des callbacks par ces refs, pas celle du montage.
  const callbacksRef = useRef({ onMapCenterChange, onZoomChange, onMapTap, onUserMove });
  useEffect(() => {
    callbacksRef.current = { onMapCenterChange, onZoomChange, onMapTap, onUserMove };
  }, [onMapCenterChange, onZoomChange, onMapTap, onUserMove]);

  const sunPos = useMemo(
    () => SunService.getSunPosition(currentDate, mapCenter.lat, mapCenter.lng),
    [currentDate, mapCenter]
  );
  const isDaytime = sunPos.elevation > 0;
  const selected = useMemo(() => {
    if (!selectedVenueId) return null;
    const venue = venues.find((v) => v.id === selectedVenueId);
    if (!venue) return null;
    const rec = recommendations.find((r) => r.venue.id === selectedVenueId) ?? null;
    return { venue, walk: rec ? travelParts(rec) : null };
  }, [selectedVenueId, venues, recommendations]);

  // Tout ce que le rendu d'une image lit : une ref, mise à jour à chaque rendu
  // React, lue par la boucle rAF (jamais d'état périmé, jamais de re-rendu).
  const frameRef = useRef({ sunPos, selected, userLocation, insets, sunEdge });
  useEffect(() => {
    frameRef.current = { sunPos, selected, userLocation, insets, sunEdge };
  });

  /** Faisceau, halo de bord, « toi hors écran » : au plus une fois par image. */
  const drawOverlay = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const { sunPos: sp, selected: sel, userLocation: you, insets: ins, sunEdge: showSun } = frameRef.current;
    const { clientWidth: W, clientHeight: H } = map.getContainer();
    const visible: Rect = { left: 0, top: ins.top, right: W, bottom: Math.max(ins.top + 40, H - ins.bottom) };

    // Faisceau A (cône depuis le bord) ou B (rayon sur le lieu choisi).
    const selPx = sel ? map.project([sel.venue.longitude, sel.venue.latitude]) : null;
    const css = selPx
      ? (() => {
          const r = beamRay(sp.azimuth, sp.elevation, { x: selPx.x, y: selPx.y }, W, H);
          return r ? rayCss(r) : null;
        })()
      : (() => {
          const c = beamCone(sp.azimuth, sp.elevation, W, H);
          return c ? coneCss(c) : null;
        })();
    applyBeam(beamEl, css, beamCache.current);

    // Un seul halo de bord : le soleil pendant qu'on glisse l'heure, sinon la
    // destination sortie de l'écran.
    const edge = edgeRef.current;
    if (edge) {
      let target: { x: number; y: number } | null = null;
      if (showSun && sp.elevation > LIT_MIN_ALT) {
        const a = (sp.azimuth * Math.PI) / 180;
        target = { x: W / 2 + Math.sin(a) * 4000, y: (visible.top + visible.bottom) / 2 - Math.cos(a) * 4000 };
      } else if (selPx && !isOnScreen(selPx, visible, 8)) {
        target = selPx;
      }
      if (!target) {
        if (edge.style.display !== 'none') edge.style.display = 'none';
      } else {
        const p = edgePoint(target, visible, EDGE_INSET);
        edge.style.display = '';
        // Côté droit : le temps passe à gauche du halo, sinon il sort de l'écran.
        const rev = p.x > W / 2;
        edge.style.flexDirection = rev ? 'row-reverse' : 'row';
        edge.style.paddingLeft = rev && !showSun ? '12px' : '0';
        edge.style.paddingRight = !rev && !showSun ? '12px' : '0';
        const x = rev ? p.x + 22 - edge.offsetWidth : p.x - 22;
        edge.style.transform = `translate(${Math.round(x)}px, ${Math.round(p.y - 22)}px)`;
        if (arrowRef.current) arrowRef.current.style.transform = `rotate(${Math.round(p.angle)}deg) translateY(-25px)`;
      }
    }

    // Toi hors de l'écran → bouton « Revenir sur moi ».
    const yp = map.project([you.lng, you.lat]);
    const off = !isOnScreen(yp, visible, 0);
    if (off !== youOffRef.current) {
      youOffRef.current = off;
      setYouOff(off);
    }
  }, [beamEl]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [mapCenter.lng, mapCenter.lat],
      zoom: mapZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxZoom: 18,
      minZoom: 11,
    });
    // Rotation au doigt coupée : le faisceau suppose le nord en haut.
    map.touchZoomRotate.disableRotation();
    // Le faisceau vit dans le conteneur du canvas, avant les marqueurs : il
    // passe sous les pastilles et suit le cadre de la carte.
    map.getCanvasContainer().appendChild(beamEl);
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        drawOverlay();
      });
    };
    map.on('load', () => {
      map.addSource('land', { type: 'geojson', data: LAND });
      map.addSource('water', { type: 'geojson', data: WATER });
      map.addSource('building-shadows', { type: 'geojson', data: EMPTY });
      map.addSource('lit-edges', { type: 'geojson', data: EMPTY });
      map.addSource('footprints', { type: 'geojson', data: FOOTPRINTS });
      map.addSource('walk-ring', { type: 'geojson', data: EMPTY });
      map.addSource('probe-link', { type: 'geojson', data: EMPTY });
      // Sous les libellés : les noms de rues restent lisibles.
      // La lumière : tout le sol, puis l'eau et les ombres la recouvrent.
      map.addLayer(
        { id: 'light', type: 'fill', source: 'land', paint: { 'fill-color': LIGHT.glow, 'fill-opacity': 0, 'fill-antialias': false } },
        'labels'
      );
      map.addLayer(
        { id: 'water', type: 'fill', source: 'water', paint: { 'fill-color': C.water, 'fill-opacity': 1, 'fill-antialias': false } },
        'labels'
      );
      map.addLayer(
        {
          id: 'building-shadows',
          type: 'fill',
          source: 'building-shadows',
          // Opaque : 11 000 polygones qui se chevauchent en translucide
          // s'empilaient en taches plus sombres là où les ombres se croisent,
          // sans rapport avec la réalité.
          paint: { 'fill-color': C.shadow, 'fill-opacity': 1, 'fill-antialias': false },
        },
        'labels'
      );
      map.addLayer(
        {
          id: 'footprints',
          type: 'fill',
          source: 'footprints',
          // Les bâtiments en retrait, proches du sol : du relief sans bruit,
          // pour que les pastilles ressortent.
          paint: { 'fill-color': ROOF, 'fill-opacity': 0.9 },
        },
        'labels'
      );
      // L'arête au soleil : un trait fin de lumière sur les toits.
      map.addLayer(
        {
          id: 'lit-edges',
          type: 'line',
          source: 'lit-edges',
          paint: { 'line-color': LIGHT.pale, 'line-width': 0.9, 'line-opacity': 0.75 },
          layout: { 'line-cap': 'butt' },
        },
        'labels'
      );
      if (CLAIR) {
        map.setPaintProperty('base', 'raster-contrast', 0);
        map.setPaintProperty('water', 'fill-color', DAYMAP.water);
        map.setPaintProperty('building-shadows', 'fill-color', DAYMAP.shadow);
        map.setPaintProperty('footprints', 'fill-color', DAYMAP.building);
        map.setPaintProperty('footprints', 'fill-opacity', 1);
        map.setPaintProperty('footprints', 'fill-outline-color', DAYMAP.outline);
        map.setPaintProperty('lit-edges', 'line-opacity', 0);
      }
      map.addLayer({
        id: 'walk-ring',
        type: 'line',
        source: 'walk-ring',
        paint: { 'line-color': CLAIR ? DAYMAP.sub : C.sub, 'line-width': 1.5, 'line-opacity': 0.55, 'line-dasharray': [2, 2] },
      });
      map.addLayer({
        id: 'probe-link',
        type: 'line',
        source: 'probe-link',
        paint: { 'line-color': C.shell, 'line-width': 2, 'line-dasharray': [1, 2] },
      });
      setMapReady(true);
    });
    map.on('error', (e) => {
      // Une tuile qui manque se rattrape seule ; une source GeoJSON ou un
      // style qui échoue, non : on le dit plutôt que d'afficher une carte vide.
      const msg = e.error?.message ?? '';
      if (!/tile|Failed to fetch|NetworkError|AJAXError/i.test(msg)) setMapError(msg || 'Carte indisponible');
    });
    map.on('move', schedule);
    map.on('resize', schedule);
    map.on('moveend', () => {
      const c = map.getCenter();
      callbacksRef.current.onMapCenterChange({ lat: c.lat, lng: c.lng });
      callbacksRef.current.onZoomChange(map.getZoom());
    });
    map.on('click', (e) => {
      // Un clic sur une pastille ou dans la bulle remonte aussi jusqu'à la
      // carte : ce n'est pas un toucher « ici ».
      const target = e.originalEvent?.target;
      if (target instanceof Element && target.closest('.maplibregl-marker')) return;
      callbacksRef.current.onMapTap({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    const userMoved = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) callbacksRef.current.onUserMove();
    };
    map.on('dragstart', userMoved);
    map.on('zoomstart', userMoved);
    mapRef.current = map;
    return () => {
      if (raf) cancelAnimationFrame(raf);
      map.off('move', schedule);
      map.off('resize', schedule);
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      ringLabelRef.current?.remove();
      ringLabelRef.current = null;
      probeMarkerRef.current?.remove();
      probeMarkerRef.current = null;
      beamEl.remove();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    const current = map.getCenter();
    const dist = Math.sqrt((current.lat - mapCenter.lat) ** 2 + (current.lng - mapCenter.lng) ** 2);
    const duration = prefersReducedMotion() ? 0 : 400;
    if (dist > 0.001) {
      map.flyTo({ center: [mapCenter.lng, mapCenter.lat], zoom: mapZoom, duration, essential: true });
    } else if (Math.abs(map.getZoom() - mapZoom) > 0.5) {
      map.flyTo({ zoom: mapZoom, duration, essential: true });
    }
  }, [mapCenter, mapZoom, mapReady]);

  // Le soleil au bord : le temps du geste, et un instant après.
  useEffect(() => {
    if (scrubbing) {
      setSunEdge(true);
      return;
    }
    const t = setTimeout(() => setSunEdge(false), SUN_EDGE_LINGER_MS);
    return () => clearTimeout(t);
  }, [scrubbing]);

  // Le faisceau et le halo de bord suivent l'heure, le lieu choisi, le cadre.
  useEffect(() => {
    if (mapReady) drawOverlay();
  }, [mapReady, drawOverlay, sunPos, selected, insets, sunEdge, userLocation]);

  // Lieu choisi : le reste de la carte s'assombrit un peu, le rayon ressort.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.setPaintProperty('base', 'raster-opacity', CLAIR ? 1 : selectedVenueId ? BASE_OPACITY_CHOSEN : BASE_OPACITY);
  }, [selectedVenueId, mapReady]);

  // La couleur du sol éclairé suit l'heure ; éteint quand le soleil est couché.
  // Une propriété de peinture : rien n'est recalculé.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const p = lightPaint(sunPos.elevation, lisbonMinutesOfDay(currentDate));
    map.setPaintProperty('light', 'fill-color', CLAIR ? DAYMAP.sun : p.color);
    map.setPaintProperty('light', 'fill-opacity', CLAIR ? Math.min(p.opacity, 0.65) : p.opacity);
  }, [mapReady, currentDate, sunPos.elevation]);

  // Le jour, les ombres des bâtiments, un cran plus sombres que le sol.
  // 13 800 projections puis un envoi au worker : découpé en morceaux, mis en
  // cache par minute (le curseur avance au quart d'heure), et pendant le
  // glissement au plus un calcul tous les 300 ms — le faisceau, les pastilles
  // et le halo, eux, suivent chaque pas. Au relâchement, les ombres sont celles
  // de l'heure affichée (voir shadowScheduler.test.ts).
  const shadowsRef = useRef<ShadowScheduler | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const scheduler = createShadowScheduler<ShadowResult>({
      build: buildShadowJob,
      apply: (_key, data) => {
        (map.getSource('building-shadows') as GeoJSONSource | undefined)?.setData(data.shadows);
        (map.getSource('lit-edges') as GeoJSONSource | undefined)?.setData(data.edges);
      },
      onError: (e) => setMapError(`ombres : ${e.message}`),
    });
    shadowsRef.current = scheduler;
    return () => {
      scheduler.dispose();
      shadowsRef.current = null;
    };
  }, [mapReady]);

  const shadowKey = !isDaytime || sunPos.elevation <= 1
    ? NO_SHADOWS
    : `${Math.floor(currentDate.getTime() / 60000) * 60000}|${mapCenter.lat.toFixed(2)}|${mapCenter.lng.toFixed(2)}`;
  useEffect(() => {
    shadowsRef.current?.request(shadowKey, scrubbing);
  }, [shadowKey, scrubbing, mapReady]);

  // Arrivée : cadrée sur l'anneau de 10 min à pied, élargie jusqu'aux lieux
  // les plus proches s'il le faut.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selectedVenueId) return;
    const key = `${userLocation.lat.toFixed(4)},${userLocation.lng.toFixed(4)}`;
    if (framedFor === key) return;
    framedFor = key;
    const bounds = initialFrame(userLocation, venues.map((v) => ({ lat: v.latitude, lng: v.longitude })), MIN_FRAMED_VENUES);
    map.fitBounds(bounds, {
      padding: { top: insets.top + 12, bottom: insets.bottom + 12, left: 12, right: 12 },
      maxZoom: 16.5,
      duration: 0,
    });
  }, [mapReady, userLocation, selectedVenueId, venues, insets]);

  // Carte claire : le cône du repère suit la boussole de l'appareil. Sans
  // boussole (ordi, iOS sans permission), il reste caché : le halo suffit.
  useEffect(() => {
    if (!CLAIR) return;
    const onOrient = (e: DeviceOrientationEvent) => {
      const ios = (e as DeviceOrientationEvent & { webkitCompassHeading?: number }).webkitCompassHeading;
      const heading = ios ?? (e.absolute && e.alpha != null ? 360 - e.alpha : null);
      const map = mapRef.current;
      const cone = userMarkerRef.current?.getElement().querySelector<SVGElement>('.toi-cone');
      if (heading == null || !cone || !map) return;
      cone.style.transform = `rotate(${heading - map.getBearing()}deg)`;
      cone.style.opacity = '1';
    };
    window.addEventListener('deviceorientationabsolute', onOrient as EventListener);
    window.addEventListener('deviceorientation', onOrient);
    return () => {
      window.removeEventListener('deviceorientationabsolute', onOrient as EventListener);
      window.removeEventListener('deviceorientation', onOrient);
    };
  }, []);

  // Toi (rond vide coquille) + l'anneau de 10 min à pied.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ring = ringCoords(userLocation, WALK_RING_M);
    (map.getSource('walk-ring') as GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [ring] },
    });

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Toi');
      el.style.pointerEvents = 'none';
      if (CLAIR) {
        el.style.cssText += ';position:relative;width:96px;height:96px';
        el.innerHTML = toiMarkup();
      } else {
        el.innerHTML = haloSvg({ kind: 'you', tone: TONE }, 34);
      }
      userMarkerRef.current = new Marker({ element: el, anchor: 'center' });
    }
    userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]).addTo(map);

    if (!ringLabelRef.current) {
      const el = document.createElement('div');
      el.textContent = '10 min à pied';
      el.style.cssText = CLAIR
        ? `pointer-events:none;font:700 12px 'Funnel Display',sans-serif;color:${DAYMAP.ink};background:#FFF1D6;border:1.5px solid ${DAYMAP.ink};border-radius:8px;padding:1px 7px;white-space:nowrap`
        : `pointer-events:none;font:600 12px Geist,sans-serif;color:${C.sub};text-shadow:0 1px 3px ${C.night},0 0 6px ${C.night};white-space:nowrap`;
      ringLabelRef.current = new Marker({ element: el, anchor: 'bottom', offset: [0, -4] });
    }
    const top = ring[0];
    ringLabelRef.current.setLngLat(top).addTo(map);
  }, [userLocation, mapReady]);

  // Pastilles halo : le rond brille si le lieu est au soleil, éteint à
  // l'ombre, bat s'il est choisi ; à côté, une étiquette « nom heure ». 6 à
  // l'écran au plus, les meilleures d'abord, sans chevauchement.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const recMap = new Map(recommendations.map((r) => [r.venue.id, r]));
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    const candidates = venues
      .map((v) => {
        const rec = recMap.get(v.id);
        return { venue: v, rec, label: rec ? pillLabel(rec) : null, sunMatch: rec?.sunMatch ?? 0, px: map.project([v.longitude, v.latitude]) };
      })
      .filter((c) => c.venue.id === selectedVenueId || (
        c.px.x > 8 && c.px.x < width - 8 && c.px.y > insets.top + 20 && c.px.y < height - insets.bottom - 20
      ))
      .sort((a, b) => {
        if (a.venue.id === selectedVenueId) return -1;
        if (b.venue.id === selectedVenueId) return 1;
        const ai = a.label?.inIt ? 1 : 0;
        const bi = b.label?.inIt ? 1 : 0;
        if (ai !== bi) return bi - ai;
        return b.sunMatch - a.sunMatch;
      });

    // Le libellé « 10 min à pied » et « toi » réservent leur place.
    const ringTop = map.project(ringCoords(userLocation, WALK_RING_M)[0]);
    const you = map.project([userLocation.lng, userLocation.lat]);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [
      { x0: ringTop.x - 50, y0: ringTop.y - 24, x1: ringTop.x + 50, y1: ringTop.y },
      { x0: you.x - 17, y0: you.y - 17, x1: you.x + 17, y1: you.y + 17 },
    ];
    const overlaps = (b: { x0: number; y0: number; x1: number; y1: number }) =>
      placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    let quiet = 0;
    const loudAvailable = candidates.filter((c) => c.label?.inIt).length;
    const inWord = mode === 'SUN' ? 'au soleil' : "à l'ombre";
    const alt = sunPos.elevation;

    for (const { venue: v, rec, label, px: p } of candidates) {
      if (markersRef.current.length >= MAX_PILLS) break;
      const isSelected = v.id === selectedVenueId;
      const name = label?.name ?? v.name;
      const loud = !!label?.inIt;
      if (!loud && !isSelected && loudAvailable >= 3 && quiet >= MAX_QUIET_WITH_LOUD) continue;

      // L'heure : la fin de la fenêtre si on y est ; sinon « dès 17:30 » ou
      // l'état. Orange seulement pour une heure de soleil.
      const soon = !loud && rec?.sunArrivesInMin != null && !rec.arrivesTomorrow ? rec.sunWindowStart : null;
      const time = loud ? label?.time ?? null : soon ? `dès ${soon}` : mode === 'SUN' ? 'ombre' : 'soleil';
      const sunHour = mode === 'SUN' && (loud || !!soon);
      const lit = alt > LIT_MIN_ALT && (rec?.sunPercentage ?? 0) >= LIT_PCT;

      // Nuit : étiquette à droite du rond, sinon à gauche, sinon au-dessus.
      // Carte claire : une épingle — la bulle se pose sur le lieu, sa pointe
      // sur un petit point encre, et le soleil passe dans la bulle. Un seul
      // signe par lieu : pas de halo à côté d'une étiquette.
      const w = name.length * 7.4 + (time ? time.length * 7.6 + 5 : 0) + 20 + (CLAIR ? 14 : 0);
      const h = 24;
      const g = CLAIR ? 5 : GLYPH_PX / 2;
      const glyphBox = { x0: p.x - g, y0: p.y - g, x1: p.x + g, y1: p.y + g };
      const top = { side: 'top', x0: p.x - w / 2, y0: p.y - g - (CLAIR ? 9 : 4) - h } as const;
      const right = { side: 'right', x0: p.x + g + 2, y0: p.y - h / 2 } as const;
      const left = { side: 'left', x0: p.x - g - 2 - w, y0: p.y - h / 2 } as const;
      const spots = CLAIR ? [top] : [right, left, top];
      if (!isSelected && overlaps(glyphBox)) continue;
      let spot: (typeof spots)[number] | null = null;
      for (const s of spots) {
        const box = { x0: s.x0 - PILL_GAP_PX, y0: s.y0 - PILL_GAP_PX, x1: s.x0 + w + PILL_GAP_PX, y1: s.y0 + h + PILL_GAP_PX };
        if (s.x0 < 6 || s.x0 + w > width - 6 || s.y0 < insets.top || s.y0 + h > height - insets.bottom) continue;
        if (overlaps(box)) continue;
        spot = s;
        placed.push(box);
        break;
      }
      if (!spot && !isSelected) continue;
      placed.push(glyphBox);
      if (!loud) quiet++;

      // Bouton de 44 px autour du rond : la cible tactile dépasse le dessin.
      const el = document.createElement('button');
      el.type = 'button';
      // Ce que disent ceux qui sont sur place (question « il reste des places ? »).
      const live = liveReports.getState(v.id);
      const liveNote = live ? `, ${LIVE_SHORT[live.level].toLowerCase()} d'après ceux sur place` : '';
      el.setAttribute(
        'aria-label',
        (loud && label?.time ? `${v.name}, ${inWord} jusqu'à ${label.time}` : `${v.name}, ${lit ? 'au soleil' : "à l'ombre"}`) + liveNote
      );
      // Pas de `position` ici : .maplibregl-marker est déjà absolu (et sert de
      // repère à l'étiquette) ; « relative » empilait les pastilles dans le flux.
      el.style.cssText = `display:block;width:${HIT_PX}px;height:${HIT_PX}px;padding:0;background:none;border:0;cursor:pointer;`;
      if (isSelected) el.setAttribute('aria-current', 'true');
      const glyph = document.createElement('span');
      glyph.style.cssText = `position:absolute;left:${(HIT_PX - GLYPH_PX) / 2}px;top:${(HIT_PX - GLYPH_PX) / 2}px;width:${GLYPH_PX}px;height:${GLYPH_PX}px;`;
      glyph.innerHTML = CLAIR
        ? `<span style="position:absolute;left:50%;top:50%;width:10px;height:10px;margin:-5px 0 0 -5px;border-radius:50%;background:${DAYMAP.ink};border:2px solid #FFF1D6;box-sizing:border-box"></span>` +
          (isSelected ? haloPulseMarkup(GLYPH_PX) : '')
        : isSelected
          ? haloSvg({ kind: 'dest', tone: TONE }, GLYPH_PX) + haloPulseMarkup(GLYPH_PX)
          : haloSvg({ kind: lit ? 'sun' : 'shade', tone: TONE, alt }, lit ? GLYPH_PX : 20);
      if (!isSelected && !lit && !CLAIR) {
        glyph.style.left = `${(HIT_PX - 20) / 2}px`;
        glyph.style.top = `${(HIT_PX - 20) / 2}px`;
      }
      el.append(glyph);
      if (spot) {
        const tag = document.createElement('span');
        const dx = spot.x0 - (p.x - HIT_PX / 2);
        const dy = spot.y0 - (p.y - HIT_PX / 2);
        tag.style.cssText = `position:absolute;left:${dx}px;top:${dy}px;height:${h}px;display:flex;align-items:center;gap:5px;padding:0 9px;${CLAIR ? `border-radius:10px;background:#FFF1D6;color:${DAYMAP.ink};border:1.5px solid ${DAYMAP.ink};box-shadow:2px 2px 0 ${DAYMAP.ink};font:700 13px 'Funnel Display',sans-serif;` : `border-radius:8px;background:rgba(8,20,58,0.88);color:${C.shell};font:600 12.5px Geist,sans-serif;`}white-space:nowrap;pointer-events:none;`;
        if (CLAIR) {
          // La pointe : un carré crème tourné, cerné d'encre sur ses deux côtés visibles.
          const q = document.createElement('span');
          q.style.cssText = `position:absolute;left:50%;bottom:-5.5px;margin-left:-5px;width:9px;height:9px;background:#FFF1D6;border-right:1.5px solid ${DAYMAP.ink};border-bottom:1.5px solid ${DAYMAP.ink};transform:rotate(45deg);`;
          tag.append(q);
          // Le soleil dans la bulle : disque braise, ou rond vide à l'ombre.
          const s = document.createElement('span');
          s.style.cssText = `flex:none;width:9px;height:9px;border-radius:50%;${lit ? `background:${LIGHT.fire}` : `border:1.8px solid ${DAYMAP.sub}`};box-sizing:border-box;`;
          tag.append(s);
        }
        if (isSelected && CLAIR) tag.style.transform = 'scale(1.12)';
        tag.append(document.createTextNode(name));
        if (live) {
          // Plus de feu tricolore : la jauge suit la grammaire halo — pleine =
          // des places, à moitié = presque plein, vide = complet.
          const g = document.createElement('span');
          g.style.cssText = 'display:inline-flex;flex:none;';
          g.innerHTML = liveGlyphSvg(live.level, 12);
          tag.append(g);
        }
        if (time) {
          const t = document.createElement('span');
          t.textContent = time;
          t.style.cssText = `font:700 12px 'Geist Mono',monospace;color:${CLAIR ? (sunHour ? DAYMAP.ember : DAYMAP.sub) : sunHour ? LIGHT.inkNight : C.sub};`;
          tag.append(t);
        }
        el.append(tag);
      }
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        onVenueSelect(v.id);
      });
      markersRef.current.push(
        new Marker({ element: el, anchor: 'center' }).setLngLat([v.longitude, v.latitude]).addTo(map)
      );
    }
    // mapZoom / mapCenter : non lus directement (map.project reflète déjà la
    // vue), mais le tri visible/caché ne vaut que pour la vue où il a été
    // calculé — sans eux, pan et zoom garderaient les pastilles d'avant.
  }, [venues, recommendations, mode, selectedVenueId, mapReady, onVenueSelect, mapZoom, mapCenter, insets, userLocation, sunPos, liveVersion]);

  // La bulle « ici » et le pointillé vers le voisin qui fait mieux.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const link = map.getSource('probe-link') as GeoJSONSource | undefined;
    if (!probe) {
      probeMarkerRef.current?.remove();
      link?.setData(EMPTY);
      return;
    }
    if (!probeMarkerRef.current) {
      // Au-dessus des pastilles, recréées après elle à chaque rendu.
      probeEl.style.zIndex = '10';
      probeMarkerRef.current = new Marker({ element: probeEl, anchor: 'bottom' });
    }
    probeMarkerRef.current.setLngLat([probe.point.lng, probe.point.lat]).addTo(map);
    link?.setData(
      probe.neighbour
        ? {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: [
                [probe.point.lng, probe.point.lat],
                [probe.neighbour.point.lng, probe.neighbour.point.lat],
              ],
            },
          }
        : EMPTY
    );
  }, [probe, mapReady, probeEl]);

  // Toucher le halo de bord : la destination revient au centre.
  const recenterOnSelected = useCallback(() => {
    const map = mapRef.current;
    const sel = frameRef.current.selected;
    if (!map || !sel) return;
    map.easeTo({ center: [sel.venue.longitude, sel.venue.latitude], duration: prefersReducedMotion() ? 0 : 450, essential: true });
  }, []);

  const edgeIsSun = sunEdge && sunPos.elevation > LIT_MIN_ALT;
  const edgeLabel = selected?.walk
    ? selected.walk.unit === 'min à pied'
      ? `${selected.walk.value} min`
      : selected.walk.value
    : '';

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" style={{ background: C.night }} />
      {mapError && (
        <p role="alert" className="absolute inset-x-4 top-20 z-10 rounded-2xl bg-dusk-panel px-4 py-3 text-[13px] text-dusk-shell">
          La carte n'a pas pu se charger ({mapError}).
        </p>
      )}

      {/* Le halo de bord : un seul à la fois. Position écrite par drawOverlay. */}
      <button
        ref={edgeRef}
        type="button"
        onClick={edgeIsSun ? undefined : recenterOnSelected}
        disabled={edgeIsSun || !selected}
        aria-label={edgeIsSun ? 'Le soleil est de ce côté' : selected ? `Recentrer sur ${selected.venue.name}${edgeLabel ? `, ${edgeLabel} à pied` : ''}` : ''}
        className={`absolute left-0 top-0 z-10 flex min-h-11 items-center gap-1.5 rounded-full font-mono text-[13px] font-bold text-dusk-shell ${
          edgeIsSun ? 'cursor-default' : 'bg-dusk-deep shadow-[0_0_0_1px_#233B7C]'
        }`}
        style={{ display: 'none', willChange: 'transform' }}
      >
        <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
          {edgeIsSun ? (
            <HaloIcon kind="sun" tone="night" alt={sunPos.elevation} size={38} />
          ) : (
            <HaloIcon kind="dest" tone="night" size={30} />
          )}
          <span ref={arrowRef} aria-hidden="true" className="absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 block h-3 w-3">
            <svg viewBox="0 0 12 12" width="12" height="12" className="block">
              <path d="M6 1 11 9H1z" fill={NIGHT.shell} />
            </svg>
          </span>
        </span>
        {!edgeIsSun && edgeLabel}
      </button>

      {/* Toi hors de l'écran : pas de halo, un bouton. */}
      {youOff && onRecenter && (
        <button
          type="button"
          onClick={onRecenter}
          className="absolute right-4 top-[calc(env(safe-area-inset-top)+12px)] z-20 flex min-h-11 items-center gap-2 rounded-full border border-dusk-line bg-dusk-deep pl-2.5 pr-4 text-[13px] font-bold text-dusk-shell active:scale-95 transition-transform motion-reduce:transition-none"
        >
          <HaloIcon kind="you" tone="night" size={22} />
          Revenir sur moi
        </button>
      )}

      {probe &&
        createPortal(
          <ProbeBubble probe={probe} onClose={onProbeClose} onNeighbour={() => probe.neighbour && onVenueSelect(probe.neighbour.id)} />,
          probeEl
        )}
    </div>
  );
}

function ProbeBubble({ probe, onClose, onNeighbour }: { probe: ProbeView; onClose: () => void; onNeighbour: () => void }) {
  const accent = probe.mode === 'SUN' ? 'text-dusk-ember' : 'text-dusk-sub';
  return (
    <div className="flex flex-col items-center">
      <div className="glass-night relative w-[min(78vw,280px)] rounded-2xl border border-dusk-edge/70 py-2.5 pl-3.5 pr-11 text-dusk-shell shadow-[0_8px_24px_rgba(8,20,58,0.55)] animate-scale-in motion-reduce:animate-none">
        {probe.error ? (
          <p role="alert" className="text-[13px] leading-snug">{probe.error}</p>
        ) : (
          <p className="text-[14px] font-semibold leading-snug">
            {probe.lead}
            {probe.time && <span className={`ml-1 font-mono ${accent}`}>{probe.time}</span>}
          </p>
        )}
        {probe.neighbour && (
          <button
            onClick={onNeighbour}
            className="-mb-1 mt-1.5 flex min-h-11 w-full items-center gap-2 border-t border-dusk-edge/60 pt-1.5 text-left active:opacity-70"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[12.5px] text-dusk-sub">
                Plus longtemps {probe.mode === 'SUN' ? 'au soleil' : "à l'ombre"}, à {probe.neighbour.walkMin} min
              </span>
              <span className="block truncate text-[14px] font-semibold">
                {probe.neighbour.name}
                {probe.neighbour.time && <span className={`ml-1.5 font-mono ${accent}`}>{probe.neighbour.time}</span>}
              </span>
            </span>
            <span aria-hidden="true" className="text-[16px] text-dusk-shell">→</span>
          </button>
        )}
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center text-dusk-sub active:opacity-70"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="mt-1.5 h-3.5 w-3.5 rounded-full border-[3px] border-dusk-shell bg-dusk-night" />
    </div>
  );
}
