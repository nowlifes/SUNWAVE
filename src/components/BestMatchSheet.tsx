import type { Recommendation, SunMode } from '@/types';
import { VenueService } from '@/services/VenueService';
import { categoryLabel, statusCopy } from '@/utils/copy';

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
            {mode === 'SUN' ? 'Aucun lieu vraiment au soleil près de toi pour le moment.' : "Aucun lieu vraiment à l'ombre près de toi pour le moment."}
          </p>
        </div>
      </div>
    );
  }

  const { venue, sunPercentage, shadePercentage, walkTimeMin, isOpen } = rec;
  const displayPct = mode === 'SUN' ? sunPercentage : shadePercentage;
  const icon = mode === 'SUN' ? '☀' : '🌑';
  const accentText = mode === 'SUN' ? 'text-sun-600' : 'text-shade-600';
  const accentBg = mode === 'SUN' ? 'bg-sun-500' : 'bg-shade-600';
  const scoreColor = mode === 'SUN' ? 'text-sun-500' : 'text-shade-500';
  const neighborhood = VenueService.getNeighborhood(venue);
  const status = statusCopy(rec, mode);
  const modeLabel = mode === 'SUN' ? 'au soleil' : "à l'ombre";
  const headline = mode === 'SUN' ? 'MEILLEUR SOLEIL' : 'MEILLEURE OMBRE';

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
                  {headline}
                </span>
              </div>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </div>

            <div className="flex items-center justify-between mt-1">
              <span className="text-sm font-bold text-shade-800 truncate">{venue.name}</span>
              <span className={`text-sm font-bold ${scoreColor} shrink-0 ml-2`}>{displayPct} % {modeLabel}</span>
            </div>

            <p className="mt-0.5 truncate text-left text-[10px] text-shade-400">
              {walkTimeMin} min à pied · {status.title}
            </p>
          </button>

          {/* Collapsed Y aller — always visible */}
          <div className="px-3 pb-3">
            <button
              onClick={(e) => { e.stopPropagation(); onGetDirections(venue.id); }}
              className={`w-full py-2.5 rounded-xl font-bold text-xs text-white active:scale-95 transition-transform flex items-center justify-center gap-1.5 ${accentBg}`}
            >
              Y aller
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
                  {headline}
                </span>
              </div>
              <h2 className="text-xl font-bold text-shade-800 leading-tight">{venue.name}</h2>
              <p className="text-[11px] text-shade-400 mt-0.5">{neighborhood} · {categoryLabel(venue.category)}</p>
            </div>
            <button onClick={onClose} className="w-7 h-7 rounded-full bg-shade-100 flex items-center justify-center active:scale-90 transition-transform shrink-0">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* La même phrase qu'à l'accueil et dans la fiche. */}
          <div className="mb-4 px-4 py-3 rounded-xl bg-shade-50">
            <p className={`text-lg font-bold leading-tight ${accentText}`}>{status.title}</p>
            <p className="text-xs text-shade-500 mt-0.5">{status.detail}</p>
          </div>

          <div className="flex items-center gap-4 mb-4">
            <div>
              <span className={`text-2xl font-bold ${scoreColor}`}>{displayPct} %</span>
              <p className="text-[10px] text-shade-400">{modeLabel} maintenant</p>
            </div>
            <div className="w-px h-8 bg-shade-200" />
            <div>
              <span className="text-2xl font-bold text-shade-700">{walkTimeMin}</span>
              <p className="text-[10px] text-shade-400">min à pied</p>
            </div>
          </div>

          <div className="mb-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-sm">🪑</span>
              <span className="text-shade-600">{venue.hasOutdoorArea ? 'Places en extérieur' : 'Peu de places dehors'}</span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-sm">{isOpen ? '🟢' : '🔴'}</span>
              <span className="text-shade-600">{isOpen ? 'Ouvert maintenant' : 'Fermé pour le moment'}</span>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex gap-2">
            <button
              onClick={() => onGetDirections(venue.id)}
              className={`flex-1 py-3.5 rounded-2xl font-bold text-sm text-white active:scale-95 transition-transform flex items-center justify-center gap-2 ${accentBg}`}
            >
              Y aller
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
            <button
              onClick={() => onSave(venue.id)}
              className={`px-4 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform ${isSaved ? 'bg-sun-100 text-sun-600' : 'bg-shade-100 text-shade-600'}`}
            >
              {isSaved ? 'Enregistré' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
