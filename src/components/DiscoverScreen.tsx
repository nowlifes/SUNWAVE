import type { DiscoverCategory, SunMode, VenueCategory } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';

interface DiscoverScreenProps {
  currentDate: Date;
  userLocation: { lat: number; lng: number };
  onCategorySelect: (category: DiscoverCategory) => void;
  onVenueSelect: (venueId: string) => void;
}

const PRIMARY: DiscoverCategory[] = [
  { id: 'max_sun', label: 'Sun', icon: '☀', mode: 'SUN', categories: [], description: 'Chase the light' },
  { id: 'max_shade', label: 'Shade', icon: '🌑', mode: 'SHADE', categories: [], description: 'Keep it cool' },
];

const SECONDARY: DiscoverCategory[] = [
  { id: 'coffee', label: 'Coffee', icon: '☕', mode: 'ANY', categories: ['cafe'], description: 'Sunny café terraces' },
  { id: 'drink', label: 'Drinks', icon: '🍹', mode: 'ANY', categories: ['bar', 'rooftop'], description: 'Bars & rooftops' },
  { id: 'eat', label: 'Food', icon: '🍽️', mode: 'ANY', categories: ['restaurant'], description: 'Outdoor dining' },
  { id: 'beach', label: 'Beach', icon: '🏖️', mode: 'ANY', categories: ['beach'], description: 'Sun by the water' },
  { id: 'park', label: 'Park', icon: '🌳', mode: 'ANY', categories: ['park'], description: 'Green spaces' },
  { id: 'best_light', label: 'Best Light', icon: '📸', mode: 'SUN', categories: ['viewpoint', 'square'], description: 'Golden hour spots' },
];

export function DiscoverScreen({ currentDate, userLocation, onCategorySelect, onVenueSelect }: DiscoverScreenProps) {
  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-20">
      <div className="px-5 pt-8 pb-4">
        <h1 className="text-2xl font-bold text-shade-800">What are you in the mood for?</h1>
      </div>

      {/* Primary choices — large */}
      <div className="px-5 space-y-3 mb-6">
        {PRIMARY.map((cat) => {
          const mode = cat.mode as SunMode;
          const recs = RecommendationService.getRecommendations(mode, userLocation, currentDate, undefined, undefined, 1);
          const top = recs[0];
          return (
            <button
              key={cat.id}
              onClick={() => onCategorySelect(cat)}
              className="w-full relative overflow-hidden rounded-3xl p-5 text-left active:scale-[0.98] transition-transform shadow-md"
              style={{
                background: cat.mode === 'SUN'
                  ? 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)'
                  : 'linear-gradient(135deg, #64748B 0%, #334155 100%)',
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-3xl block mb-1">{cat.icon}</span>
                  <h3 className="text-xl font-bold text-white">{cat.label}</h3>
                  <p className="text-xs text-white/70 mt-0.5">{cat.description}</p>
                </div>
                {top && (
                  <div className="text-right">
                    <p className="text-xs font-semibold text-white/90 truncate max-w-[120px]">{top.venue.name}</p>
                    <p className="text-2xl font-bold text-white">{top.sunMatch}</p>
                    <p className="text-[10px] text-white/60">{top.walkTimeMin} min</p>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Secondary intents — compact grid */}
      <div className="px-5">
        <p className="text-xs font-bold tracking-wider text-shade-400 mb-3">OUTSIDE</p>
        <div className="grid grid-cols-3 gap-2.5">
          {SECONDARY.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategorySelect(cat)}
              className="bg-white rounded-2xl p-3 shadow-sm active:scale-95 transition-transform border border-shade-100 flex flex-col items-center gap-1"
            >
              <span className="text-2xl">{cat.icon}</span>
              <span className="text-xs font-bold text-shade-700">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

interface DiscoverResultsProps {
  category: DiscoverCategory;
  currentDate: Date;
  userLocation: { lat: number; lng: number };
  onBack: () => void;
  onVenueSelect: (venueId: string) => void;
}

export function DiscoverResults({ category, currentDate, userLocation, onBack, onVenueSelect }: DiscoverResultsProps) {
  const mode = (category.mode === 'ANY' ? 'SUN' : category.mode) as SunMode;
  const recs = RecommendationService.getRecommendations(
    mode, userLocation, currentDate,
    category.categories.length > 0 ? category.categories : undefined, undefined, 20
  );

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-20 animate-slide-in-right">
      <div className="sticky top-0 bg-white/90 backdrop-blur-md z-10 px-5 pt-6 pb-3 border-b border-shade-100">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-shade-500 mb-3 active:scale-95 transition-transform">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
        <div className="flex items-center gap-2">
          <span className="text-xl">{category.icon}</span>
          <div>
            <h1 className="text-lg font-bold text-shade-800">{category.label}</h1>
            <p className="text-xs text-shade-500">{category.description}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {recs.map((rec, idx) => {
          const displayPct = mode === 'SUN' ? rec.sunPercentage : rec.shadePercentage;
          const durationText = rec.sunWindowDurationMin > 0 ? RecommendationService.formatDuration(rec.sunWindowDurationMin) : '';
          return (
            <button
              key={rec.venue.id}
              onClick={() => onVenueSelect(rec.venue.id)}
              className="w-full text-left bg-white rounded-2xl p-3.5 shadow-sm active:scale-[0.98] transition-transform border border-shade-100"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold text-shade-400">{idx + 1}</span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-shade-800 truncate">{rec.venue.name}</h3>
                    <p className="text-[10px] text-shade-400">{VenueService.getNeighborhood(rec.venue)}</p>
                  </div>
                </div>
                <span className={`text-lg font-bold ${mode === 'SUN' ? 'text-sun-500' : 'text-shade-500'}`}>{rec.sunMatch}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 ml-5">
                <span className={`text-[11px] font-semibold ${mode === 'SUN' ? 'text-sun-600' : 'text-shade-600'}`}>{displayPct}%</span>
                <span className="text-[11px] text-shade-400">· {rec.walkTimeMin}m</span>
                {durationText && <span className="text-[11px] text-shade-400">· {durationText}</span>}
                {rec.sunWindowEnd && <span className="text-[11px] text-shade-400">· until {rec.sunWindowEnd}</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
