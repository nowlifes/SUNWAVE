import { useId } from 'react';
import type { ScreenName } from '@/types';
import { DAY, LIGHT, NIGHT } from '@/utils/palette';

interface BottomNavProps {
  activeScreen: ScreenName;
  onScreenChange: (screen: ScreenName) => void;
  /** L'écran est de nuit (carte, ombre, Plein ouest) : la barre suit. */
  dusk?: boolean;
}

const NAV_ITEMS: { screen: ScreenName; label: string }[] = [
  { screen: 'now', label: 'Maintenant' },
  { screen: 'map', label: 'Carte' },
  { screen: 'discover', label: 'Explorer' },
  { screen: 'saved', label: 'Favoris' },
  { screen: 'profile', label: 'Profil' },
];

// Cinq icônes, un seul trait de 1,8 ; chacune a son rond, comme le reste de
// l'app. L'onglet où l'on est prend le halo.
const PATHS: Record<ScreenName, React.ReactNode> = {
  now: (
    <>
      <path d="M7 16a5 5 0 0 1 10 0" />
      <path d="M3.5 16h17M7 20h10" />
      <path d="M12 5v2.5M5.6 8.6l1.7 1.7M18.4 8.6l-1.7 1.7" />
    </>
  ),
  map: (
    <>
      <path d="M4 6.5 9 4.5l6 2 5-2v13l-5 2-6-2-5 2z" />
      <circle cx="12" cy="11.5" r="2.4" />
    </>
  ),
  discover: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2" />
    </>
  ),
  saved: (
    <>
      <path d="M7 3.5h10v17l-5-3.5-5 3.5z" />
      <circle cx="12" cy="9.5" r="2" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
};

function NavIcon({ screen, active, dusk = false }: { screen: ScreenName; active: boolean; dusk?: boolean }) {
  const id = useId();
  const stroke = active ? LIGHT.fire : dusk ? NIGHT.dim : DAY.sub;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="block overflow-visible">
      {active && (
        <>
          <defs>
            <radialGradient id={id}>
              <stop offset="0.35" stopColor={LIGHT.glow} stopOpacity="0.42" />
              <stop offset="1" stopColor={LIGHT.glow} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r="13" fill={`url(#${id})`} />
        </>
      )}
      <g stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[screen]}
      </g>
    </svg>
  );
}

export function BottomNav({ activeScreen, onScreenChange, dusk = false }: BottomNavProps) {
  return (
    <nav
      aria-label="Navigation"
      className={`absolute bottom-0 left-0 right-0 z-30 border-t ${dusk ? 'border-dusk-cobalt bg-dusk-deep' : 'border-day-line bg-day-2'}`}
    >
      <div className="flex items-center px-1 py-1.5 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const active = activeScreen === item.screen;
          return (
            <button
              key={item.screen}
              onClick={() => onScreenChange(item.screen)}
              aria-current={active ? 'page' : undefined}
              className="flex min-h-12 min-w-0 flex-1 flex-col items-center gap-1 py-1.5 active:scale-90 transition-transform motion-reduce:transition-none"
            >
              <NavIcon screen={item.screen} active={active} dusk={dusk} />
              {/* Cinq onglets sur 320 px = 64 px chacun : libellés en casse
                  normale, sans espacement, sinon « MAINTENANT » déborde. */}
              <span
                className={`max-w-full truncate text-[11px] ${
                  active
                    ? dusk
                      ? 'font-bold text-dusk-fire'
                      : 'font-bold text-day-ember'
                    : dusk
                      ? 'font-medium text-dusk-dim'
                      : 'font-medium text-day-sub'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
