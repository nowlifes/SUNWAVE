import type { ScreenName } from '@/types';

interface BottomNavProps {
  activeScreen: ScreenName;
  onScreenChange: (screen: ScreenName) => void;
}

const NAV_ITEMS: { screen: ScreenName; label: string; icon: string }[] = [
  { screen: 'now', label: 'Maintenant', icon: 'sun' },
  { screen: 'map', label: 'Carte', icon: 'map' },
  { screen: 'discover', label: 'Explorer', icon: 'compass' },
  { screen: 'saved', label: 'Favoris', icon: 'bookmark' },
  { screen: 'profile', label: 'Profil', icon: 'user' },
];

function NavIcon({ icon, active }: { icon: string; active: boolean }) {
  const color = active ? '#F59E0B' : '#94A3B8';
  const paths: Record<string, React.ReactNode> = {
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="4" />
        <line x1="12" y1="20" x2="12" y2="22" />
        <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
        <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
        <line x1="2" y1="12" x2="4" y2="12" />
        <line x1="20" y1="12" x2="22" y2="12" />
        <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
        <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
      </>
    ),
    map: (
      <>
        <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6" />
        <line x1="9" y1="3" x2="9" y2="18" />
        <line x1="15" y1="6" x2="15" y2="21" />
      </>
    ),
    compass: (
      <>
        <circle cx="12" cy="12" r="10" />
        <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
      </>
    ),
    bookmark: (
      <>
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </>
    ),
    user: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  };

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {paths[icon]}
    </svg>
  );
}

export function BottomNav({ activeScreen, onScreenChange }: BottomNavProps) {
  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 glass border-t border-shade-200/50">
      <div className="flex items-center px-1 py-1.5 pb-[env(safe-area-inset-bottom)]">
        {NAV_ITEMS.map((item) => {
          const active = activeScreen === item.screen;
          return (
            <button
              key={item.screen}
              onClick={() => onScreenChange(item.screen)}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 active:scale-90 transition-transform"
            >
              <NavIcon icon={item.icon} active={active} />
              {/* Cinq onglets sur 320 px = 64 px chacun : libellés en casse
                  normale, sans espacement, sinon « MAINTENANT » déborde. */}
              <span className={`max-w-full truncate text-[10px] font-semibold transition-colors ${active ? 'text-sun-600' : 'text-shade-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
