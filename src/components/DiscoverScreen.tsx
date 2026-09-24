import type { DiscoverCategory, SunMode } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { statusShort, travelLabel } from '@/utils/copy';

interface DiscoverScreenProps {
  currentDate: Date;
  userLocation: { lat: number; lng: number };
  onCategorySelect: (category: DiscoverCategory) => void;
}

// Pas d'emoji ni de dégradé : la seule couleur de l'app est la lumière. Le
// soleil brille (disque plein), l'ombre est éteinte (rond vide).
const PRIMARY: DiscoverCategory[] = [
  { id: 'max_sun', label: 'Soleil', icon: 'sun', mode: 'SUN', categories: [], description: 'Suivre la lumière' },
  { id: 'max_shade', label: 'Ombre', icon: 'shade', mode: 'SHADE', categories: [], description: 'Rester au frais' },
];

const SECONDARY: DiscoverCategory[] = [
  { id: 'coffee', label: 'Café', icon: '', mode: 'ANY', categories: ['cafe'], description: 'Terrasses de café au soleil' },
  { id: 'drink', label: 'Un verre', icon: '', mode: 'ANY', categories: ['bar', 'rooftop'], description: 'Bars et rooftops' },
  { id: 'eat', label: 'Manger', icon: '', mode: 'ANY', categories: ['restaurant'], description: 'Manger dehors' },
  { id: 'beach', label: 'Plage', icon: '', mode: 'ANY', categories: ['beach'], description: "Le soleil au bord de l'eau" },
  { id: 'park', label: 'Parc', icon: '', mode: 'ANY', categories: ['park'], description: 'Espaces verts' },
  { id: 'best_light', label: 'Belle lumière', icon: '', mode: 'SUN', categories: ['viewpoint', 'square'], description: "Pour l'heure dorée" },
];

/** Soleil = ça brille, ombre = éteint. */
function StateDot({ mode, size = 14 }: { mode: SunMode; size?: number }) {
  return mode === 'SUN' ? (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full bg-dusk-fire shadow-[0_0_0_4px_rgba(255,170,87,0.35)]"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className="inline-block shrink-0 rounded-full border-2 border-day-sub"
      style={{ width: size, height: size }}
    />
  );
}

export function DiscoverScreen({ currentDate, userLocation, onCategorySelect }: DiscoverScreenProps) {
  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-day pb-24 text-ink">
      <div className="px-6 pt-10 pb-4">
        <h1 className="font-display text-[2.6rem] font-extrabold leading-[0.96] tracking-[-0.025em] [font-stretch:90%] [text-wrap:balance]">
          Tu as envie de quoi ?
        </h1>
      </div>

      {/* Les deux grandes envies */}
      <div className="px-6 space-y-3 mb-7">
        {PRIMARY.map((cat) => {
          const mode = cat.mode as SunMode;
          const recs = RecommendationService.getRecommendations(mode, userLocation, currentDate, undefined, undefined, 1);
          const top = recs[0];
          return (
            <button
              key={cat.id}
              onClick={() => onCategorySelect(cat)}
              className="flex w-full items-center justify-between gap-3 rounded-[20px] border border-day-line bg-day-2 p-5 text-left active:scale-[0.98] transition-transform motion-reduce:transition-none"
            >
              <div className="flex items-center gap-3">
                <StateDot mode={mode} size={18} />
                <div>
                  <h3 className="font-display text-[1.6rem] font-bold leading-none [font-stretch:90%]">{cat.label}</h3>
                  <p className="mt-1 text-[13px] text-day-sub">{cat.description}</p>
                </div>
              </div>
              {top && (
                <div className="min-w-0 text-right">
                  <p className="max-w-[130px] truncate text-[13px] font-semibold">{top.venue.name}</p>
                  <p className="text-[12px] text-day-sub">{travelLabel(top)}</p>
                  <p className={`text-[12px] font-semibold ${mode === 'SUN' ? 'text-day-ember' : 'text-day-sub'}`}>{statusShort(top, mode)}</p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Dehors, par envie */}
      <div className="px-6">
        <p className="mb-3 text-[13px] font-semibold text-day-sub">Dehors</p>
        <div className="grid grid-cols-2 gap-2.5 min-[360px]:grid-cols-3">
          {SECONDARY.map((cat) => (
            <button
              key={cat.id}
              onClick={() => onCategorySelect(cat)}
              className="min-h-14 rounded-2xl border border-day-line bg-day-2 px-3 py-3 text-[14px] font-bold active:scale-95 transition-transform motion-reduce:transition-none"
            >
              {cat.label}
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
    <div className="h-full overflow-y-auto no-scrollbar bg-day pb-24 text-ink animate-slide-in-right motion-reduce:animate-none">
      <div className="sticky top-0 z-10 border-b border-day-line bg-day px-6 pt-6 pb-3">
        <button onClick={onBack} className="-ml-1 mb-2 flex min-h-11 items-center gap-1.5 text-sm font-semibold text-day-sub active:scale-95 transition-transform motion-reduce:transition-none">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Retour
        </button>
        <div className="flex items-center gap-2.5">
          {category.mode !== 'ANY' && <StateDot mode={mode} />}
          <div>
            <h1 className="font-display text-[1.6rem] font-bold leading-none [font-stretch:90%]">{category.label}</h1>
            <p className="mt-1 text-xs text-day-sub">{category.description}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-3 space-y-2">
        {recs.map((rec, idx) => {
          const displayPct = mode === 'SUN' ? rec.sunPercentage : rec.shadePercentage;
          return (
            <button
              key={rec.venue.id}
              onClick={() => onVenueSelect(rec.venue.id)}
              className="w-full rounded-2xl border border-day-line bg-day-2 p-3.5 text-left active:scale-[0.98] transition-transform motion-reduce:transition-none"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-4 shrink-0 font-mono text-xs font-semibold text-day-sub">{idx + 1}</span>
                <div className="min-w-0">
                  <h3 className="truncate text-[15px] font-bold">{rec.venue.name}</h3>
                  <p className="text-[12px] text-day-sub">{VenueService.getNeighborhood(rec.venue)}</p>
                </div>
              </div>
              <div className="mt-1.5 ml-[26px] flex items-center gap-1.5 text-[12px]">
                <span className={`font-mono font-semibold ${mode === 'SUN' ? 'text-day-ember' : 'text-day-sub'}`}>{displayPct} %</span>
                <span className="text-day-sub">· {travelLabel(rec)} · {statusShort(rec, mode)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
