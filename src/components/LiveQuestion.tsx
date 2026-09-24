import type { Venue, SunMode } from '@/types';
import type { LiveAnswer } from '@/services/LiveReportService';
import { LIVE_ANSWERS } from '@/utils/live';
import { shortVenueName } from '@/utils/mapGuide';
import { LiveGlyph } from './Halo';

interface LiveQuestionProps {
  venue: Venue;
  mode: SunMode;
  onAnswer: (answer: LiveAnswer) => void;
  onDismiss: () => void;
}

/** « Il reste des places au soleil ? » — posée à celui qui est sur place, un tap
 *  pour répondre, un tap pour passer. Elle ne revient pas tant qu'on a répondu. */
export function LiveQuestion({ venue, mode, onAnswer, onDismiss }: LiveQuestionProps) {
  return (
    <div
      role="group"
      aria-label="Question sur place"
      className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+58px)] z-20 rounded-2xl border border-dusk-line bg-dusk-panel p-3.5 text-dusk-shell shadow-[0_8px_24px_rgba(8,20,58,0.55)] animate-scale-in motion-reduce:animate-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12.5px] font-semibold text-dusk-sub">{shortVenueName(venue.name)} · tu es sur place</p>
          <p className="mt-1 text-[16px] font-semibold leading-snug">
            Il reste des places {mode === 'SUN' ? 'au soleil' : "à l'ombre"} ?
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="Pas maintenant"
          className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center text-dusk-sub active:opacity-70"
        >
          ✕
        </button>
      </div>
      <div className="mt-2.5 flex gap-2">
        {LIVE_ANSWERS.map((a) => (
          <button
            key={a.answer}
            onClick={() => onAnswer(a.answer)}
            className="min-h-11 flex-1 rounded-xl border border-dusk-line bg-dusk-deep px-1 py-2 text-[13px] font-semibold active:scale-95 transition-transform motion-reduce:transition-none"
          >
            <LiveGlyph level={a.answer} size={20} className="mx-auto mb-0.5" />
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}
