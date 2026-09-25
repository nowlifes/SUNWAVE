import { useEffect } from 'react';
import type { Venue, SunMode } from '@/types';
import type { LiveAnswer } from '@/services/LiveReportService';
import { LIVE_ANSWERS, LIVE_WHY, liveLabel, liveQuestion } from '@/utils/live';
import { shortVenueName } from '@/utils/mapGuide';
import { LiveGlyph } from './Halo';

interface LiveQuestionProps {
  venue: Venue;
  mode: SunMode;
  onAnswer: (answer: LiveAnswer) => void;
  onDismiss: () => void;
}

/** « Il reste des tables au soleil ? » — posée à celui qui est sur place, un tap
 *  pour répondre, un tap pour passer. Elle ne revient pas tant qu'on a répondu.
 *  Même carte que l'écran Maintenant : crème, bordure encre, ombre dure. */
export function LiveQuestion({ venue, mode, onAnswer, onDismiss }: LiveQuestionProps) {
  return (
    <div
      role="group"
      aria-label="Question sur place"
      className="absolute inset-x-4 top-[calc(env(safe-area-inset-top)+58px)] z-20 rounded-[20px] border-[1.5px] border-ink bg-cream p-4 text-ink shadow-[4px_4px_0_#0B1A45] animate-scale-in motion-reduce:animate-none"
    >
      <button
        onClick={onDismiss}
        aria-label="Pas maintenant"
        className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-white text-[18px] font-bold active:scale-95 transition-transform motion-reduce:transition-none"
      >
        ✕
      </button>
      <p className="mr-12 text-[10.5px] font-bold uppercase leading-tight tracking-[0.1em] text-day-ember">
        {shortVenueName(venue.name)} · tu es sur place
      </p>
      <p className="mr-12 mt-1.5 font-display text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em] [text-wrap:balance]">
        {liveQuestion(venue.category, mode)}
      </p>
      <p className="mt-1.5 text-[13px] font-medium leading-snug text-day-sub">{LIVE_WHY}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {LIVE_ANSWERS.map((a, i) => (
          <button
            key={a.answer}
            onClick={() => onAnswer(a.answer)}
            className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-ink px-1 py-2 font-display text-[13px] font-extrabold leading-[1.1] shadow-[3px_3px_0_#0B1A45] transition-[transform,box-shadow] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none motion-reduce:transition-none ${
              i === 0 ? 'bg-dusk-fire' : 'bg-white'
            }`}
          >
            <LiveGlyph level={a.answer} size={22} tone="day" />
            {liveLabel(a.answer)}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Le retour après le tap : un sticker penché qui dit à quoi la réponse a servi. */
export function LiveThanks({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <p
      role="status"
      className="pointer-events-none absolute inset-x-6 top-[calc(env(safe-area-inset-top)+58px)] z-20 -rotate-2 rounded-[16px] border-[1.5px] border-ink bg-[#FFD28A] px-4 py-3 font-display text-[15px] font-extrabold leading-snug text-ink shadow-[3px_3px_0_#0B1A45] animate-scale-in motion-reduce:animate-none"
    >
      Merci — tu viens d'aider ceux qui hésitent.
    </p>
  );
}
