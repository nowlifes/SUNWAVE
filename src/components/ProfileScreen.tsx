import type { SunMode, VenueCategory, UserPreferences } from '@/types';

interface ProfileScreenProps {
  preferences: UserPreferences;
  onPreferencesChange: (prefs: UserPreferences) => void;
  locationLabel: string;
  locationGranted: boolean;
}

const CATEGORIES: { value: VenueCategory; label: string }[] = [
  { value: 'cafe', label: 'Cafés' },
  { value: 'restaurant', label: 'Restaurants' },
  { value: 'bar', label: 'Drinks' },
  { value: 'park', label: 'Parks' },
  { value: 'beach', label: 'Beaches' },
  { value: 'rooftop', label: 'Rooftops' },
  { value: 'viewpoint', label: 'Viewpoints' },
  { value: 'square', label: 'Squares' },
];

export function ProfileScreen({ preferences, onPreferencesChange, locationLabel, locationGranted }: ProfileScreenProps) {
  const toggleCategory = (cat: VenueCategory) => {
    const existing = preferences.preferredCategories.includes(cat);
    onPreferencesChange({
      ...preferences,
      preferredCategories: existing
        ? preferences.preferredCategories.filter((c) => c !== cat)
        : [...preferences.preferredCategories, cat],
    });
  };

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-20">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-3xl font-bold text-shade-800">Profile</h1>
      </div>

      {/* Location */}
      <div className="px-5 mb-6">
        <h2 className="text-xs font-bold tracking-wider text-shade-400 mb-2">LOCATION</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-shade-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-shade-700">{locationLabel}</p>
              <p className="text-xs text-shade-400">{locationGranted ? 'Location enabled' : 'Using Lisbon for demo'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Sun preference */}
      <div className="px-5 mb-6">
        <h2 className="text-xs font-bold tracking-wider text-shade-400 mb-2">SUN PREFERENCE</h2>
        <div className="flex gap-3">
          <button
            onClick={() => onPreferencesChange({ ...preferences, mode: 'SUN' })}
            className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
              preferences.mode === 'SUN'
                ? 'bg-sun-500 text-white shadow-lg shadow-sun-500/30'
                : 'bg-white text-shade-500 border border-shade-100'
            }`}
          >
            ☀ SUN
          </button>
          <button
            onClick={() => onPreferencesChange({ ...preferences, mode: 'SHADE' })}
            className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
              preferences.mode === 'SHADE'
                ? 'bg-shade-600 text-white shadow-lg shadow-shade-600/30'
                : 'bg-white text-shade-500 border border-shade-100'
            }`}
          >
            🌑 SHADE
          </button>
        </div>
      </div>

      {/* Preferred categories */}
      <div className="px-5 mb-6">
        <h2 className="text-xs font-bold tracking-wider text-shade-400 mb-2">PREFERRED CATEGORIES</h2>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const active = preferences.preferredCategories.includes(cat.value);
            return (
              <button
                key={cat.value}
                onClick={() => toggleCategory(cat.value)}
                className={`px-4 py-2 rounded-full text-xs font-semibold transition-all active:scale-95 ${
                  active
                    ? 'bg-sun-500 text-white'
                    : 'bg-white text-shade-500 border border-shade-100'
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Units */}
      <div className="px-5 mb-6">
        <h2 className="text-xs font-bold tracking-wider text-shade-400 mb-2">UNITS</h2>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-shade-100 flex items-center justify-between">
          <span className="text-sm font-semibold text-shade-600">Distance</span>
          <span className="text-sm font-bold text-shade-700">Metric (m / km)</span>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="text-center text-xs text-shade-400">SUN · Lisbon Edition · v1.0</p>
      </div>
    </div>
  );
}
