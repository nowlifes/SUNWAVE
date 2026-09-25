import { useState, useMemo, useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import type { Venue, SunMode, VenueCategory, GeoPoint, WeatherData, Recommendation } from '@/types';
import { MapView, type ProbeView } from './MapView';
import { TimeSlider } from './TimeSlider';
import { DayRibbon } from './DayRibbon';
import { SearchBar } from './SearchBar';
import { PlaceDetailSheet } from './PlaceDetailSheet';
import { LiveQuestion } from './LiveQuestion';
import { NotificationPrompt } from './NotificationPrompt';
import { useNotificationPrompt } from '@/hooks/useNotifications';
import { liveThanks } from '@/utils/live';
import type { LiveAnswer } from '@/services/LiveReportService';
import { liveReports } from '@/services/LiveReportService';
import { isDaylight } from '@/utils/live';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { VenueSunService } from '@/services/VenueSunService';
import { WeatherService } from '@/services/WeatherService';
import { SunService } from '@/services/SunService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonMinutesOfDay, lisbonParts } from '@/utils/lisbonTime';
import { ribbonCells } from '@/utils/ribbon';
import { categoryLabel, statusCopy, travelLabel } from '@/utils/copy';
import { CLAIR } from '@/utils/mapFlags';
import {
  betterNeighbour,
  cityLightCurve,
  hereSentence,
  hereWindow,
  hintForVisit,
  nextVisit,
  pickHeadline,
  sheetHeadlines,
  shortVenueName,
} from '@/utils/mapGuide';

interface MapScreenProps {
  mode: SunMode;
  currentDate: Date;
  userLocation: GeoPoint;
  locationGranted: boolean;
  selectedVenueId: string | null;
  onVenueSelect: (venueId: string | null) => void;
  onTimeChange: (date: Date) => void;
  onModeChange: (mode: SunMode) => void;
  onGetDirections: (venueId: string) => void;
  onRecenter: () => void;
  mapCenter: GeoPoint;
  mapZoom: number;
  onMapCenterChange: (center: GeoPoint) => void;
  onZoomChange: (zoom: number) => void;
  onSave: (venueId: string) => void;
  savedVenueIds: string[];
}

const FILTER_CATEGORIES: { value: VenueCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'Tout' },
  { value: 'cafe', label: 'Cafés' },
  { value: 'bar', label: 'Bars' },
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'park', label: 'Parcs' },
  { value: 'beach', label: 'Plages' },
  { value: 'rooftop', label: 'Rooftops' },
];

/** « À pied », pour la feuille : un quart d'heure de marche. */
const NEAR_WALK_MIN = 15;
/** Marge du haut (encoche) : ni pastille ni cadrage dessous. Plus d'en-tête :
 *  à l'arrivée la carte ne montre que ses pastilles, toi et la feuille. */
const TOP_INSET = 24;
/** Hauteur de la barre d'onglets (BottomNav), sous la feuille. */
const NAV_HEIGHT = 62;

const STORAGE = { visits: 'sun_map_visits', headline: 'sun_map_last_headline' };

/** Le stockage peut manquer (navigation privée, quota) : l'astuce et la
 *  variété du titre sont du confort, pas une information — sans stockage,
 *  on s'en passe sans bruit plutôt que d'afficher une erreur. */
function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // voir readStorage
  }
}

const inIt = (r: Recommendation) => r.sunLeavesInMin !== null;

export function MapScreen({
  mode,
  currentDate,
  userLocation,
  locationGranted,
  selectedVenueId,
  onVenueSelect,
  onTimeChange,
  onModeChange,
  onGetDirections,
  onRecenter,
  mapCenter,
  mapZoom,
  onMapCenterChange,
  onZoomChange,
  onSave,
  savedVenueIds,
}: MapScreenProps) {
  const [activeFilter, setActiveFilter] = useState<VenueCategory | 'all'>('all');
  /** Feuille tirée : 3 lieux, recherche, filtres. Repliée par défaut. */
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  const [probePoint, setProbePoint] = useState<GeoPoint | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [searchVenue, setSearchVenue] = useState<Venue | null>(null);

  // « Il reste des places ? » : posée seulement à qui est vraiment sur place
  // (position réelle, à moins de 100 m), une fois par lieu tant qu'on n'a pas
  // répondu ou dit « pas maintenant ».
  useSyncExternalStore(
    (cb) => liveReports.subscribe(cb),
    () => liveReports.getVersion()
  );
  const [dismissedLiveId, setDismissedLiveId] = useState<string | null>(null);
  // Après le tap : la carte reste 3 s avec ce que la réponse a produit.
  const [justAnswered, setJustAnswered] = useState<{ venue: Venue; answer: LiveAnswer; thanks: string; total: number } | null>(null);
  // Fin du sticker de remerciement = première réponse donnée : c'est là, et
  // seulement là, qu'on propose la notification golden hour.
  const notif = useNotificationPrompt();
  const armNotif = notif.arm;
  const closeThanks = useCallback(() => {
    setJustAnswered(null);
    armNotif();
  }, [armNotif]);
  const hereVenue = useMemo(
    () =>
      locationGranted
        ? VenueService.getAllVenues().find((v) => liveReports.isInZone(v, userLocation)) ?? null
        : null,
    [locationGranted, userLocation]
  );
  const askLive =
    hereVenue && isDaylight(new Date()) && dismissedLiveId !== hereVenue.id && !liveReports.hasAnswered(hereVenue.id) ? hereVenue : null;
  // Non-visual: source real weather from Open-Meteo via WeatherService instead
  // of a static computed value — synchronous cache read on mount, then a real
  // fetch (+ periodic refresh) updates it in the background. See
  // WeatherService.ts for the stale-while-revalidate design.
  const [weather, setWeather] = useState<WeatherData>(() => WeatherService.getCurrentWeather());
  useEffect(() => {
    let cancelled = false;
    const refresh = () => WeatherService.refreshWeather().then((w) => { if (!cancelled) setWeather(w); });
    refresh();
    const interval = setInterval(refresh, 10 * 60 * 1000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // --- Astuce : une phrase, deux visites, disparaît au premier geste.
  const [visit] = useState(() => nextVisit(readStorage(STORAGE.visits)));
  useEffect(() => writeStorage(STORAGE.visits, String(visit)), [visit]);
  const [hintDone, setHintDone] = useState(false);
  const hint = hintDone ? null : hintForVisit(visit, mode);
  const gesture = useCallback(() => setHintDone(true), []);

  const categories = useMemo(() => (activeFilter === 'all' ? [] : [activeFilter]), [activeFilter]);

  // Tous les lieux, évalués depuis soi : la carte choisit elle-même lesquels
  // montrer selon la vue (voir MapView).
  const recommendations = useMemo(
    () => RecommendationService.getRecommendations(mode, userLocation, currentDate, categories, weather, Number.POSITIVE_INFINITY),
    [mode, userLocation, currentDate, categories, weather]
  );

  const venues = useMemo(() => {
    const all = VenueService.getVenuesByCategory(categories);
    if (searchVenue) return all.filter((v) => v.id === searchVenue.id);
    return all;
  }, [categories, searchVenue]);

  // La réponse de la feuille : ouverts, à pied, dans ce qu'on cherche.
  const answer = useMemo(
    () => RecommendationService.getAnswerList(mode, userLocation, currentDate, categories, weather, 50),
    [mode, userLocation, currentDate, categories, weather]
  );
  const nearInIt = useMemo(() => answer.filter((r) => r.walkTimeMin <= NEAR_WALK_MIN && inIt(r)), [answer]);
  const rows = (nearInIt.length > 0 ? nearInIt : answer).slice(0, 3);
  const best = rows[0] ?? null;

  const nowMin = lisbonMinutesOfDay(currentDate);
  const sunrise = useMemo(() => SunService.getSunrise(currentDate), [currentDate]);
  const sunset = useMemo(() => SunService.getSunset(currentDate), [currentDate]);
  const sunriseMin = lisbonMinutesOfDay(sunrise);
  const sunsetMin = lisbonMinutesOfDay(sunset);
  const isNow = Math.abs(currentDate.getTime() - Date.now()) < 90000;

  // --- Titre : suit le contexte, ne redit pas la même accroche d'affilée
  // (ni d'une visite à l'autre).
  const candidates = useMemo(
    () => sheetHeadlines({ mode, count: nearInIt.length, nowMin, sunriseMin, sunsetMin, isNow }),
    [mode, nearInIt.length, nowMin, sunriseMin, sunsetMin, isNow]
  );
  const candidatesKey = candidates.join('|');
  const [headline, setHeadline] = useState(() => pickHeadline(candidates, readStorage(STORAGE.headline)));
  const headlineKeyRef = useRef(candidatesKey);
  useEffect(() => {
    if (headlineKeyRef.current === candidatesKey) return;
    headlineKeyRef.current = candidatesKey;
    setHeadline((prev) => pickHeadline(candidatesKey.split('|'), prev));
  }, [candidatesKey]);
  useEffect(() => writeStorage(STORAGE.headline, headline), [headline]);

  // --- La bande de lumière du quartier (lieux à un quart d'heure).
  const day = lisbonParts(currentDate);
  const dayKey = `${day.year}-${day.month}-${day.day}`;
  const nearVenueIds = useMemo(
    () => recommendations.filter((r) => r.walkTimeMin <= NEAR_WALK_MIN).map((r) => r.venue.id).join(','),
    [recommendations]
  );
  const cells = useMemo(() => {
    void dayKey;
    const curves = nearVenueIds
      .split(',')
      .map((id) => VenueService.getVenueById(id))
      .filter((v): v is Venue => v !== undefined)
      .map((v) => VenueSunService.getSunExposureByQuarter(v, lisbonBuildings, currentDate));
    return ribbonCells(cityLightCurve(curves, mode), mode, sunriseMin, sunsetMin);
    // currentDate : seul son jour compte (dayKey), pas sa minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearVenueIds, dayKey, mode, sunriseMin, sunsetMin]);

  // --- « Ici » : l'endroit touché.
  const probe = useMemo<ProbeView | null>(() => {
    if (!probePoint) return null;
    try {
      const curve = VenueSunService.getPointSunByQuarter(probePoint, lisbonBuildings, currentDate);
      const w = hereWindow(curve, mode, nowMin, sunriseMin, sunsetMin);
      const { lead, time } = hereSentence(w, mode);
      const fromHere = RecommendationService.getRecommendations(mode, probePoint, currentDate, categories, weather, Number.POSITIVE_INFINITY);
      const n = betterNeighbour(fromHere, w, nowMin);
      return {
        point: probePoint,
        lead,
        time,
        error: null,
        mode,
        neighbour: n && {
          id: n.venue.id,
          name: shortVenueName(n.venue.name),
          time: n.sunWindowEnd,
          walkMin: n.walkTimeMin,
          point: { lat: n.venue.latitude, lng: n.venue.longitude },
        },
      };
    } catch (e) {
      return {
        point: probePoint,
        lead: '',
        time: null,
        error: `Impossible de calculer le soleil ici : ${e instanceof Error ? e.message : String(e)}`,
        mode,
        neighbour: null,
      };
    }
  }, [probePoint, currentDate, mode, nowMin, sunriseMin, sunsetMin, categories, weather]);

  const selectedRec = useMemo(() => {
    if (!selectedVenueId) return null;
    const found = recommendations.find((r) => r.venue.id === selectedVenueId);
    if (found) return found;
    const venue = VenueService.getVenueById(selectedVenueId);
    return venue ? RecommendationService.getRecommendationFor(venue, mode, userLocation, currentDate, weather) : null;
  }, [selectedVenueId, recommendations, mode, userLocation, currentDate, weather]);

  // --- Une seule couche à la fois : carte du lieu, OU bulle, OU feuille.
  const handleVenueSelect = useCallback(
    (id: string | null) => {
      setProbePoint(null);
      setSheetOpen(false);
      gesture();
      onVenueSelect(id);
    },
    [onVenueSelect, gesture]
  );
  const handleMapTap = useCallback(
    (point: GeoPoint) => {
      gesture();
      setSheetOpen(false);
      setDetailOpen(false);
      if (selectedVenueId) onVenueSelect(null);
      setProbePoint(point);
    },
    [gesture, selectedVenueId, onVenueSelect]
  );
  const handleUserMove = useCallback(() => {
    gesture();
    setSheetOpen(false);
  }, [gesture]);
  const handleScrubStart = useCallback(() => {
    gesture();
    setSheetOpen(false);
    setScrubbing(true);
  }, [gesture]);
  const handleScrubEnd = useCallback(() => setScrubbing(false), []);
  const handleSearchSelect = useCallback(
    (venue: Venue) => {
      setSearchVenue(venue);
      handleVenueSelect(venue.id);
    },
    [handleVenueSelect]
  );

  // --- La feuille : glisser vers le haut l'ouvre, vers le bas la replie.
  // Position de départ lue dans les gestionnaires : une ref.
  const dragStartY = useRef<number | null>(null);
  const onHandleDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current = e.clientY;
  }, []);
  const onHandleUp = useCallback(
    (e: React.PointerEvent) => {
      if (dragStartY.current === null) return;
      const dy = e.clientY - dragStartY.current;
      dragStartY.current = null;
      // Un simple toucher passe par le clic du titre (clavier compris).
      if (Math.abs(dy) <= 24) return;
      gesture();
      setSheetOpen(dy < 0);
    },
    [gesture]
  );

  // Ce que la feuille cache, pour que la carte ne mette rien dessous.
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState(240);
  useEffect(() => {
    const el = panelRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setPanelHeight(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const insets = useMemo(() => ({ top: TOP_INSET, bottom: panelHeight + NAV_HEIGHT }), [panelHeight]);

  const layer = selectedRec ? 'place' : probePoint ? 'probe' : 'list';
  const quietPanel = scrubbing || layer === 'probe';

  return (
    <div className="relative h-full w-full bg-dusk-night">
      <MapView
        venues={venues}
        recommendations={recommendations}
        mode={mode}
        currentDate={currentDate}
        userLocation={userLocation}
        mapCenter={mapCenter}
        mapZoom={mapZoom}
        selectedVenueId={selectedVenueId}
        onVenueSelect={handleVenueSelect}
        onMapCenterChange={onMapCenterChange}
        onZoomChange={onZoomChange}
        onMapTap={handleMapTap}
        onUserMove={handleUserMove}
        probe={probe}
        onProbeClose={() => setProbePoint(null)}
        insets={insets}
        scrubbing={scrubbing}
        onRecenter={onRecenter}
      />

      {/* « Il reste des places ? » : une couche flottante, jamais par-dessus une
          autre (lieu choisi, bulle « ici », feuille tirée, glissement d'heure). */}
      {askLive && !detailOpen && layer === 'list' && !sheetOpen && !scrubbing && (
        <LiveQuestion
          venue={askLive}
          mode={mode}
          onAnswer={(answer) => {
            if (!liveReports.submit(askLive, answer, userLocation)) return;
            const agreement = liveReports.getAgreement(askLive.id);
            setJustAnswered({ venue: askLive, answer, thanks: liveThanks(agreement), total: agreement?.total ?? 1 });
          }}
          onDismiss={() => setDismissedLiveId(askLive.id)}
        />
      )}
      {justAnswered && !askLive && (
        <LiveQuestion
          venue={justAnswered.venue}
          mode={mode}
          onAnswer={closeThanks}
          onDismiss={closeThanks}
          answered={justAnswered}
          onDone={closeThanks}
        />
      )}

      {notif.visible && !justAnswered && !askLive && (
        <NotificationPrompt phase={notif.phase} error={notif.error} onAccept={notif.accept} onDecline={notif.decline} />
      )}

      {/* En bas, à portée du pouce : la feuille, puis le curseur d'heure. */}
      <div className="absolute inset-x-0 bottom-0 z-20" style={{ paddingBottom: NAV_HEIGHT }}>
        <div
          ref={panelRef}
          className={`rounded-t-[28px] border-t border-dusk-line bg-dusk-night pb-2 text-dusk-shell shadow-[0_-8px_24px_rgba(8,20,58,0.45)]${CLAIR ? ' clair-sheet' : ''}`}
        >
          {layer === 'place' && selectedRec ? (
            <PlaceCard
              rec={selectedRec}
              mode={mode}
              isNow={isNow}
              onClose={() => handleVenueSelect(null)}
              onGo={() => onGetDirections(selectedRec.venue.id)}
              onDetail={() => setDetailOpen(true)}
            />
          ) : (
            <>
              <div
                className="cursor-grab touch-none select-none px-4 pt-2"
                onPointerDown={onHandleDown}
                onPointerUp={onHandleUp}
                onPointerCancel={() => { dragStartY.current = null; }}
              >
                <div className="mx-auto h-1 w-10 rounded-full bg-dusk-edge" aria-hidden="true" />
                <div className="flex min-h-11 items-center justify-between gap-3">
                  <button
                    className="min-h-11 min-w-0 flex-1 text-left"
                    aria-expanded={sheetOpen}
                    onClick={() => { gesture(); setSheetOpen((o) => !o); }}
                  >
                    <h2 className="truncate font-display text-[19px] font-bold leading-tight [font-stretch:90%]">{headline}</h2>
                  </button>
                  {sheetOpen && (
                  <button
                    onPointerDown={(e) => e.stopPropagation()}
                    onPointerUp={(e) => e.stopPropagation()}
                    onClick={onRecenter}
                    aria-label="Me recentrer"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dusk-edge text-dusk-shell active:scale-95 transition-transform motion-reduce:transition-none"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="4" />
                      <line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="2" y1="12" x2="6" y2="12" /><line x1="18" y1="12" x2="22" y2="12" />
                    </svg>
                  </button>
                  )}
                </div>
              </div>

              {!quietPanel && (
                <div className="px-4">
                  {!sheetOpen && best && (
                    <BestRow rec={best} mode={mode} onOpen={() => handleVenueSelect(best.venue.id)} onGo={() => onGetDirections(best.venue.id)} />
                  )}
                  {sheetOpen && (
                    <>
                      <ul className="divide-y divide-dusk-line">
                        {rows.map((r) => (
                          <li key={r.venue.id}>
                            <button
                              onClick={() => handleVenueSelect(r.venue.id)}
                              className="flex min-h-14 w-full items-center gap-3 py-2 text-left active:opacity-70"
                            >
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[15px] font-semibold">{r.venue.name}</span>
                                <span className="block truncate text-[12.5px] text-dusk-sub">
                                  {categoryLabel(r.venue.category)} · {travelLabel(r)}
                                </span>
                              </span>
                              <span className="flex shrink-0 flex-col items-end gap-1.5">
                                <span className={`font-mono text-[13px] font-semibold ${mode === 'SUN' ? 'text-dusk-glow' : 'text-dusk-sub'}`}>
                                  {inIt(r) ? r.sunWindowEnd : r.sunWindowStart ? `dès ${r.sunWindowStart}` : ''}
                                </span>
                                <DayRibbon venue={r.venue} mode={mode} date={currentDate} sunrise={sunrise} sunset={sunset} size="mini" tone="night" />
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2">
                        <SearchBar tone="night" placeholder="Chercher un lieu" onSelectVenue={handleSearchSelect} />
                      </div>
                      <div className="no-scrollbar -mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4">
                        {FILTER_CATEGORIES.map((cat) => (
                          <button
                            key={cat.value}
                            onClick={() => { setActiveFilter(cat.value); setSearchVenue(null); }}
                            aria-pressed={activeFilter === cat.value}
                            className={`min-h-11 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold ${
                              activeFilter === cat.value ? 'bg-dusk-shell text-dusk-night' : 'border border-dusk-line text-dusk-sub'
                            }`}
                          >
                            {cat.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          <TimeSlider
            mode={mode}
            currentDate={currentDate}
            onTimeChange={onTimeChange}
            cells={cells}
            onScrubStart={handleScrubStart}
            onScrubEnd={handleScrubEnd}
            trailing={<ModeToggle mode={mode} onModeChange={onModeChange} />}
            expanded={sheetOpen}
            hint={hint}
          />
        </div>
      </div>

      {detailOpen && selectedRec && (
        <PlaceDetailSheet
          venue={selectedRec.venue}
          mode={mode}
          recommendation={selectedRec}
          userLocation={userLocation}
          currentDate={currentDate}
          isSaved={savedVenueIds.includes(selectedRec.venue.id)}
          onSave={() => onSave(selectedRec.venue.id)}
          onClose={() => setDetailOpen(false)}
          onGetDirections={() => onGetDirections(selectedRec.venue.id)}
        />
      )}
    </div>
  );
}

function ModeToggle({ mode, onModeChange }: { mode: SunMode; onModeChange: (m: SunMode) => void }) {
  return (
    <div className="flex shrink-0 rounded-full border border-dusk-line bg-dusk-panel p-0.5" role="group" aria-label="Chercher">
      {(['SUN', 'SHADE'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onModeChange(m)}
          aria-pressed={mode === m}
          className={`min-h-10 rounded-full px-3 text-[13px] font-bold min-[360px]:px-3.5 transition-colors duration-300 motion-reduce:transition-none ${
            mode === m ? (m === 'SUN' ? 'bg-dusk-fire text-dusk-night' : 'bg-dusk-sub text-dusk-night') : 'text-dusk-sub'
          }`}
        >
          {m === 'SUN' ? 'Soleil' : 'Ombre'}
        </button>
      ))}
    </div>
  );
}

/** « Au soleil jusqu'à 19:24 », ou la phrase de statut habituelle. */
function StatusLine({ rec, mode, isNow, lead = false }: { rec: Recommendation; mode: SunMode; isNow: boolean; lead?: boolean }) {
  const accent = mode === 'SUN' ? 'text-dusk-glow' : 'text-dusk-sub';
  const cap = (t: string) => (lead ? t.charAt(0).toUpperCase() + t.slice(1) : t.charAt(0).toLowerCase() + t.slice(1));
  if (inIt(rec) && rec.sunWindowEnd) {
    return (
      <>
        {cap(`${isNow ? '' : 'à cette heure, '}${mode === 'SUN' ? 'au soleil' : "à l'ombre"} jusqu'à`)}{' '}
        <span className={`font-mono font-semibold ${accent}`}>{rec.sunWindowEnd}</span>
      </>
    );
  }
  return <>{cap(statusCopy(rec, mode).title)}</>;
}

function BestRow({ rec, mode, onOpen, onGo }: { rec: Recommendation; mode: SunMode; onOpen: () => void; onGo: () => void }) {
  return (
    <div className="flex items-center gap-3 pb-1">
      <button onClick={onOpen} className="min-h-12 min-w-0 flex-1 text-left active:opacity-70">
        <span className="block truncate text-[16px] font-semibold">{rec.venue.name}</span>
        <span className="line-clamp-2 block text-[13px] leading-snug text-dusk-sub">
          {travelLabel(rec)} · <StatusLine rec={rec} mode={mode} isNow />
        </span>
      </button>
      <button
        onClick={onGo}
        className={`min-h-11 shrink-0 rounded-full px-5 text-[15px] font-bold text-dusk-night active:scale-[0.97] transition-transform motion-reduce:transition-none ${
          mode === 'SUN' ? 'bg-dusk-fire' : 'bg-dusk-sub'
        }`}
      >
        Y aller
      </button>
    </div>
  );
}

function PlaceCard({
  rec,
  mode,
  isNow,
  onClose,
  onGo,
  onDetail,
}: {
  rec: Recommendation;
  mode: SunMode;
  isNow: boolean;
  onClose: () => void;
  onGo: () => void;
  onDetail: () => void;
}) {
  return (
    <div className="px-4 pt-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[21px] font-bold leading-tight [font-stretch:90%] [text-wrap:balance]">{rec.venue.name}</h2>
          <p className="mt-0.5 text-[13.5px] leading-snug text-dusk-sub">
            <span className="text-dusk-shell">
              <StatusLine rec={rec} mode={mode} isNow={isNow} lead />
            </span>{' '}
            · {travelLabel(rec)}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-label="Fermer"
          className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dusk-edge text-dusk-sub active:scale-95 transition-transform motion-reduce:transition-none"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
      <div className="mt-3 flex gap-2.5">
        <button
          onClick={onGo}
          className={`min-h-12 flex-1 rounded-full text-[16px] font-bold text-dusk-night active:scale-[0.98] transition-transform motion-reduce:transition-none ${
            mode === 'SUN' ? 'bg-dusk-fire' : 'bg-dusk-sub'
          }`}
        >
          Y aller
        </button>
        <button
          onClick={onDetail}
          className="min-h-12 flex-1 rounded-full border border-dusk-edge text-[15px] font-semibold active:scale-[0.98] transition-transform motion-reduce:transition-none"
        >
          Voir la fiche
        </button>
      </div>
    </div>
  );
}
