import { useRef, useEffect, useState, useMemo, useSyncExternalStore } from 'react';
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
import { LIVE_COLOR, LIVE_SHORT } from '@/utils/live';
import { ShadowService } from '@/services/ShadowService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonTerrain30 } from '@/data/lisbonTerrain30';
import { caparicaTerrain30 } from '@/data/caparicaTerrain30';
import { almadaTerrain30 } from '@/data/almadaTerrain30';
import { WALK_RING_M, initialFrame, pillLabel } from '@/utils/mapGuide';
import { gridRuns } from '@/utils/landMask';

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
}

// Palette « raccord » : un seul bleu nuit en paliers. L'eau est le palier le
// plus profond, la ville la nuit, l'ombre un cran plus sombre que le sol ; la
// seule autre couleur est la lumière.
const C = {
  night: '#0B1A45',
  water: '#071233',
  sunVeil: '#FF6A2B',
  shadow: '#08143A',
  building: '#1A2F69',
  sun: '#FF6A2B',
  shade: '#AFC0E8',
  shell: '#FFF6EC',
  sub: '#AFC0E8',
  surface: '#122457',
  edge: '#3A5099',
};

const CARTO_KEY = import.meta.env.VITE_CARTO_API_KEY ?? '';
const cartoTiles = (style: string) =>
  ['a', 'b', 'c'].map(
    // CARTO attend `key=`, pas `api_key=` — avec l'ancien nom la clé était
    // silencieusement ignorée et les tuiles servies en quota anonyme.
    (s) => `https://${s}.basemaps.cartocdn.com/rastertiles/${style}/{z}/{x}/{y}@2x.png${CARTO_KEY ? `?key=${CARTO_KEY}` : ''}`
  );

const MAP_STYLE: import('maplibre-gl').StyleSpecification = {
  version: 8,
  sources: {
    base: {
      type: 'raster',
      tiles: cartoTiles('dark_nolabels'),
      tileSize: 256,
      attribution: '&copy; OSM &copy; CARTO',
    },
    labels: {
      type: 'raster',
      tiles: cartoTiles('dark_only_labels'),
      tileSize: 256,
    },
  },
  layers: [
    { id: 'night', type: 'background', paint: { 'background-color': C.night } },
    // Le fond CARTO sombre est gris neutre : posé à mi-opacité sur la nuit
    // océan, il en prend la teinte et garde rues, Tage et parcs lisibles.
    { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 0.45, 'raster-contrast': 0.3 } },
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

// Terre et eau d'après les grilles de relief à 30 m (voir landMask.ts).
const TERRAIN_GRIDS = [lisbonTerrain30, caparicaTerrain30, almadaTerrain30];
const LAND = gridRuns(TERRAIN_GRIDS, 'land');
const WATER = gridRuns(TERRAIN_GRIDS, 'water');
/** Voile soleil : 12 % au plus, sinon la ville entière vire au brun. */
const SUN_VEIL_OPACITY = 0.12;

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

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

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

  // Les gestionnaires de la carte sont posés une fois ; ils lisent la
  // dernière version des callbacks par ces refs, pas celle du montage.
  const callbacksRef = useRef({ onMapCenterChange, onZoomChange, onMapTap, onUserMove });
  useEffect(() => {
    callbacksRef.current = { onMapCenterChange, onZoomChange, onMapTap, onUserMove };
  }, [onMapCenterChange, onZoomChange, onMapTap, onUserMove]);

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
      maxZoom: 18,
      minZoom: 11,
    });
    map.on('load', () => {
      map.addSource('water', { type: 'geojson', data: WATER });
      map.addSource('land', { type: 'geojson', data: LAND });
      map.addSource('building-shadows', { type: 'geojson', data: EMPTY });
      map.addSource('footprints', { type: 'geojson', data: FOOTPRINTS });
      map.addSource('walk-ring', { type: 'geojson', data: EMPTY });
      map.addSource('probe-link', { type: 'geojson', data: EMPTY });
      // Sous les libellés : les noms de rues restent lisibles.
      map.addLayer(
        { id: 'water', type: 'fill', source: 'water', paint: { 'fill-color': C.water, 'fill-opacity': 0.9, 'fill-antialias': false } },
        'labels'
      );
      map.addLayer(
        { id: 'sun-veil', type: 'fill', source: 'land', paint: { 'fill-color': C.sunVeil, 'fill-opacity': 0, 'fill-antialias': false } },
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
          paint: { 'fill-color': C.building, 'fill-opacity': 0.35 },
        },
        'labels'
      );
      map.addLayer({
        id: 'walk-ring',
        type: 'line',
        source: 'walk-ring',
        paint: { 'line-color': C.shade, 'line-width': 1.5, 'line-opacity': 0.8, 'line-dasharray': [2, 2] },
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
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      userMarkerRef.current?.remove();
      userMarkerRef.current = null;
      ringLabelRef.current?.remove();
      ringLabelRef.current = null;
      probeMarkerRef.current?.remove();
      probeMarkerRef.current = null;
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

  const sunPos = useMemo(
    () => SunService.getSunPosition(currentDate, mapCenter.lat, mapCenter.lng),
    [currentDate, mapCenter]
  );
  const isDaytime = sunPos.elevation > 0;

  // Le jour, un voile chaud sur la terre ; les ombres par-dessus, plus sombres.
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    map.setPaintProperty('sun-veil', 'fill-opacity', isDaytime ? SUN_VEIL_OPACITY : 0);

    const source = map.getSource('building-shadows') as GeoJSONSource | undefined;
    if (!source) return;
    if (!isDaytime || sunPos.elevation <= 1) {
      source.setData(EMPTY);
      return;
    }
    source.setData({
      type: 'FeatureCollection',
      features: lisbonBuildings.map((building) => {
        const proj = ShadowService.projectBuildingShadow(building, currentDate, mapCenter.lat, mapCenter.lng);
        const coords = proj.shadowPoints.map((p) => [p.lng, p.lat]);
        coords.push(coords[0]);
        return { type: 'Feature' as const, properties: {}, geometry: { type: 'Polygon' as const, coordinates: [coords] } };
      }),
    });
  }, [isDaytime, mapReady, sunPos, currentDate, mapCenter]);

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

  // Toi + l'anneau de 10 min à pied.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const ring = ringCoords(userLocation, WALK_RING_M);
    (map.getSource('walk-ring') as GeoJSONSource | undefined)?.setData({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: ring },
    });

    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.setAttribute('aria-label', 'Toi');
      el.style.pointerEvents = 'none';
      el.innerHTML =
        `<div style="position:relative;width:16px;height:16px">` +
        `<div class="animate-pulse-glow" style="position:absolute;inset:-10px;border-radius:50%;background:rgba(255,246,236,0.18)"></div>` +
        `<div style="position:absolute;inset:0;border-radius:50%;background:${C.night};border:3px solid ${C.shell}"></div>` +
        `<div style="position:absolute;top:22px;left:50%;transform:translateX(-50%);font:600 11px Geist,sans-serif;color:${C.shell};text-shadow:0 1px 3px ${C.night}">toi</div>` +
        `</div>`;
      userMarkerRef.current = new Marker({ element: el, anchor: 'center' });
    }
    userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]).addTo(map);

    if (!ringLabelRef.current) {
      const el = document.createElement('div');
      el.textContent = '10 min à pied';
      el.style.cssText = `pointer-events:none;font:600 12px Geist,sans-serif;color:${C.shade};text-shadow:0 1px 3px ${C.night},0 0 6px ${C.night};white-space:nowrap`;
      ringLabelRef.current = new Marker({ element: el, anchor: 'bottom', offset: [0, -4] });
    }
    const top = ring[0];
    ringLabelRef.current.setLngLat(top).addTo(map);
  }, [userLocation, mapReady]);

  // Pastilles « nom · heure ». 6 à 8 à l'écran, les meilleures d'abord, sans
  // chevauchement ; les lieux hors de ce qu'on cherche restent discrets.
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
        return { venue: v, label: rec ? pillLabel(rec) : null, sunMatch: rec?.sunMatch ?? 0, px: map.project([v.longitude, v.latitude]) };
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

    // Le libellé « 10 min à pied » réserve sa place : une pastille dessus
    // le rendait illisible.
    const ringTop = map.project(ringCoords(userLocation, WALK_RING_M)[0]);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [
      { x0: ringTop.x - 50, y0: ringTop.y - 24, x1: ringTop.x + 50, y1: ringTop.y },
    ];
    let quiet = 0;
    const loudAvailable = candidates.filter((c) => c.label?.inIt).length;
    const good = mode === 'SUN' ? C.sun : C.shade;
    const inWord = mode === 'SUN' ? 'au soleil' : "à l'ombre";

    for (const { venue: v, label, px: p } of candidates) {
      if (markersRef.current.length >= MAX_PILLS) break;
      const isSelected = v.id === selectedVenueId;
      const name = label?.name ?? v.name;
      const loud = !!label?.inIt;
      if (!loud && !isSelected && loudAvailable >= 3 && quiet >= MAX_QUIET_WITH_LOUD) continue;

      const time = loud ? label?.time ?? null : null;
      const w = loud ? name.length * 6.6 + (time ? 42 : 0) + 22 : name.length * 6.4 + 22;
      const h = loud ? 32 : 28;
      const box = { x0: p.x - w / 2 - PILL_GAP_PX, y0: p.y - h / 2 - PILL_GAP_PX, x1: p.x + w / 2 + PILL_GAP_PX, y1: p.y + h / 2 + PILL_GAP_PX };
      // Entière à l'écran ou pas du tout : une pastille coupée au bord ne se lit pas.
      if (!isSelected && (p.x - w / 2 < 6 || p.x + w / 2 > width - 6)) continue;
      if (!isSelected && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
      placed.push(box);
      if (!loud) quiet++;

      // Bouton transparent de 44 px de haut autour de la gélule : la cible
      // tactile dépasse le dessin, pas l'inverse.
      const el = document.createElement('button');
      el.type = 'button';
      const live = liveReports.getState(v.id);
      const liveNote = live ? `, ${LIVE_SHORT[live.level].toLowerCase()} d'après ceux sur place` : '';
      el.setAttribute('aria-label', (time ? `${v.name}, ${inWord} jusqu'à ${time}` : v.name) + liveNote);
      el.style.cssText = `display:block;padding:${(44 - h) / 2}px 0;background:none;border:0;cursor:pointer;`;
      const pill = document.createElement('span');
      pill.style.cssText = loud
        ? `display:flex;align-items:center;gap:6px;height:${h}px;padding:0 11px;border-radius:999px;background:${good};color:${C.night};font:600 12.5px Geist,sans-serif;box-shadow:0 2px 10px rgba(8,20,58,.55);white-space:nowrap;`
        : `display:flex;align-items:center;height:${h}px;padding:0 10px;border-radius:999px;background:${C.surface};border:1px solid ${C.edge};color:${C.sub};font:500 12px Geist,sans-serif;white-space:nowrap;`;
      if (isSelected) pill.style.outline = `3px solid ${C.shell}`;
      if (isSelected) pill.style.outlineOffset = '2px';
      if (live) {
        // Le drapeau : feu tricolore de la place disponible, dit par ceux qui y sont.
        const flag = document.createElement('span');
        flag.style.cssText = `flex:none;width:10px;height:10px;border-radius:50%;background:${LIVE_COLOR[live.level]};box-shadow:0 0 0 2px ${C.night};${loud ? '' : 'margin-right:6px;'}`;
        pill.append(flag);
      }
      pill.append(document.createTextNode(name));
      if (time) {
        const t = document.createElement('span');
        t.textContent = time;
        t.style.cssText = "font-family:'Geist Mono',monospace;font-weight:600;";
        pill.append(t);
      }
      el.append(pill);
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
  }, [venues, recommendations, mode, selectedVenueId, mapReady, onVenueSelect, mapZoom, mapCenter, insets, userLocation, liveVersion]);

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

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" style={{ background: C.night }} />
      {mapError && (
        <p role="alert" className="absolute inset-x-4 top-20 z-10 rounded-2xl bg-dusk-panel px-4 py-3 text-[13px] text-dusk-shell">
          La carte n'a pas pu se charger ({mapError}).
        </p>
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
