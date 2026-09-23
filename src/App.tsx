import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SunMode, Venue, GeoPoint, ScreenName, DiscoverCategory } from '@/types';
import { LocationService } from '@/services/LocationService';
import { VenueService } from '@/services/VenueService';
import { venueIdFromUrl } from '@/utils/share';

import { Onboarding } from '@/components/Onboarding';
import { NowScreen } from '@/components/NowScreen';
import { MapScreen } from '@/components/MapScreen';
import { DiscoverScreen, DiscoverResults } from '@/components/DiscoverScreen';
import { SavedScreen } from '@/components/SavedScreen';
import { ProfileScreen } from '@/components/ProfileScreen';
import { BottomNav } from '@/components/BottomNav';
import { PlaceDetailSheet } from '@/components/PlaceDetailSheet';

const LISBON_CENTER: GeoPoint = { lat: 38.7223, lng: -9.1393 };
const DEFAULT_ZOOM = 14;

const STORAGE_KEYS = {
  onboarding: 'sun_onboarding_complete',
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
  const [onboardingComplete, setOnboardingComplete] = useState(
    () => invitedVenueId !== null || loadFromStorage(STORAGE_KEYS.onboarding, false)
  );
  // L'app ouvre sur la réponse, pas sur la carte : voir NowScreen.
  const [screen, setScreen] = useState<ScreenName>('now');
  const [mode, setMode] = useState<SunMode>(() => loadFromStorage(STORAGE_KEYS.mode, 'SUN'));
  const [currentDate, setCurrentDate] = useState(new Date());
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

  // Persist state
  useEffect(() => saveToStorage(STORAGE_KEYS.mode, mode), [mode]);
  // Le lien a servi : un rechargement ne doit pas rouvrir la fiche.
  useEffect(() => {
    if (invitedVenueId) window.history.replaceState(null, '', window.location.pathname);
  }, [invitedVenueId]);
  useEffect(() => saveToStorage(STORAGE_KEYS.saved, savedVenueIds), [savedVenueIds]);

  // Auto-request location when entering map after onboarding
  useEffect(() => {
    if (onboardingComplete && !locationRequested) {
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
  }, [onboardingComplete, locationRequested]);

  // Refresh "now" time periodically (only if close to now — a time picked on
  // the map slider must not snap back). The answer screen shows a clock: it
  // has to tick too.
  useEffect(() => {
    if (screen !== 'map' && screen !== 'now') return;
    const interval = setInterval(() => {
      setCurrentDate((prev) => {
        const diff = Math.abs(prev.getTime() - Date.now());
        if (diff < 120000) return new Date(); // auto-update if within 2 min of now
        return prev;
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [screen]);

  const handleOnboardingComplete = useCallback((selectedMode: SunMode) => {
    setMode(selectedMode);
    setOnboardingComplete(true);
    saveToStorage(STORAGE_KEYS.onboarding, true);
  }, []);

  const handleEnableLocation = useCallback(() => {
    LocationService.getCurrentLocation().then((loc) => {
      setUserLocation(loc.coords);
      setLocationGranted(loc.granted);
      setOutsideLisbon(loc.outsideLisbon);
      if (loc.granted) {
        setMapCenter(loc.coords);
      }
    });
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
        setMapZoom(16);
      }
    }
  }, []);

  const handleTimeChange = useCallback((date: Date) => {
    setCurrentDate(date);
  }, []);

  const handleModeChange = useCallback((newMode: SunMode) => {
    setMode(newMode);
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

  const handleRemoveSaved = useCallback((venueId: string) => {
    setSavedVenueIds((prev) => prev.filter((id) => id !== venueId));
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

  if (!onboardingComplete) {
    return (
      <Onboarding
        onComplete={handleOnboardingComplete}
        onEnableLocation={handleEnableLocation}
      />
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-shade-100 flex items-center justify-center">
      {/* Mobile container */}
      <div className="relative w-full h-full max-w-md mx-auto bg-shade-50 overflow-hidden shadow-2xl">
        {/* Screen routing */}
        {screen === 'now' && (
          <NowScreen
            mode={mode}
            currentDate={currentDate}
            userLocation={userLocation}
            locationGranted={locationGranted}
            outsideLisbon={outsideLisbon}
            onModeChange={handleModeChange}
            onVenueSelect={handleVenueSelect}
            onGetDirections={handleGetDirections}
            onOpenMap={() => handleScreenChange('map')}
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
            onCategorySelect={handleCategorySelect}
          />
        )}

        {screen === 'discover' && discoverCategory && (
          <DiscoverResults
            category={discoverCategory}
            currentDate={currentDate}
            userLocation={userLocation}
            onBack={() => setDiscoverCategory(null)}
            onVenueSelect={handleVenueSelect}
          />
        )}

        {screen === 'saved' && (
          <SavedScreen
            savedVenues={savedVenues}
            currentDate={currentDate}
            onVenueSelect={handleVenueSelect}
            onRemove={handleRemoveSaved}
          />
        )}

        {screen === 'profile' && (
          <ProfileScreen
            mode={mode}
            onModeChange={handleModeChange}
            locationLabel={locationLabel}
            locationGranted={locationGranted}
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
        <BottomNav activeScreen={screen} onScreenChange={handleScreenChange} />
      </div>
    </div>
  );
}
