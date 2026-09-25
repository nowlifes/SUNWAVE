import type { SunMode } from '@/types';
import { useNotificationSetting } from '@/hooks/useNotifications';

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
  const notif = useNotificationSetting();
  return (
    <div className="h-full overflow-y-auto no-scrollbar bg-day pb-24 text-ink">
      <div className="px-6 pt-10 pb-4">
        <h1 className="font-display text-[2.6rem] font-extrabold leading-none tracking-[-0.025em] [font-stretch:90%]">Profil</h1>
      </div>

      {/* Position */}
      <div className="px-6 mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-day-sub">Position</h2>
        <div className="rounded-[20px] border border-day-line bg-day-2 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-day">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold">{locationLabel}</p>
              <p className="text-xs text-day-sub">
                {locationGranted ? 'Position activée' : 'Temps de marche depuis le centre de Lisbonne'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Ce qu'on cherche */}
      <div className="px-6 mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-day-sub">Tu cherches</h2>
        <div className="flex gap-3" role="radiogroup" aria-label="Tu cherches">
          {(['SUN', 'SHADE'] as const).map((m) => (
            <button
              key={m}
              role="radio"
              aria-checked={mode === m}
              onClick={() => onModeChange(m)}
              className={`min-h-[52px] flex-1 rounded-full text-[15px] font-bold transition-colors active:scale-[0.98] motion-reduce:transition-none ${
                mode === m ? 'bg-ink text-white' : 'border-[1.5px] border-day-line text-day-sub'
              }`}
            >
              {m === 'SUN' ? 'Soleil' : 'Ombre'}
            </button>
          ))}
        </div>
      </div>

      {/* Notifications : une par jour, 20 min avant la golden hour */}
      <div className="px-6 mb-6">
        <h2 className="mb-2 text-[13px] font-semibold text-day-sub">Notifications</h2>
        <div className="rounded-[20px] border border-day-line bg-day-2 p-4">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p id="notif-label" className="text-sm font-bold">Notifications</p>
              <p id="notif-sub" className="text-xs text-day-sub">Une par jour, 20 min avant la golden hour</p>
            </div>
            <button
              role="switch"
              aria-checked={notif.on}
              aria-labelledby="notif-label"
              aria-describedby="notif-sub"
              disabled={!notif.supported || notif.busy}
              onClick={notif.toggle}
              className="flex h-11 w-16 shrink-0 items-center justify-center disabled:opacity-40"
            >
              <span
                className={`relative h-7 w-[52px] rounded-full border-[1.5px] border-ink transition-colors motion-reduce:transition-none ${
                  notif.on ? 'bg-dusk-fire' : 'bg-white'
                }`}
              >
                <span
                  className={`absolute top-[2px] h-5 w-5 rounded-full border-[1.5px] border-ink bg-cream transition-[left] motion-reduce:transition-none ${
                    notif.on ? 'left-[26px]' : 'left-[2px]'
                  }`}
                />
              </span>
            </button>
          </div>
          {notif.installHint && (
            <p className="mt-3 text-xs font-medium leading-snug text-day-sub">
              Sur iPhone : ajoute SUNWAVE à l’écran d’accueil pour les recevoir
            </p>
          )}
          {!notif.supported && !notif.installHint && (
            <p className="mt-3 text-xs font-medium leading-snug text-day-sub">
              Les notifications ne sont pas disponibles sur ce navigateur.
            </p>
          )}
          {notif.error && (
            <p role="alert" className="mt-3 text-xs font-bold leading-snug text-day-ember">
              {notif.error}
            </p>
          )}
        </div>
      </div>

      <div className="px-6 py-4">
        <p className="text-center font-mono text-xs text-day-sub">Sunwave · Lisbonne · v1.0</p>
      </div>
    </div>
  );
}
