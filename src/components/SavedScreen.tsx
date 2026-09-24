import { useState } from 'react';
import type { SunMode, Venue } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { lisbonHour } from '@/utils/lisbonTime';
import { categoryLabel } from '@/utils/copy';
import { HaloIcon } from './Halo';

interface SavedScreenProps {
  savedVenues: Venue[];
  currentDate: Date;
  onVenueSelect: (venueId: string) => void;
  onRemove: (venueId: string) => void;
}

export function SavedScreen({ savedVenues, currentDate, onVenueSelect, onRemove }: SavedScreenProps) {
  const [activeTab, setActiveTab] = useState<'sun' | 'shade'>('sun');
  const hour = lisbonHour(currentDate);
  const currentMode: SunMode = activeTab === 'sun' ? 'SUN' : 'SHADE';
  const isSun = activeTab === 'sun';

  const displayVenues = savedVenues.filter((v) => RecommendationService.getBestTime(v, currentMode, currentDate) !== null);

  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-day pb-24 text-ink">
      <div className="px-6 pt-10 pb-2">
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.025em] [font-stretch:90%]">Favoris</h1>
      </div>

      <div className="px-6 py-3">
        <div className="flex gap-1 rounded-full border border-day-line bg-day-2 p-1" role="radiogroup" aria-label="Favoris">
          {(['sun', 'shade'] as const).map((tab) => (
            <button
              key={tab}
              role="radio"
              aria-checked={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={`min-h-10 flex-1 rounded-full text-[13px] font-bold transition-colors motion-reduce:transition-none ${
                activeTab === tab ? 'bg-ink text-white' : 'text-day-sub'
              }`}
            >
              {tab === 'sun' ? 'Au soleil' : "À l'ombre"}
            </button>
          ))}
        </div>
      </div>

      {displayVenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 px-6">
          <HaloIcon kind={isSun ? 'sun' : 'shade'} tone="day" alt={30} size={44} className="mb-4" />
          <p className="text-center text-sm font-semibold">
            {isSun ? 'Aucun lieu au soleil enregistré.' : "Aucun lieu à l'ombre enregistré."}
          </p>
          <p className="mt-1 text-center text-xs text-day-sub">Touche « Enregistrer » sur un lieu pour le retrouver ici.</p>
        </div>
      ) : (
        <div className="px-4 py-2 space-y-2.5">
          {displayVenues.map((venue) => {
            const bestTime = RecommendationService.getBestTime(venue, currentMode, currentDate);
            const currentPct = isSun ? venue.sunExposureByHour[hour] || 0 : venue.shadeExposureByHour[hour] || 0;
            const inIt = currentPct > 50;
            const neighborhood = VenueService.getNeighborhood(venue);

            return (
              <div key={venue.id} className="rounded-2xl border border-day-line bg-day-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => onVenueSelect(venue.id)} className="min-w-0 flex-1 text-left">
                    <h3 className="truncate text-[15px] font-bold">{venue.name}</h3>
                    <p className="mt-0.5 text-[12px] text-day-sub">{neighborhood} · {categoryLabel(venue.category)}</p>

                    <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                      <span className={`font-mono font-semibold ${isSun && inIt ? 'text-day-ember' : 'text-day-sub'}`}>{currentPct} %</span>
                      <span className="text-day-sub">
                        {inIt ? (isSun ? 'Au soleil maintenant' : "À l'ombre maintenant") : isSun ? 'Pas au soleil maintenant' : "Pas à l'ombre maintenant"}
                      </span>
                      {bestTime && (
                        <span className="text-day-sub">
                          · meilleur créneau{' '}
                          <span className={`font-mono font-semibold ${isSun ? 'text-day-ember' : 'text-ink'}`}>
                            {bestTime.start}–{bestTime.end}
                          </span>
                        </span>
                      )}
                    </p>
                  </button>
                  <button
                    onClick={() => onRemove(venue.id)}
                    aria-label={`Retirer ${venue.name} des favoris`}
                    className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-day-sub active:scale-90 transition-transform motion-reduce:transition-none"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
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
