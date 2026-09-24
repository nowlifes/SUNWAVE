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
import { initialFrame, pillLabel } from '@/utils/mapGuide';
import { gridRuns } from '@/utils/landMask';
import { LIT_MIN_ALT, isOnScreen, type Rect } from '@/utils/halo';
import { liveGlyphSvg } from '@/utils/haloMarkup';
import { DAY, LIGHT, NIGHT } from '@/utils/palette';
import { MAP_COLORS, buildStyle, applyTheme } from '@/utils/mapTheme';
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
  /** On glisse l'heure : les ombres se recalculent au plus tous les 300 ms. */
  scrubbing?: boolean;
  /** Entre lever et coucher du soleil : la carte est claire, sinon bleu nuit. */
  day: boolean;
  /** « Revenir sur moi », quand toi est sorti de l'écran. */
  onRecenter?: () => void;
}

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

// Eau d'après les grilles de relief à 30 m (voir landMask.ts) : le fleuve
// reste dessiné même quand les tuiles vectorielles n'arrivent pas.
const TERRAIN_GRIDS = [lisbonTerrain30, caparicaTerrain30, almadaTerrain30];
const WATER = gridRuns(TERRAIN_GRIDS, 'water');

// La carte se cadre une fois par position d'arrivée et par session : ensuite,
// c'est l'utilisateur qui décide où il regarde. Changer de position (la
// géolocalisation répond après coup) recadre une fois de plus.
let framedFor: string | null = null;
/** Des pastilles à l'arrivée, au moins : une carte vide n'explique rien. */
const MIN_FRAMED_VENUES = 4;
/** Le cadre d'arrivée : ~6 min à pied autour de soi, pour lire les rues. */
const FRAME_RADIUS_M = 450;
/** 5 pastilles à l'écran, pas plus : au-delà, on ne lit plus rien. */
const MAX_PILLS = 5;
/** Discrètes (lieux hors de ce qu'on cherche) : une seule quand il y a assez
 *  de lieux dans ce qu'on cherche ; la nuit ou sans soleil, elles comblent. */
const MAX_QUIET_WITH_LOUD = 1;
const PILL_GAP_PX = 4;
/** Le rond d'une pastille (sa boîte de collision), et sa cible tactile. */
const GLYPH_PX = 24;
const HIT_PX = 44;
/** Sous ce seuil (%), un lieu est à l'ombre : son rond est creux. */
const LIT_PCT = 50;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

type ShadowCollection = { type: 'FeatureCollection'; features: { type: 'Feature'; properties: object; geometry: { type: 'Polygon'; coordinates: number[][][] } }[] };
const NO_SHADOWS = 'none';
/** Bâtiments projetés par morceau : ~1 ms chacun en CPU x4 plutôt qu'un bloc. */
const SHADOW_CHUNK = 1500;

/** Le calcul des ombres d'une minute (clé « instant|lat|lng »), en morceaux. */
function buildShadowJob(key: string): ShadowJob<ShadowCollection> {
  const features: ShadowCollection['features'] = [];
  if (key === NO_SHADOWS) return { step: () => true, result: () => ({ type: 'FeatureCollection', features }) };
  const [t, lat, lng] = key.split('|').map(Number);
  const date = new Date(t);
  let i = 0;
  return {
    step() {
      const end = Math.min(lisbonBuildings.length, i + SHADOW_CHUNK);
      for (; i < end; i++) {
        const proj = ShadowService.projectBuildingShadow(lisbonBuildings[i], date, lat, lng);
        const coords = proj.shadowPoints.map((p) => [p.lng, p.lat]);
        coords.push(coords[0]);
        features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } });
      }
      return i >= lisbonBuildings.length;
    },
    result: () => ({ type: 'FeatureCollection', features }),
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
  day,
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
  const probeMarkerRef = useRef<Marker | null>(null);
  const [probeEl] = useState(() => document.createElement('div'));
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  // « toi » hors de l'écran : un bouton. Un état React, mais posé seulement
  // quand la réponse change (pas à chaque image du pan).
  const [youOff, setYouOff] = useState(false);
  const youOffRef = useRef(false);

  // Les gestionnaires de la carte sont posés une fois ; ils lisent la
  // dernière version des callbacks par ces refs, pas celle du montage.
  const callbacksRef = useRef({ onMapCenterChange, onZoomChange, onMapTap, onUserMove });
  useEffect(() => {
    callbacksRef.current = { onMapCenterChange, onZoomChange, onMapTap, onUserMove };
  }, [onMapCenterChange, onZoomChange, onMapTap, onUserMove]);
  // Le thème à la création de la carte : lu une fois, ensuite applyTheme.
  const dayRef = useRef(day);

  const sunPos = useMemo(
    () => SunService.getSunPosition(currentDate, mapCenter.lat, mapCenter.lng),
    [currentDate, mapCenter]
  );

  // Ce que la vérification « toi hors écran » lit : une ref, lue par la boucle rAF.
  const frameRef = useRef({ userLocation, insets });
  useEffect(() => {
    frameRef.current = { userLocation, insets };
  });

  /** Toi hors de l'écran : au plus une fois par image. */
  const drawOverlay = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const { userLocation: you, insets: ins } = frameRef.current;
    const { clientWidth: W, clientHeight: H } = map.getContainer();
    const visible: Rect = { left: 0, top: ins.top, right: W, bottom: Math.max(ins.top + 40, H - ins.bottom) };
    const off = !isOnScreen(map.project([you.lng, you.lat]), visible, 0);
    if (off !== youOffRef.current) {
      youOffRef.current = off;
      setYouOff(off);
    }
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: buildStyle(dayRef.current, {
        water: { type: 'geojson', data: WATER },
        'building-shadows': { type: 'geojson', data: EMPTY },
        footprints: { type: 'geojson', data: FOOTPRINTS },
        'probe-link': { type: 'geojson', data: EMPTY },
      }),
      center: [mapCenter.lng, mapCenter.lat],
      zoom: mapZoom,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxZoom: 18,
      minZoom: 11,
    });
    map.touchZoomRotate.disableRotation();
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        drawOverlay();
      });
    };
    // « style.load » et pas « load » : « load » n'arrive jamais si une source
    // (les tuiles vectorielles) échoue, et les pastilles resteraient sans carte.
    map.once('style.load', () => setMapReady(true));
    map.on('error', (e) => {
      // Une tuile qui manque se rattrape seule ; un style ou une source
      // GeoJSON qui échoue, non : on le dit plutôt que d'afficher une carte vide.
      const msg = e.error?.message ?? '';
      if (!/tile|Failed to fetch|NetworkError|AJAXError|glyph|font|\.pbf/i.test(msg)) setMapError(msg || 'Carte indisponible');
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
      probeMarkerRef.current?.remove();
      probeMarkerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Jour ↔ nuit : les couleurs changent en place, aucune tuile rechargée.
  useEffect(() => {
    if (mapRef.current && mapReady) applyTheme(mapRef.current, day);
  }, [day, mapReady]);

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

  // « Toi hors écran » suit le cadre et la position.
  useEffect(() => {
    if (mapReady) drawOverlay();
  }, [mapReady, drawOverlay, insets, userLocation]);

  // Les ombres des bâtiments, en gris-bleu sur les rues jaunes.
  // 13 800 projections puis un envoi au worker : découpé en morceaux, mis en
  // cache par minute (le curseur avance au quart d'heure), et pendant le
  // glissement au plus un calcul tous les 300 ms — les pastilles, elles, suivent
  // chaque pas. Au relâchement, les ombres sont celles de l'heure affichée
  // (voir shadowScheduler.test.ts).
  const shadowsRef = useRef<ShadowScheduler | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const scheduler = createShadowScheduler<ShadowCollection>({
      build: buildShadowJob,
      apply: (_key, data) => {
        (map.getSource('building-shadows') as GeoJSONSource | undefined)?.setData(data);
      },
      onError: (e) => setMapError(`ombres : ${e.message}`),
    });
    shadowsRef.current = scheduler;
    return () => {
      scheduler.dispose();
      shadowsRef.current = null;
    };
  }, [mapReady]);

  const shadowKey = !day || sunPos.elevation <= 1
    ? NO_SHADOWS
    : `${Math.floor(currentDate.getTime() / 60000) * 60000}|${mapCenter.lat.toFixed(2)}|${mapCenter.lng.toFixed(2)}`;
  useEffect(() => {
    shadowsRef.current?.request(shadowKey, scrubbing);
  }, [shadowKey, scrubbing, mapReady]);

  // Arrivée : cadrée sur ce qui est à 10 min à pied, élargie jusqu'aux lieux
  // les plus proches s'il le faut.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || selectedVenueId) return;
    const key = `${userLocation.lat.toFixed(4)},${userLocation.lng.toFixed(4)}`;
    if (framedFor === key) return;
    framedFor = key;
    const bounds = initialFrame(userLocation, venues.map((v) => ({ lat: v.latitude, lng: v.longitude })), MIN_FRAMED_VENUES, FRAME_RADIUS_M);
    map.fitBounds(bounds, {
      padding: { top: insets.top + 12, bottom: insets.bottom + 12, left: 12, right: 12 },
      maxZoom: 16.5,
      duration: 0,
    });
  }, [mapReady, userLocation, selectedVenueId, venues, insets]);

  // Toi : un rond bleu nuit (coquille la nuit, pour rester lisible).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (!userMarkerRef.current) {
      const el = document.createElement('div');
      el.setAttribute('role', 'img');
      el.setAttribute('aria-label', 'Toi');
      el.style.pointerEvents = 'none';
      userMarkerRef.current = new Marker({ element: el, anchor: 'center' });
    }
    const el = userMarkerRef.current.getElement();
    el.style.cssText = `pointer-events:none;width:22px;height:22px;box-sizing:border-box;border-radius:50%;background:${day ? NIGHT.night : NIGHT.shell};border:3.5px solid ${day ? '#FFFFFF' : NIGHT.night};box-shadow:0 1px 5px rgba(11,26,69,0.45);`;
    userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]).addTo(map);
  }, [userLocation, mapReady, day]);

  // Pastilles « nom · heure » : point plein = soleil, point creux = ombre. 5 à
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

    // « Toi » réserve sa place.
    const you = map.project([userLocation.lng, userLocation.lat]);
    const placed: { x0: number; y0: number; x1: number; y1: number }[] = [
      { x0: you.x - 17, y0: you.y - 17, x1: you.x + 17, y1: you.y + 17 },
    ];
    const overlaps = (b: { x0: number; y0: number; x1: number; y1: number }) =>
      placed.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
    let quiet = 0;
    const loudAvailable = candidates.filter((c) => c.label?.inIt).length;
    const inWord = mode === 'SUN' ? 'au soleil' : "à l'ombre";
    const alt = sunPos.elevation;

    const ink = day ? NIGHT.night : NIGHT.shell;
    const dotSun = { fill: LIGHT.glow, stroke: LIGHT.inkDay };
    const dotShade = day ? { fill: '#FFFFFF', stroke: '#7A88A8' } : { fill: NIGHT.night, stroke: NIGHT.dim };
    const tagStyle = day
      ? 'background:#FFFFFF;border:1px solid #C5D4EE;box-shadow:0 1px 4px rgba(11,26,69,0.18);'
      : 'background:rgba(8,20,58,0.92);border:1px solid #233B7C;';

    for (const { venue: v, rec, label, px: p } of candidates) {
      if (markersRef.current.length >= MAX_PILLS) break;
      const isSelected = v.id === selectedVenueId;
      const name = label?.name ?? v.name;
      const loud = !!label?.inIt;
      if (!loud && !isSelected && loudAvailable >= 3 && quiet >= MAX_QUIET_WITH_LOUD) continue;

      // L'heure : la fin de la fenêtre si on y est ; sinon « dès 08:00 » (la
      // nuit, chaque lieu dit quand le soleil revient, demain compris) ou « ombre ».
      const soon = !loud && rec?.sunArrivesInMin != null && (!day || !rec.arrivesTomorrow) ? rec.sunWindowStart : null;
      const time = loud ? label?.time ?? null : soon ? `dès ${soon}` : mode === 'SUN' ? 'ombre' : 'soleil';
      const sunHour = mode === 'SUN' && (loud || !!soon);
      const lit = alt > LIT_MIN_ALT && (rec?.sunPercentage ?? 0) >= LIT_PCT;

      // Étiquette à droite du rond, sinon à gauche, sinon au-dessus.
      const w = name.length * 7.4 + (time ? time.length * 7.6 + 12 : 0) + 20;
      const h = 26;
      const g = GLYPH_PX / 2;
      const glyphBox = { x0: p.x - g, y0: p.y - g, x1: p.x + g, y1: p.y + g };
      const spots = [
        { side: 'right', x0: p.x + g + 2, y0: p.y - h / 2 },
        { side: 'left', x0: p.x - g - 2 - w, y0: p.y - h / 2 },
        { side: 'top', x0: p.x - w / 2, y0: p.y - g - 4 - h },
      ] as const;
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
      const dot = document.createElement('span');
      const d = isSelected ? 20 : 16;
      const dc = lit ? dotSun : dotShade;
      dot.style.cssText = `position:absolute;left:${(HIT_PX - d) / 2}px;top:${(HIT_PX - d) / 2}px;width:${d}px;height:${d}px;box-sizing:border-box;border-radius:50%;background:${dc.fill};border:2.5px solid ${dc.stroke};${isSelected ? `box-shadow:0 0 0 3px ${ink};` : ''}`;
      el.append(dot);
      if (spot) {
        const tag = document.createElement('span');
        const dx = spot.x0 - (p.x - HIT_PX / 2);
        const dy = spot.y0 - (p.y - HIT_PX / 2);
        tag.style.cssText = `position:absolute;left:${dx}px;top:${dy}px;height:${h}px;box-sizing:border-box;display:flex;align-items:center;gap:5px;padding:0 9px;border-radius:9px;${tagStyle}color:${ink};font:600 12.5px Geist,sans-serif;white-space:nowrap;pointer-events:none;`;
        tag.append(document.createTextNode(name));
        if (live) {
          // La jauge suit la grammaire halo : pleine = des places, à moitié =
          // presque plein, vide = complet.
          const gl = document.createElement('span');
          gl.style.cssText = 'display:inline-flex;flex:none;';
          gl.innerHTML = liveGlyphSvg(live.level, 12, day ? 'day' : 'night');
          tag.append(gl);
        }
        if (time) {
          const dotSep = document.createElement('span');
          dotSep.textContent = '·';
          dotSep.style.cssText = `color:${day ? '#7A88A8' : NIGHT.dim};`;
          const t = document.createElement('span');
          t.textContent = time;
          const timeColor = sunHour ? (day ? LIGHT.inkDay : LIGHT.inkNight) : day ? DAY.sub : NIGHT.sub;
          t.style.cssText = `font:700 12px 'Geist Mono',monospace;color:${timeColor};`;
          tag.append(dotSep, t);
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
  }, [venues, recommendations, mode, selectedVenueId, mapReady, onVenueSelect, mapZoom, mapCenter, insets, userLocation, sunPos, liveVersion, day]);

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
      <div ref={containerRef} className="absolute inset-0" style={{ background: day ? MAP_COLORS.ground[0] : MAP_COLORS.ground[1] }} />
      {mapError && (
        <p role="alert" className="absolute inset-x-4 top-20 z-10 rounded-2xl bg-dusk-panel px-4 py-3 text-[13px] text-dusk-shell">
          La carte n'a pas pu se charger ({mapError}).
        </p>
      )}

      {/* Toi hors de l'écran : un bouton. */}
      {youOff && onRecenter && (
        <button
          type="button"
          onClick={onRecenter}
          className={`absolute right-4 top-[calc(env(safe-area-inset-top)+12px)] z-20 flex min-h-11 items-center gap-2 rounded-full border pl-2.5 pr-4 text-[13px] font-bold active:scale-95 transition-transform motion-reduce:transition-none ${
            day ? 'border-day-line bg-white text-dusk-night shadow-[0_1px_6px_rgba(11,26,69,0.2)]' : 'border-dusk-line bg-dusk-deep text-dusk-shell'
          }`}
        >
          <HaloIcon kind="you" tone={day ? 'day' : 'night'} size={22} />
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
