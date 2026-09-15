import { useState, useMemo, useCallback, useEffect } from 'react';
import type { Venue, SunMode, VenueCategory, GeoPoint, Recommendation, WeatherData } from '@/types';
import { MapView } from './MapView';
import { TimeSlider } from './TimeSlider';
import { BestMatchSheet } from './BestMatchSheet';
import { SearchBar } from './SearchBar';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { WeatherService } from '@/services/WeatherService';

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
  { value: 'all', label: 'All' },
  { value: 'cafe', label: 'Cafés' },
  { value: 'bar', label: 'Drinks' },
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'park', label: 'Parks' },
  { value: 'beach', label: 'Beaches' },
  { value: 'rooftop', label: 'Rooftops' },
];

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
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [searchVenue, setSearchVenue] = useState<Venue | null>(null);
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

  const categories = activeFilter === 'all' ? [] : [activeFilter];

  const recommendations = useMemo(
    () => RecommendationService.getRecommendations(mode, userLocation, currentDate, categories, weather, 50),
    [mode, userLocation, currentDate, categories, weather]
  );

  const venues = useMemo(() => {
    const all = VenueService.getVenuesByCategory(categories);
    if (searchVenue) return all.filter((v) => v.id === searchVenue.id);
    return all;
  }, [categories, searchVenue]);

  const topRec = recommendations[0] || null;

  // If a venue is selected, show its sheet; otherwise show top recommendation
  const selectedRec = useMemo(() => {
    if (selectedVenueId) {
      return recommendations.find((r) => r.venue.id === selectedVenueId) || null;
    }
    return topRec;
  }, [selectedVenueId, recommendations, topRec]);

  const handleSearchSelect = useCallback((venue: Venue) => {
    setSearchVenue(venue);
    onVenueSelect(venue.id);
  }, [onVenueSelect]);

  return (
    <div className="relative w-full h-full">
      {/* Map fills 100% */}
      <MapView
        venues={venues}
        recommendations={recommendations}
        mode={mode}
        currentDate={currentDate}
        userLocation={userLocation}
        mapCenter={mapCenter}
        mapZoom={mapZoom}
        selectedVenueId={selectedVenueId}
        onVenueSelect={onVenueSelect}
        onMapCenterChange={onMapCenterChange}
        onZoomChange={onZoomChange}
        onRecenter={onRecenter}
        showUserLocation={true}
        locationGranted={locationGranted}
      />

      {/* Top overlay — compact */}
      <div className="absolute top-0 left-0 right-0 z-20 px-3 pt-3 pointer-events-none">
        <div className="pointer-events-auto space-y-2">
          {/* Compact header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md shadow-sm">
              <span className="text-xs font-bold text-shade-700">Lisbon</span>
              <span className="text-shade-300 text-xs">·</span>
              <span className="text-xs font-medium text-shade-500">Now</span>
            </div>
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-md shadow-sm">
              <span className="text-xs">{weather.condition === 'rain' ? '🌧' : weather.condition === 'cloudy' ? '☁' : weather.condition === 'partly_cloudy' ? '⛅' : '☀'}</span>
              <span className="text-xs font-semibold text-shade-600">{weather.temperature}°C</span>
            </div>
          </div>

          {/* Search — compact */}
          <SearchBar onSelectVenue={handleSearchSelect} />

          {/* Segmented SUN/SHADE toggle */}
          <div className="flex p-0.5 rounded-xl bg-white/80 backdrop-blur-md shadow-sm smooth-transition">
            <button
              onClick={() => onModeChange('SUN')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-400 ${
                mode === 'SUN' ? 'bg-sun-500 text-white shadow-sm' : 'text-shade-500'
              }`}
            >
              ☀ SUN
            </button>
            <button
              onClick={() => onModeChange('SHADE')}
              className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all duration-400 ${
                mode === 'SHADE' ? 'bg-shade-600 text-white shadow-sm' : 'text-shade-500'
              }`}
            >
              🌑 SHADE
            </button>
          </div>

          {/* Category filters — compact horizontal scroll */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {FILTER_CATEGORIES.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setActiveFilter(cat.value)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all active:scale-95 ${
                  activeFilter === cat.value
                    ? mode === 'SUN' ? 'bg-sun-100 text-sun-700' : 'bg-shade-200 text-shade-700'
                    : 'bg-white/80 backdrop-blur-md text-shade-500 shadow-sm'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom overlay — best match sheet + time slider */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-[56px]">
        <BestMatchSheet
          recommendation={selectedRec}
          mode={mode}
          expanded={sheetExpanded}
          onToggle={() => setSheetExpanded(!sheetExpanded)}
          onClose={() => { setSheetExpanded(false); onVenueSelect(null); }}
          onGetDirections={onGetDirections}
          isSaved={selectedRec ? savedVenueIds.includes(selectedRec.venue.id) : false}
          onSave={onSave}
        />

        <TimeSlider mode={mode} currentDate={currentDate} onTimeChange={onTimeChange} />
      </div>
    </div>
  );
}
