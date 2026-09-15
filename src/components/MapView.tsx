import { useRef, useEffect, useState, useMemo } from 'react';
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
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
import { ShadowService } from '@/services/ShadowService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonHour } from '@/utils/lisbonTime';

setWorkerUrl(maplibreWorkerUrl);

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
  onRecenter: () => void;
  showUserLocation: boolean;
  locationGranted: boolean;
}

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
      tiles: cartoTiles('voyager_nolabels'),
      tileSize: 256,
      attribution: '&copy; OSM &copy; CARTO',
    },
    labels: {
      type: 'raster',
      tiles: cartoTiles('voyager_only_labels'),
      tileSize: 256,
    },
  },
  layers: [
    { id: 'base', type: 'raster', source: 'base', paint: { 'raster-opacity': 0.92 } },
    { id: 'labels', type: 'raster', source: 'labels', paint: { 'raster-opacity': 0.7 }, minzoom: 13 },
  ],
};

const OVERLAY_BOUNDS: [number, number][] = [
  [-9.35, 38.78], [-9.35, 38.62], [-8.95, 38.62], [-8.95, 38.78], [-9.35, 38.78],
];

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
  onRecenter,
  showUserLocation,
  locationGranted,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

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
    map.on('load', () => setMapReady(true));
    map.on('moveend', () => {
      const c = map.getCenter();
      onMapCenterChange({ lat: c.lat, lng: c.lng });
      onZoomChange(map.getZoom());
    });
    mapRef.current = map;
    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current = [];
      if (userMarkerRef.current) { userMarkerRef.current.remove(); userMarkerRef.current = null; }
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
    if (dist > 0.001) {
      map.flyTo({ center: [mapCenter.lng, mapCenter.lat], zoom: mapZoom, duration: 400, essential: true });
    } else if (Math.abs(map.getZoom() - mapZoom) > 0.5) {
      map.flyTo({ zoom: mapZoom, duration: 300, essential: true });
    }
  }, [mapCenter, mapZoom, mapReady]);

  const sunPos = useMemo(
    () => SunService.getSunPosition(currentDate, mapCenter.lat, mapCenter.lng),
    [currentDate, mapCenter]
  );
  const isDaytime = sunPos.elevation > 0;

  // Global tint overlay + directional building shadows
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;

    // Remove old layers/sources
    if (map.getLayer('sun-overlay')) map.removeLayer('sun-overlay');
    if (map.getSource('sun-overlay')) map.removeSource('sun-overlay');
    if (map.getLayer('building-shadows')) map.removeLayer('building-shadows');
    if (map.getSource('building-shadows')) map.removeSource('building-shadows');

    // Global warm/cool tint
    const overlayColor = mode === 'SUN' && isDaytime ? '#FBBF24' : mode === 'SHADE' ? '#64748B' : 'transparent';
    const overlayOpacity = mode === 'SUN' && isDaytime ? 0.08 : mode === 'SHADE' ? 0.07 : 0;

    if (overlayOpacity > 0) {
      map.addSource('sun-overlay', {
        type: 'geojson',
        data: { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [OVERLAY_BOUNDS] } },
      });
      map.addLayer({
        id: 'sun-overlay',
        type: 'fill',
        source: 'sun-overlay',
        paint: { 'fill-color': overlayColor, 'fill-opacity': overlayOpacity },
      });
    }

    // Directional building shadow polygons
    if (isDaytime && sunPos.elevation > 1) {
      const shadowFeatures = lisbonBuildings.map((building) => {
        const proj = ShadowService.projectBuildingShadow(building, currentDate, mapCenter.lat, mapCenter.lng);
        const coords = proj.shadowPoints.map((p) => [p.lng, p.lat]);
        coords.push(coords[0]);
        return {
          type: 'Feature' as const,
          properties: {},
          geometry: { type: 'Polygon' as const, coordinates: [coords] },
        };
      });

      map.addSource('building-shadows', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: shadowFeatures },
      });
      map.addLayer({
        id: 'building-shadows',
        type: 'fill',
        source: 'building-shadows',
        // Les ombres viennent maintenant du vrai moteur physique (bâtiments OSM
        // réels + SunService corrigé). À 0.08 elles étaient invisibles, ce qui
        // rendait le calcul inutile à l'écran. Direction validée (composition 1) :
        // l'ombre EST la réponse, donc elle doit se lire sans légende.
        paint: { 'fill-color': '#2B3A4D', 'fill-opacity': mode === 'SHADE' ? 0.5 : 0.4 },
      });
    }
  }, [mode, isDaytime, mapReady, sunPos, currentDate, mapCenter]);

  // Venue markers — smaller, fewer, cleaner hierarchy
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;
    const map = mapRef.current;
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const hour = lisbonHour(currentDate);
    const topScore = recommendations.length > 0 ? recommendations[0].sunMatch : -1;
    const recMap = new Map(recommendations.map((r) => [r.venue.id, r]));

    const visibleVenues = venues
      .map((v) => ({ venue: v, rec: recMap.get(v.id), score: recMap.get(v.id)?.sunMatch ?? 0 }))
      // Selected venue always wins a spot regardless of score, so tapping a
      // marker never makes it vanish behind a higher-scoring neighbour on
      // the next render; everything else falls back to score order.
      .sort((a, b) => {
        if (a.venue.id === selectedVenueId) return -1;
        if (b.venue.id === selectedVenueId) return 1;
        return b.score - a.score;
      })
      .slice(0, 10);

    const borderColor = mode === 'SUN' ? '#F59E0B' : '#475569';
    const textColor = mode === 'SUN' ? '#D97706' : '#475569';

    // Declutter in screen space: at typical zoom, several venues a block
    // apart project to overlapping circles and their "N%" labels become
    // unreadable static. Greedily keep a marker only if its centre clears
    // every marker already placed (highest score / selected first), instead
    // of drawing all 10 on top of each other.
    const MIN_MARKER_GAP_PX = 40;
    const placedPx: { x: number; y: number }[] = [];
    // In full sun (or full shade) many venues tie for the exact top score —
    // this exemption is for THE single best-match badge shown in the sheet
    // below, not for every tied venue, so only the first one encountered
    // (highest in sort order) gets to skip the distance check.
    let topExemptionUsed = false;

    for (const { venue: v, rec } of visibleVenues) {
      const isSelected = v.id === selectedVenueId;
      const isTop = !topExemptionUsed && rec && rec.sunMatch === topScore && topScore > 0;
      if (isTop) topExemptionUsed = true;

      const screenPos = map.project([v.longitude, v.latitude]);
      if (!isSelected && !isTop) {
        const tooClose = placedPx.some(
          (p) => Math.hypot(p.x - screenPos.x, p.y - screenPos.y) < MIN_MARKER_GAP_PX
        );
        if (tooClose) continue;
      }
      placedPx.push({ x: screenPos.x, y: screenPos.y });

      const sunPct = v.sunExposureByHour[hour] || 0;
      const shadePct = v.shadeExposureByHour[hour] || 0;
      const displayPct = mode === 'SUN' ? sunPct : shadePct;

      const el = document.createElement('div');
      el.style.cursor = 'pointer';
      el.style.transition = 'transform 250ms cubic-bezier(0.22,1,0.36,1)';

      const size = isSelected ? 46 : isTop ? 44 : 32;
      const fontSize = isSelected ? 13 : isTop ? 12 : 10;
      const glow = isTop
        ? `box-shadow: 0 0 0 5px ${mode === 'SUN' ? 'rgba(251,191,36,0.25)' : 'rgba(100,116,139,0.25)'}, 0 2px 8px rgba(0,0,0,0.12);`
        : 'box-shadow: 0 1px 4px rgba(0,0,0,0.1);';

      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:white;border:2px solid ${borderColor};${glow}font-size:${fontSize}px;font-weight:700;color:${textColor};font-family:Inter,sans-serif;">${displayPct}%</div>`;

      el.addEventListener('click', (e) => { e.stopPropagation(); onVenueSelect(v.id); });

      markersRef.current.push(
        new Marker({ element: el, anchor: 'center' }).setLngLat([v.longitude, v.latitude]).addTo(map)
      );
    }
    // mapZoom: not read directly (map.project already reflects the live
    // zoom), but the declutter distances above are only valid for the zoom
    // they were computed at — without this dep the effect would keep the
    // pre-zoom layout until something else happened to re-run it.
  }, [venues, recommendations, mode, currentDate, selectedVenueId, mapReady, onVenueSelect, mapZoom]);

  // User location marker
  useEffect(() => {
    if (!mapRef.current || !mapReady || !showUserLocation) return;
    const map = mapRef.current;
    if (userMarkerRef.current) {
      userMarkerRef.current.setLngLat([userLocation.lng, userLocation.lat]);
    } else {
      const el = document.createElement('div');
      el.innerHTML = `<div style="position:relative;"><div style="position:absolute;top:-16px;left:-16px;width:32px;height:32px;border-radius:50%;background:rgba(59,130,246,0.18);animation:pulseGlow 2s ease-in-out infinite;"></div><div style="width:14px;height:14px;border-radius:50%;background:#3B82F6;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.2);"></div></div>`;
      userMarkerRef.current = new Marker({ element: el, anchor: 'center' })
        .setLngLat([userLocation.lng, userLocation.lat]).addTo(map);
    }
  }, [userLocation, showUserLocation, mapReady]);

  const sunRotate = isDaytime ? sunPos.azimuth : 0;

  return (
    <div className="relative w-full h-full overflow-hidden">
      <div ref={containerRef} className="absolute inset-0" style={{ background: '#F0EAE0' }} />

      {/* Sun direction indicator — subtle, rotates with time */}
      {isDaytime && (
        <div className="absolute top-1/2 left-1/2 z-10 pointer-events-none" style={{ transform: 'translate(-50%, -50%)' }}>
          <div style={{ transform: `rotate(${sunRotate}deg)` }} className="transition-transform duration-500 ease-out">
            <div style={{ transform: 'translate(0, -100px)' }} className="flex flex-col items-center opacity-25">
              <span className="text-base">☀</span>
              <svg width="1" height="24"><line x1="0" y1="0" x2="0" y2="24" stroke="#F59E0B" strokeWidth="2" strokeDasharray="3,3" /></svg>
            </div>
          </div>
        </div>
      )}

      {/* Center on me */}
      <button
        onClick={onRecenter}
        className="absolute right-3 bottom-3 w-11 h-11 rounded-full bg-white shadow-lg flex items-center justify-center active:scale-90 transition-transform z-20 border border-shade-200/60"
        aria-label="Center on me"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1E293B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
          <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
        </svg>
        {!locationGranted && (
          <span className="absolute -top-1 -right-1 w-3 h-3 bg-amber-500 rounded-full border-2 border-white" />
        )}
      </button>
    </div>
  );
}
