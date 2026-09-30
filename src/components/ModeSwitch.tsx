import type { SunMode } from '@/types';

/** L'interrupteur des bains : la piste prend la couleur du mode (orange du
 *  transat, bleu du bain), le pouce jaune glisse d'un côté à l'autre en
 *  portant le soleil ou la vague. Un tap bascule.
 *
 *  Partagé par la carte et par l'écran Maintenant : les deux écrans posent la
 *  même question, ils ne peuvent pas la poser de deux façons. */
export function ModeSwitch({
  mode,
  onModeChange,
  className = '',
}: {
  mode: SunMode;
  onModeChange: (m: SunMode) => void;
  className?: string;
}) {
  const shade = mode === 'SHADE';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={shade}
      aria-label="Chercher l'ombre"
      onClick={() => onModeChange(shade ? 'SUN' : 'SHADE')}
      data-mode={shade ? 'ombre' : 'soleil'}
      className={`mode-switch active:scale-95 ${className}`}
    >
      <span className="mode-switch-label">{shade ? 'Ombre' : 'Soleil'}</span>
      <span className="mode-switch-thumb" aria-hidden="true">
        {shade ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M3 9c2-2 4-2 6 0s4 2 6 0 4-2 6 0" /><path d="M3 15c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </svg>
        )}
      </span>
    </button>
  );
}
