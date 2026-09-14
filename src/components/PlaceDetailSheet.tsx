import { useState, useCallback } from 'react';
import type { Venue, SunMode, Recommendation } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { ReportService } from '@/services/ReportService';
import { MapService } from '@/services/MapService';

interface PlaceDetailSheetProps {
  venue: Venue;
  mode: SunMode;
  recommendation: Recommendation | null;
  userLocation: { lat: number; lng: number };
  currentDate: Date;
  isSaved: boolean;
  onSave: () => void;
  onClose: () => void;
  onGetDirections: () => void;
}

const REPORT_OPTIONS: { type: import('@/types').ReportType; label: string }[] = [
  { type: 'terrace_shaded', label: 'Terrace is actually shaded' },
  { type: 'terrace_sunny', label: 'Terrace is actually sunny' },
  { type: 'terrace_missing', label: "Terrace doesn't exist" },
  { type: 'venue_closed', label: 'Venue is closed' },
  { type: 'building_missing', label: 'Building/structure is missing' },
  { type: 'outdoor_different', label: 'Outdoor area is different' },
  { type: 'other', label: 'Other' },
];

export function PlaceDetailSheet({
  venue,
  mode,
  recommendation,
  userLocation,
  currentDate,
  isSaved,
  onSave,
  onClose,
  onGetDirections,
}: PlaceDetailSheetProps) {
  const [showReport, setShowReport] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [saved, setSaved] = useState(isSaved);

  const hour = currentDate.getHours();
  const sunPct = venue.sunExposureByHour[hour] || 0;
  const shadePct = venue.shadeExposureByHour[hour] || 0;
  const displayPct = mode === 'SUN' ? sunPct : shadePct;

  const distanceM = MapService.haversineDistance(userLocation, { lat: venue.latitude, lng: venue.longitude });
  const walkTime = recommendation?.walkTimeMin ?? MapService.walkTimeMinutes(distanceM);

  const isOpen = recommendation?.isOpen ?? (() => {
    const day = currentDate.getDay();
    const hours = venue.openingHours[day];
    if (!hours) return false;
    const nowMin = currentDate.getHours() * 60 + currentDate.getMinutes();
    const [openH, openM] = hours.open.split(':').map(Number);
    const [closeH, closeM] = hours.close.split(':').map(Number);
    const openMin = openH * 60 + openM;
    let closeMin = closeH * 60 + closeM;
    if (closeMin <= openMin) closeMin += 24 * 60;
    return nowMin >= openMin && nowMin <= closeMin;
  })();

  const neighborhood = VenueService.getNeighborhood(venue);

  const bestTime = RecommendationService.getBestTime(venue, mode, currentDate);

  const sunWindow = recommendation?.sunWindowDurationMin ?? (() => {
    const exposure = mode === 'SUN' ? venue.sunExposureByHour : venue.shadeExposureByHour;
    const threshold = mode === 'SUN' ? 40 : 50;
    let duration = 0;
    for (let h = hour; h < 24; h++) {
      if (exposure[h] >= threshold) duration += 60;
      else if (duration > 0) break;
    }
    return duration;
  })();

  const sunMatchScore = recommendation?.sunMatch ?? (() => {
    const sunExposureScore = mode === 'SUN' ? sunPct : shadePct;
    const distanceScore = Math.max(0, 100 - (distanceM / 3000) * 100);
    const timeRemainingScore = Math.min(100, (sunWindow / 120) * 100);
    const outdoorScore = venue.hasOutdoorArea ? 100 : 30;
    const confidenceScore = venue.confidence === 'HIGH' ? 100 : venue.confidence === 'MEDIUM' ? 65 : 35;
    return Math.round(
      sunExposureScore * 0.45 + distanceScore * 0.2 + timeRemainingScore * 0.15 + outdoorScore * 0.1 + confidenceScore * 0.1
    );
  })();

  const handleSave = useCallback(() => {
    setSaved((s) => !s);
    onSave();
  }, [onSave]);

  const handleSubmitReport = useCallback((type: import('@/types').ReportType) => {
    ReportService.submit(venue.id, type);
    setReportSubmitted(true);
    setTimeout(() => {
      setShowReport(false);
      setReportSubmitted(false);
    }, 2500);
  }, [venue.id]);

  const sunBars = venue.sunExposureByHour.slice(7, 20).map((pct, i) => {
    const h = i + 7;
    const isCurrent = h === hour;
    return { hour: h, pct, isCurrent };
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="glass rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar">
          {/* Drag handle */}
          <div className="sticky top-0 flex justify-center py-2.5 glass z-10">
            <div className="w-10 h-1.5 rounded-full bg-shade-300" />
          </div>

          {!showReport ? (
            <div className="px-5 pb-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-shade-800">{venue.name}</h2>
                  <p className="text-sm text-shade-500 mt-0.5">{venue.address}</p>
                  <p className="text-xs text-shade-400 mt-0.5">{neighborhood} · {venue.category}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-shade-100 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Duration hero — most important info first */}
              {sunWindow > 0 && (
                <div className={`flex items-center justify-between mb-4 px-4 py-3 rounded-2xl ${mode === 'SUN' ? 'bg-sun-50' : 'bg-shade-100'}`}>
                  <div>
                    <p className={`text-base font-bold ${mode === 'SUN' ? 'text-sun-600' : 'text-shade-600'}`}>
                      {mode === 'SUN' ? 'SUNNY' : 'SHADED'} FOR {RecommendationService.formatDuration(sunWindow).toUpperCase()}
                    </p>
                    {bestTime && <p className="text-[11px] text-shade-400 mt-0.5">Best today: {bestTime.start} → {bestTime.end}</p>}
                  </div>
                  {isOpen ? (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-50">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      <span className="text-[10px] font-bold text-green-600">OPEN</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-shade-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-shade-400" />
                      <span className="text-[10px] font-bold text-shade-500">CLOSED</span>
                    </div>
                  )}
                </div>
              )}

              {/* Quick stats row */}
              <div className="flex items-center gap-3 mb-4">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${mode === 'SUN' ? 'bg-sun-100' : 'bg-shade-200'}`}>
                  <span className="text-sm">{mode === 'SUN' ? '☀' : '🌑'}</span>
                  <span className={`text-sm font-bold ${mode === 'SUN' ? 'text-sun-600' : 'text-shade-600'}`}>{displayPct}%</span>
                  <span className="text-[10px] font-medium text-shade-500">{mode === 'SUN' ? 'sunny' : 'shaded'}</span>
                </div>
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-shade-100">
                  <span className="text-sm font-bold text-shade-700">{walkTime}</span>
                  <span className="text-[10px] font-medium text-shade-500">min walk</span>
                </div>
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-shade-100">
                  <span className={`text-sm font-bold ${mode === 'SUN' ? 'text-sun-600' : 'text-shade-600'}`}>{sunMatchScore}</span>
                  <span className="text-[10px] font-medium text-shade-500">match</span>
                </div>
              </div>

              {/* Walk time */}
              <div className="flex items-center gap-2 mb-4 text-sm">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="10" r="3" />
                  <path d="M12 13c-3 0-5 2-5 5v3h10v-3c0-3-2-5-5-5z" />
                </svg>
                <span className="font-semibold text-shade-700">{walkTime} min walk</span>
                <span className="text-shade-400">·</span>
                <span className="text-shade-500">{MapService.formatDistance(MapService.haversineDistance(userLocation, { lat: venue.latitude, lng: venue.longitude }))}</span>
              </div>

              {/* Sun/shade today bars */}
              <div className="mb-5">
                <h3 className="text-xs font-bold tracking-wider text-shade-500 mb-3">{mode === 'SUN' ? 'SUN TODAY' : 'SHADE TODAY'}</h3>
                <div className="space-y-1.5">
                  {sunBars.map(({ hour: h, pct, isCurrent }) => {
                    const displayPct = mode === 'SUN' ? pct : venue.shadeExposureByHour[h] || 0;
                    const activeColor = mode === 'SUN' ? 'bg-sun-500' : 'bg-shade-500';
                    const inactiveColor = mode === 'SUN' ? 'bg-sun-300' : 'bg-shade-300';
                    const accentText = mode === 'SUN' ? 'text-sun-600' : 'text-shade-600';
                    return (
                      <div key={h} className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium w-8 ${isCurrent ? `${accentText} font-bold` : 'text-shade-400'}`}>
                          {String(h).padStart(2, '0')}:00
                        </span>
                        <div className="flex-1 h-3 bg-shade-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full smooth-transition ${isCurrent ? activeColor : inactiveColor}`}
                            style={{ width: `${displayPct}%` }}
                          />
                        </div>
                        <span className={`text-[10px] font-semibold w-7 text-right ${isCurrent ? accentText : 'text-shade-500'}`}>
                          {displayPct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Sun window detail */}
              {sunWindow > 0 && (
                <div className="flex items-center justify-between mb-5 px-4 py-2.5 rounded-xl bg-shade-50">
                  <div>
                    <p className="text-[10px] font-bold tracking-wider text-shade-400">SUN WINDOW</p>
                    <p className="text-sm font-bold text-shade-700">{bestTime ? `${bestTime.start} → ${bestTime.end}` : 'All day'}</p>
                  </div>
                </div>
              )}

              {/* Confidence */}
              <div className="bg-shade-50 rounded-2xl p-3 mb-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] font-bold tracking-wider text-shade-400">CONFIDENCE</p>
                  <span className={`text-xs font-bold ${venue.confidence === 'HIGH' ? 'text-green-600' : venue.confidence === 'MEDIUM' ? 'text-amber-600' : 'text-orange-600'}`}>
                    {venue.confidence}
                  </span>
                </div>
                <p className="text-[11px] text-shade-500 leading-relaxed">
                  {venue.confidence === 'HIGH'
                    ? 'Based on strong spatial data and mapped outdoor area.'
                    : venue.confidence === 'MEDIUM'
                    ? 'Good location data but incomplete outdoor geometry.'
                    : 'Estimated from incomplete data — treat with caution.'}
                </p>
              </div>

              {/* Description */}
              <p className="text-sm text-shade-600 leading-relaxed mb-5">{venue.description}</p>

              {/* Action buttons */}
              <div className="flex gap-3 mb-3">
                <button
                  onClick={onGetDirections}
                  className={`flex-1 py-3.5 rounded-2xl font-bold text-sm text-white active:scale-95 transition-transform flex items-center justify-center gap-2 ${
                    mode === 'SUN' ? 'bg-sun-500' : 'bg-shade-600'
                  }`}
                >
                  GO HERE
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
                <button
                  onClick={handleSave}
                  className={`px-5 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform ${
                    saved ? 'bg-sun-100 text-sun-600' : 'bg-shade-100 text-shade-600'
                  }`}
                >
                  {saved ? 'SAVED' : 'SAVE'}
                </button>
              </div>

              <button
                onClick={() => setShowReport(true)}
                className="w-full py-2.5 text-xs font-semibold text-shade-400 active:scale-95 transition-transform"
              >
                REPORT AN ISSUE
              </button>
            </div>
          ) : (
            /* Report flow */
            <div className="px-5 pb-8 pt-2">
              {!reportSubmitted ? (
                <>
                  <h3 className="text-xl font-bold text-shade-800 mb-4">Is something wrong?</h3>
                  <div className="space-y-2">
                    {REPORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.type}
                        onClick={() => handleSubmitReport(opt.type)}
                        className="w-full text-left px-4 py-3.5 rounded-2xl bg-shade-50 text-sm font-medium text-shade-700 active:scale-95 transition-all hover:bg-shade-100"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowReport(false)}
                    className="w-full mt-4 py-2.5 text-xs font-semibold text-shade-400"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 animate-scale-in">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-shade-800">Thanks!</p>
                  <p className="text-sm text-shade-500 mt-1 text-center">We'll use this to improve the map.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
