import type { Recommendation, SunMode } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';

interface BestMatchSheetProps {
  recommendation: Recommendation | null;
  mode: SunMode;
  expanded: boolean;
  onToggle: () => void;
  onClose: () => void;
  onGetDirections: (venueId: string) => void;
  isSaved: boolean;
  onSave: (venueId: string) => void;
}

export function BestMatchSheet({
  recommendation: rec,
  mode,
  expanded,
  onToggle,
  onClose,
  onGetDirections,
  isSaved,
  onSave,
}: BestMatchSheetProps) {
  if (!rec) {
    return (
      <div className="px-3 pb-1">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg px-4 py-3">
          <p className="text-xs text-shade-500 font-medium">
            {mode === 'SUN' ? 'No strong sunny places nearby right now.' : 'No strong shade places nearby right now.'}
          </p>
        </div>
      </div>
    );
  }

  const { venue, sunMatch, sunPercentage, shadePercentage, walkTimeMin, sunWindowStart, sunWindowEnd, sunWindowDurationMin, confidence, isOpen } = rec;
  const displayPct = mode === 'SUN' ? sunPercentage : shadePercentage;
  const icon = mode === 'SUN' ? '☀' : '🌑';
  const accentText = mode === 'SUN' ? 'text-sun-600' : 'text-shade-600';
  const accentBg = mode === 'SUN' ? 'bg-sun-500' : 'bg-shade-600';
  const scoreColor = mode === 'SUN' ? 'text-sun-500' : 'text-shade-500';
  const neighborhood = VenueService.getNeighborhood(venue);
  const confidenceColor = confidence === 'HIGH' ? 'text-green-600' : confidence === 'MEDIUM' ? 'text-amber-600' : 'text-orange-600';
  const durationText = sunWindowDurationMin > 0 ? RecommendationService.formatDuration(sunWindowDurationMin) : '';
  const modeLabel = mode === 'SUN' ? 'sunny' : 'shaded';
  const modeCaps = mode === 'SUN' ? 'SUNNY' : 'SHADED';

  if (!expanded) {
    return (
      <div className="px-3 pb-1">
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg overflow-hidden">
          <button
            onClick={onToggle}
            className="w-full px-4 pt-3 pb-2 active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-sm shrink-0">{icon}</span>
                <span className={`text-[10px] font-bold tracking-wider shrink-0 ${accentText}`}>
                  {mode === 'SUN' ? 'BEST MATCH' : 'BEST SHADE'}
                </span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </div>

            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-bold text-shade-800 truncate">{venue.name}</span>
              <span className={`text-sm font-bold ${scoreColor} shrink-0 ml-2`}>{displayPct}% {modeLabel}</span>
            </div>

            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10px] text-shade-400">{walkTimeMin} min walk</span>
              {durationText && <span className="text-[10px] text-shade-400">· {modeCaps} FOR {durationText.toUpperCase()}</span>}
              {sunWindowEnd && <span className="text-[10px] text-shade-400">· until {sunWindowEnd}</span>}
            </div>
          </button>

          {/* Collapsed GO HERE — always visible */}
          <div className="px-3 pb-3">
            <button
              onClick={(e) => { e.stopPropagation(); onGetDirections(venue.id); }}
              className={`w-full py-2.5 rounded-xl font-bold text-xs text-white active:scale-95 transition-transform flex items-center justify-center gap-1.5 ${accentBg}`}
            >
              GO HERE
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Expanded state
  return (
    <div className="px-3 pb-1">
      <div className="bg-white/95 backdrop-blur-xl rounded-t-3xl shadow-2xl overflow-hidden animate-slide-up">
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-9 h-1 rounded-full bg-shade-300" />
        </div>

        <div className="px-5 pb-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-sm">{icon}</span>
                <span className={`text-[10px] font-bold tracking-wider ${accentText}`}>
                  {mode === 'SUN' ? 'BEST MATCH' : 'BEST SHADE'}
                </span>
              </div>
              <h2 className="text-xl font-bold text-shade-800 leading-tight">{venue.name}</h2>
              <p className="text-[11px] text-shade-400 mt-0.5">{neighborhood} · {venue.category}</p>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-shade-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Duration-first hero stat */}
          {durationText && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-shade-50">
              <p className={`text-lg font-bold ${accentText}`}>{modeCaps} FOR {durationText.toUpperCase()}</p>
              {sunWindowEnd && <p className="text-xs text-shade-500 mt-0.5">{mode === 'SUN' ? 'Sun' : 'Shade'} until {sunWindowEnd}</p>}
            </div>
          )}

          {/* Quick stats row */}
          <div className="flex items-center gap-4 mb-4">
            <div>
              <span className={`text-2xl font-bold ${accentText}`}>{displayPct}%</span>
              <p className="text-[10px] text-shade-400">{modeLabel} now</p>
            </div>
            <div className="w-px h-8 bg-shade-200" />
            <div>
              <span className="text-2xl font-bold text-shade-700">{walkTimeMin}</span>
              <p className="text-[10px] text-shade-400">min walk</p>
            </div>
            <div className="w-px h-8 bg-shade-200" />
            <div>
              <span className={`text-2xl font-bold ${scoreColor}`}>{sunMatch}</span>
              <p className="text-[10px] text-shade-400">{mode === 'SUN' ? 'sun match' : 'shade match'}</p>
            </div>
          </div>

          {/* Sun window */}
          {sunWindowStart && sunWindowEnd && (
            <div className="flex items-center justify-between mb-4 px-4 py-2.5 rounded-xl bg-shade-50/50">
              <div>
                <p className="text-[10px] font-bold tracking-wider text-shade-400">SUN WINDOW</p>
                <p className="text-sm font-bold text-shade-700">{sunWindowStart} → {sunWindowEnd}</p>
              </div>
            </div>
          )}

          {/* WHY THIS PLACE? */}
          <div className="mb-4">
            <p className="text-[10px] font-bold tracking-wider text-shade-400 mb-2">WHY THIS PLACE?</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-sm">{icon}</span>
                <span className="text-shade-600">{displayPct}% outdoor area {modeLabel}</span>
              </div>
              {durationText && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-sm">⏱️</span>
                  <span className="text-shade-600">{durationText} of useful {mode === 'SUN' ? 'sunlight' : 'shade'}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-sm">🚶</span>
                <span className="text-shade-600">{walkTimeMin} min walk from you</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-sm">🪑</span>
                <span className="text-shade-600">{venue.hasOutdoorArea ? 'Outdoor seating available' : 'Limited outdoor space'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-sm">{isOpen ? '🟢' : '🔴'}</span>
                <span className="text-shade-600">{isOpen ? 'Open now' : 'Currently closed'}</span>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className={`text-xs font-bold ${confidenceColor}`}>{confidence}</span>
                <span className="text-shade-500">confidence</span>
              </div>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex gap-2">
            <button
              onClick={() => onGetDirections(venue.id)}
              className={`flex-1 py-3.5 rounded-2xl font-bold text-sm text-white active:scale-95 transition-transform flex items-center justify-center gap-2 ${accentBg}`}
            >
              GO HERE
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button
              onClick={() => onSave(venue.id)}
              className={`px-4 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform ${isSaved ? 'bg-sun-100 text-sun-600' : 'bg-shade-100 text-shade-600'}`}
            >
              {isSaved ? 'SAVED' : 'SAVE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
