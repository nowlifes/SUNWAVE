import { useState } from 'react';
import type { SunMode, Venue } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { lisbonHour } from '@/utils/lisbonTime';
import { categoryLabel } from '@/utils/copy';

interface SavedScreenProps {
  savedVenues: Venue[];
  currentDate: Date;
  onVenueSelect: (venueId: string) => void;
  onRemove: (venueId: string) => void;
}

export function SavedScreen({ savedVenues, currentDate, onVenueSelect, onRemove }: SavedScreenProps) {
  const [activeTab, setActiveTab] = useState<'sun' | 'shade'>('sun');
  const hour = lisbonHour(currentDate);
  const currentMode = activeTab === 'sun' ? 'SUN' : 'SHADE' as SunMode;

  const displayVenues = savedVenues.filter((v) => {
    const bestTime = RecommendationService.getBestTime(v, currentMode, currentDate);
    return bestTime !== null;
  });

  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-20">
      <div className="px-5 pt-8 pb-2">
        <h1 className="text-2xl font-bold text-shade-800">Favoris</h1>
      </div>

      <div className="px-5 py-3">
        <div className="flex gap-1 p-0.5 bg-shade-100 rounded-xl">
          <button
            onClick={() => setActiveTab('sun')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'sun' ? 'bg-white text-sun-600 shadow-sm' : 'text-shade-400'}`}
          >
            ☀ Au soleil
          </button>
          <button
            onClick={() => setActiveTab('shade')}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'shade' ? 'bg-white text-shade-600 shadow-sm' : 'text-shade-400'}`}
          >
            🌑 À l'ombre
          </button>
        </div>
      </div>

      {displayVenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-5">
          <span className="text-3xl mb-3 opacity-30">{activeTab === 'sun' ? '☀' : '🌑'}</span>
          <p className="text-sm font-semibold text-shade-500 text-center">
            {activeTab === 'sun' ? 'Aucun lieu au soleil enregistré.' : "Aucun lieu à l'ombre enregistré."}
          </p>
          <p className="text-xs text-shade-400 mt-1 text-center">Touche « Enregistrer » sur un lieu pour le retrouver ici.</p>
        </div>
      ) : (
        <div className="px-4 py-2 space-y-2.5">
          {displayVenues.map((venue) => {
            const bestTime = RecommendationService.getBestTime(venue, currentMode, currentDate);
            const currentPct = currentMode === 'SUN'
              ? venue.sunExposureByHour[hour] || 0
              : venue.shadeExposureByHour[hour] || 0;
            const neighborhood = VenueService.getNeighborhood(venue);

            return (
              <div key={venue.id} className="bg-white rounded-2xl p-4 shadow-sm border border-shade-100">
                <div className="flex items-start justify-between">
                  <button onClick={() => onVenueSelect(venue.id)} className="flex-1 text-left min-w-0">
                    <h3 className="text-sm font-bold text-shade-800 truncate">{venue.name}</h3>
                    <p className="text-[11px] text-shade-400 mt-0.5">{neighborhood} · {categoryLabel(venue.category)}</p>

                    {/* Current sun/shade status */}
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex items-center gap-1">
                        <span className="text-xs">{activeTab === 'sun' ? '☀' : '🌑'}</span>
                        <span className={`text-xs font-bold ${activeTab === 'sun' ? 'text-sun-600' : 'text-shade-600'}`}>{currentPct} %</span>
                        <span className={`text-[10px] ${currentPct > 50 ? (activeTab === 'sun' ? 'text-sun-500' : 'text-shade-500') : 'text-shade-400'}`}>
                          {currentPct > 50 ? (activeTab === 'sun' ? 'Au soleil maintenant' : "À l'ombre maintenant") : (activeTab === 'sun' ? 'Pas au soleil maintenant' : "Pas à l'ombre maintenant")}
                        </span>
                      </div>
                      {bestTime && (
                        <>
                          <span className="text-shade-300 text-[10px]">·</span>
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-bold text-shade-400">MEILLEUR CRÉNEAU</span>
                            <span className={`text-xs font-bold ${activeTab === 'sun' ? 'text-sun-600' : 'text-shade-600'}`}>
                              {bestTime.start}–{bestTime.end}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => onRemove(venue.id)}
                    className="w-7 h-7 rounded-full bg-shade-100 flex items-center justify-center active:scale-90 transition-transform shrink-0"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
