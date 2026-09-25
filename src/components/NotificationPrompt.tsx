import type { PromptPhase } from '@/hooks/useNotifications';

interface NotificationPromptProps {
  phase: PromptPhase;
  error: string | null;
  onAccept: () => void;
  onDecline: () => void;
}

/** « Prévenir quand la golden hour approche ? » — même carte que la question sur
 *  place : crème, bordure encre, ombre dure. Une notification par jour, jamais la nuit. */
export function NotificationPrompt({ phase, error, onAccept, onDecline }: NotificationPromptProps) {
  const done = phase === 'done';
  const busy = phase === 'busy';
  return (
    <div className="pointer-events-none absolute inset-x-4 top-[calc(env(safe-area-inset-top)+58px)] z-20">
      <div
        role="group"
        aria-label="Notification golden hour"
        className="pointer-events-auto rounded-[20px] border-[1.5px] border-ink bg-cream p-4 text-ink shadow-[4px_4px_0_#0B1A45] animate-scale-in motion-reduce:animate-none"
      >
        <p className="font-display text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em] [text-wrap:balance]">
          {done ? 'C’est noté.' : 'Prévenir quand la golden hour approche ?'}
        </p>
        <p className="mt-2 text-[13px] font-medium leading-snug text-day-sub">
          {done
            ? 'Une notification par jour, jamais la nuit. Tu peux couper dans le profil.'
            : 'Une notification par jour, jamais la nuit. Tu coupes quand tu veux.'}
        </p>
        {error && (
          <p role="alert" className="mt-2 text-[13px] font-bold leading-snug text-day-ember">
            {error}
          </p>
        )}
        {!done && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              onClick={onAccept}
              disabled={busy}
              className="min-h-12 rounded-[14px] border-[1.5px] border-ink bg-dusk-fire px-2 font-display text-[14px] font-extrabold leading-[1.1] shadow-[3px_3px_0_#0B1A45] transition-[transform,box-shadow] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none disabled:opacity-60 motion-reduce:transition-none"
            >
              {busy ? 'Un instant…' : 'Oui, prévenez-moi'}
            </button>
            <button
              onClick={onDecline}
              disabled={busy}
              className="min-h-12 rounded-[14px] border-[1.5px] border-ink bg-white px-2 font-display text-[14px] font-extrabold leading-[1.1] transition-transform active:scale-95 disabled:opacity-60 motion-reduce:transition-none"
            >
              Pas maintenant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
