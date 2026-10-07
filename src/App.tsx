import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { SunMode, Venue, GeoPoint, ScreenName, DiscoverCategory } from '@/types';
import { LocationService } from '@/services/LocationService';
import { VenueService } from '@/services/VenueService';
import { WeatherService } from '@/services/WeatherService';
import { autoMode } from '@/utils/autoMode';
import { venueIdFromUrl } from '@/utils/share';

import { NowScreen } from '@/components/NowScreen';
import { MapScreen } from '@/components/MapScreen';
import { DiscoverScreen, DiscoverResults } from '@/components/DiscoverScreen';
import { SavedScreen } from '@/components/SavedScreen';
import { ProfileScreen } from '@/components/ProfileScreen';
import { BottomNav } from '@/components/BottomNav';
import { CLAIR } from '@/utils/mapFlags';
import { PlaceDetailSheet } from '@/components/PlaceDetailSheet';
import { CYCLE, circadian, themeColor } from '@/utils/circadian';

const LISBON_CENTER: GeoPoint = { lat: 38.7223, lng: -9.1393 };
const DEFAULT_ZOOM = 14;

const STORAGE_KEYS = {
  // Posé par l'ancien écran « Soleil ou ombre ? » : ceux qui l'ont vu ont choisi.
  onboarding: 'sun_onboarding_complete',
  modeChosen: 'sun_mode_chosen',
  mode: 'sun_mode',
  saved: 'sun_saved_venues',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return fallback;
}

function saveToStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

export default function App() {
  // Arrivé par une invitation (« ?lieu=… ») : la fiche du lieu s'ouvre tout
  // de suite, sans les écrans d'accueil — l'invité veut savoir où et jusqu'à
  // quand, pas découvrir l'app. Lu une fois, au montage.
  const [invitedVenueId] = useState(() => {
    const id = venueIdFromUrl(window.location.href);
    return id && VenueService.getVenueById(id) ? id : null;
  });
  // Pas de question au premier lancement : l'app ouvre sur la réponse, en
  // soleil ou en ombre selon la chaleur, jusqu'à ce que la personne choisisse.
  const [modeChosen, setModeChosen] = useState(
    () => loadFromStorage(STORAGE_KEYS.modeChosen, false) || loadFromStorage(STORAGE_KEYS.onboarding, false)
  );
  // La température qui a fait le choix — affichée tant qu'il n'est pas le sien.
  const [autoTemperature, setAutoTemperature] = useState<number | null>(null);
  // L'app ouvre sur la réponse, pas sur la carte : voir NowScreen.
  const [screen, setScreen] = useState<ScreenName>('now');
  const [dusk, setDusk] = useState(false);
  const [mode, setMode] = useState<SunMode>(() => loadFromStorage(STORAGE_KEYS.mode, 'SUN'));
  const [currentDate, setCurrentDate] = useState(new Date());
  const followNowRef = useRef(true);
  const [userLocation, setUserLocation] = useState<GeoPoint>(LISBON_CENTER);
  const [locationGranted, setLocationGranted] = useState(false);
  const [outsideLisbon, setOutsideLisbon] = useState(false);
  const [locationRequested, setLocationRequested] = useState(false);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(invitedVenueId);
  const [mapCenter, setMapCenter] = useState<GeoPoint>(LISBON_CENTER);
  const [mapZoom, setMapZoom] = useState(DEFAULT_ZOOM);
  const [savedVenueIds, setSavedVenueIds] = useState<string[]>(() =>
    // Un favori sur un doublon retiré passe au lieu gardé — sinon son cœur
    // resterait vide et on ne pourrait plus le retirer.
    [...new Set(loadFromStorage(STORAGE_KEYS.saved, [] as string[]).map((id) => VenueService.canonicalId(id)))]
  );
  const [discoverCategory, setDiscoverCategory] = useState<DiscoverCategory | null>(null);

  // Onglet caché : rien ne bat ni ne respire (voir .halo-pulse, index.css).
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => root.toggleAttribute('data-anim-paused', document.hidden);
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      root.removeAttribute('data-anim-paused');
    };
  }, []);

  // Cycle circadien : la barre du navigateur et la barre d'onglets prennent la
  // couleur de l'heure. Sans cycle (`?sanscycle`), on ne touche à rien.
  const cyc = useMemo(() => (CYCLE ? circadian(currentDate, mode) : null), [currentDate, mode]);
  useEffect(() => {
    if (!cyc) return;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = themeColor(cyc, mode);
  }, [cyc, mode]);

  // Persist state
  useEffect(() => saveToStorage(STORAGE_KEYS.mode, mode), [mode]);
  // Le lien a servi : un rechargement ne doit pas rouvrir la fiche.
  useEffect(() => {
    if (invitedVenueId) window.history.replaceState(null, '', window.location.pathname);
  }, [invitedVenueId]);
  useEffect(() => saveToStorage(STORAGE_KEYS.saved, savedVenueIds), [savedVenueIds]);

  // Pas pour un invité : l'invitation parle du soleil qu'on lui a promis.
  useEffect(() => {
    if (modeChosen || invitedVenueId) return;
    let cancelled = false;
    WeatherService.refreshWeather().then((w) => {
      if (cancelled || !WeatherService.isLive(w)) return;
      setMode(autoMode(w.temperature));
      setAutoTemperature(w.temperature);
    });
    return () => {
      cancelled = true;
    };
  }, [modeChosen, invitedVenueId]);

  // Position demandée dès l'ouverture : la réponse en dépend (temps de marche).
  useEffect(() => {
    if (!locationRequested) {
      setLocationRequested(true);
      LocationService.getCurrentLocation().then((loc) => {
        setUserLocation(loc.coords);
        setLocationGranted(loc.granted);
        setOutsideLisbon(loc.outsideLisbon);
        if (loc.granted) {
          setMapCenter(loc.coords);
        }
      });
    }
  }, [locationRequested]);

  // L'heure suit le vrai « maintenant » sur tous les écrans — le cycle
  // circadien en dépend partout — et se recale au retour au premier plan
  // (téléphone verrouillé une heure). Seule une heure choisie sur le curseur
  // reste en place.
  useEffect(() => {
    const tick = () => {
      if (followNowRef.current && !document.hidden) setCurrentDate(new Date());
    };
    const interval = setInterval(tick, 60000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const handleRecenter = useCallback(() => {
    LocationService.getCurrentLocation().then((loc) => {
      setUserLocation(loc.coords);
      setLocationGranted(loc.granted);
      setOutsideLisbon(loc.outsideLisbon);
      setMapCenter(loc.granted ? loc.coords : LISBON_CENTER);
      setMapZoom(15);
    });
  }, []);

  const handleVenueSelect = useCallback((venueId: string | null) => {
    setSelectedVenueId(venueId);
    if (venueId) {
      const venue = VenueService.getVenueById(venueId);
      if (venue) {
        setMapCenter({ lat: venue.latitude, lng: venue.longitude });
        // Assez près pour lire les rues, sans perdre les voisins de vue.
        setMapZoom((z) => Math.max(z, 15.5));
      }
    }
  }, []);

  const handleTimeChange = useCallback((date: Date) => {
    // Ramené à moins de 2 min de maintenant : on suit de nouveau l'heure.
    followNowRef.current = Math.abs(date.getTime() - Date.now()) < 120000;
    setCurrentDate(date);
  }, []);

  const handleModeChange = useCallback((newMode: SunMode) => {
    setMode(newMode);
    setModeChosen(true);
    setAutoTemperature(null);
    saveToStorage(STORAGE_KEYS.modeChosen, true);
  }, []);

  const handleGetDirections = useCallback((venueId: string) => {
    const venue = VenueService.getVenueById(venueId);
    if (venue) {
      const url = `https://www.google.com/maps/dir/?api=1&destination=${venue.latitude},${venue.longitude}`;
      window.open(url, '_blank');
    }
  }, []);

  const handleSave = useCallback((venueId: string) => {
    setSavedVenueIds((prev) => {
      if (prev.includes(venueId)) {
        return prev.filter((id) => id !== venueId);
      }
      return [...prev, venueId];
    });
  }, []);

  const handleCategorySelect = useCallback((category: DiscoverCategory) => {
    setDiscoverCategory(category);
  }, []);

  const handleScreenChange = useCallback((newScreen: ScreenName) => {
    setScreen(newScreen);
    setSelectedVenueId(null);
    if (newScreen !== 'discover') {
      setDiscoverCategory(null);
    }
  }, []);

  const savedVenues = useMemo(
    () => savedVenueIds.map((id) => VenueService.getVenueById(id)).filter((v): v is Venue => v !== undefined),
    [savedVenueIds]
  );

  const selectedVenue = useMemo(() => {
    if (!selectedVenueId) return null;
    return VenueService.getVenueById(selectedVenueId) || null;
  }, [selectedVenueId]);

  const locationLabel = useMemo(() => {
    if (locationGranted) return 'Ta position';
    return 'Lisbonne, Portugal';
  }, [locationGranted]);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-dusk-deep flex items-center justify-center">
      {/* Mobile container */}
      <div className="relative w-full h-full max-w-md mx-auto bg-day overflow-hidden shadow-2xl">
        {/* Screen routing */}
        {screen === 'now' && (
          <NowScreen
            mode={mode}
            currentDate={currentDate}
            userLocation={userLocation}
            locationGranted={locationGranted}
            outsideLisbon={outsideLisbon}
            autoTemperature={autoTemperature}
            onModeChange={handleModeChange}
            onVenueSelect={handleVenueSelect}
            onGetDirections={handleGetDirections}
            onOpenMap={() => handleScreenChange('map')}
            onDuskChange={setDusk}
          />
        )}

        {screen === 'map' && (
          <MapScreen
            mode={mode}
            currentDate={currentDate}
            userLocation={userLocation}
            locationGranted={locationGranted}
            selectedVenueId={selectedVenueId}
            onVenueSelect={handleVenueSelect}
            onTimeChange={handleTimeChange}
            onModeChange={handleModeChange}
            onGetDirections={handleGetDirections}
            onRecenter={handleRecenter}
            mapCenter={mapCenter}
            mapZoom={mapZoom}
            onMapCenterChange={setMapCenter}
            onZoomChange={setMapZoom}
            onSave={handleSave}
            savedVenueIds={savedVenueIds}
          />
        )}

        {screen === 'discover' && !discoverCategory && (
          <DiscoverScreen
            currentDate={currentDate}
            userLocation={userLocation}
            mode={mode}
            onModeChange={handleModeChange}
            onCategorySelect={handleCategorySelect}
          />
        )}

        {screen === 'discover' && discoverCategory && (
          <DiscoverResults
            category={discoverCategory}
            currentDate={currentDate}
            userLocation={userLocation}
            savedVenueIds={savedVenueIds}
            onBack={() => setDiscoverCategory(null)}
            onVenueSelect={handleVenueSelect}
            onDirections={handleGetDirections}
            onSave={handleSave}
          />
        )}

        {screen === 'saved' && (
          <SavedScreen
            savedVenues={savedVenues}
            mode={mode}
            currentDate={currentDate}
            userLocation={userLocation}
            onVenueSelect={handleVenueSelect}
          />
        )}

        {screen === 'profile' && (
          <ProfileScreen
            mode={mode}
            onModeChange={handleModeChange}
            locationLabel={locationLabel}
            locationGranted={locationGranted}
            currentDate={currentDate}
          />
        )}

        {/* Place detail bottom sheet — for non-map screens (map uses BestMatchSheet) */}
        {selectedVenue && screen !== 'map' && (
          <PlaceDetailSheet
            venue={selectedVenue}
            mode={mode}
            recommendation={null}
            userLocation={userLocation}
            currentDate={currentDate}
            isSaved={savedVenueIds.includes(selectedVenue.id)}
            onSave={() => handleSave(selectedVenue.id)}
            onClose={() => setSelectedVenueId(null)}
            onGetDirections={() => handleGetDirections(selectedVenue.id)}
          />
        )}

        {/* Bottom navigation */}
        {/* Le mode Ombre n'assombrit plus la barre : l'écran Maintenant est un
            bain clair dans les deux modes. Seul « Plein ouest » reste sombre. */}
        <BottomNav activeScreen={screen} onScreenChange={handleScreenChange} dusk={(screen === 'now' && dusk) || (screen === 'map' && !CLAIR)} tint={cyc && (mode === 'SUN' ? cyc.sheet : cyc.deep)} />
      </div>
    </div>
  );
}
