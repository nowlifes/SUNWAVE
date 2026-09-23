import type { SunMode } from '@/types';

interface ProfileScreenProps {
  mode: SunMode;
  onModeChange: (mode: SunMode) => void;
  locationLabel: string;
  locationGranted: boolean;
}

// La bascule écrit le mode de l'app, pas une préférence à part : elle
// écrivait `preferences.mode`, que rien ne lisait — on touchait « Ombre » et
// l'accueil restait au soleil.
export function ProfileScreen({ mode, onModeChange, locationLabel, locationGranted }: ProfileScreenProps) {
  return (
    <div className="h-full overflow-y-auto no-scrollbar pb-20">
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-3xl font-bold text-shade-800">Profil</h1>
      </div>

      {/* Location */}
      <div className="px-5 mb-6">
        <h2 className="text-xs font-bold tracking-wider text-shade-400 mb-2">POSITION</h2>
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
              <p className="text-xs text-shade-400">
                {locationGranted ? 'Position activée' : 'Temps de marche depuis le centre de Lisbonne'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Sun preference */}
      <div className="px-5 mb-6">
        <h2 className="text-xs font-bold tracking-wider text-shade-400 mb-2">TU CHERCHES</h2>
        <div className="flex gap-3">
          <button
            onClick={() => onModeChange('SUN')}
            className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
              mode === 'SUN'
                ? 'bg-sun-500 text-white shadow-lg shadow-sun-500/30'
                : 'bg-white text-shade-500 border border-shade-100'
            }`}
          >
            ☀ Soleil
          </button>
          <button
            onClick={() => onModeChange('SHADE')}
            className={`flex-1 py-4 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
              mode === 'SHADE'
                ? 'bg-shade-600 text-white shadow-lg shadow-shade-600/30'
                : 'bg-white text-shade-500 border border-shade-100'
            }`}
          >
            🌑 Ombre
          </button>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="text-center text-xs text-shade-400">Sunwave · Lisbonne · v1.0</p>
      </div>
    </div>
  );
}
