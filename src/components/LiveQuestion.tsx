import { useEffect, useState } from 'react';
import { PSEUDO_MAX, normalizePseudo } from '@/utils/pseudo';
import type { Venue, SunMode } from '@/types';
import type { LiveAnswer } from '@/services/LiveReportService';
import { LIVE_ANSWERS, LIVE_WHY, liveCount, liveLabel, liveQuestion } from '@/utils/live';
import { shortVenueName } from '@/utils/mapGuide';
import { LiveGlyph } from './Halo';

interface LiveQuestionProps {
  venue: Venue;
  mode: SunMode;
  onAnswer: (answer: LiveAnswer) => void;
  onDismiss: () => void;
  /** Après le tap : la réponse donnée, le retour à afficher et le nombre de voix. */
  answered?: { answer: LiveAnswer; thanks: string; total: number; askPseudo?: boolean };
  onDone?: () => void;
  /** Après la toute première réponse : le pseudo choisi, ou null pour « plus tard ». */
  onPseudo?: (pseudo: string | null) => void;
}

/** « Il reste des tables au soleil ? » — posée à celui qui est sur place, un tap
 *  pour répondre, un tap pour passer. Elle ne revient pas tant qu'on a répondu.
 *  Même carte que l'écran Maintenant : crème, bordure encre, ombre dure.
 *  Après le tap, la carte reste 3 s avec un sticker qui dit ce que la réponse a produit. */
export function LiveQuestion({ venue, mode, onAnswer, onDismiss, answered, onDone, onPseudo }: LiveQuestionProps) {
  const askPseudo = !!answered?.askPseudo && !!onPseudo;
  const [draft, setDraft] = useState('');
  const [invalid, setInvalid] = useState(false);
  // Pendant qu'on tape son pseudo, la carte ne se ferme pas toute seule.
  useEffect(() => {
    if (!answered || !onDone || askPseudo) return;
    const t = setTimeout(onDone, 3200);
    return () => clearTimeout(t);
  }, [answered, onDone, askPseudo]);

  const savePseudo = () => {
    const p = normalizePseudo(draft);
    if (!p) {
      setInvalid(true);
      return;
    }
    onPseudo?.(p);
  };

  return (
    <div className="pointer-events-none absolute inset-x-4 top-[calc(env(safe-area-inset-top)+58px)] z-20 flex flex-col gap-3">
      {answered && (
        <p
          role="status"
          className="-rotate-1 self-stretch rounded-[16px] border-[1.5px] border-ink bg-[#FFD28A] px-4 py-3 font-display text-[15px] font-extrabold leading-snug text-ink shadow-[3px_3px_0_#0B1A45] animate-scale-in motion-reduce:animate-none"
        >
          {answered.thanks}
        </p>
      )}
      <div
        role="group"
        aria-label="Question sur place"
        className="pointer-events-auto relative rounded-[20px] border-[1.5px] border-ink bg-cream p-4 text-ink shadow-[4px_4px_0_#0B1A45] animate-scale-in motion-reduce:animate-none"
      >
        {!answered && (
          <button
            onClick={onDismiss}
            aria-label="Pas maintenant"
            className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-white text-[18px] font-bold active:scale-95 transition-transform motion-reduce:transition-none"
          >
            ✕
          </button>
        )}
        <p className="mr-12 text-[10.5px] font-bold uppercase leading-tight tracking-[0.1em] text-day-ember">
          {shortVenueName(venue.name)} · {answered ? 'ta réponse' : 'tu es sur place'}
        </p>
        <p className="mr-12 mt-1.5 font-display text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em] [text-wrap:balance]">
          {liveQuestion(venue.category, mode)}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {LIVE_ANSWERS.map((a, i) => {
            const lit = answered ? answered.answer === a.answer : i === 0;
            return (
              <button
                key={a.answer}
                onClick={() => onAnswer(a.answer)}
                disabled={!!answered}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-[14px] border-[1.5px] border-ink px-1 py-2 font-display text-[13px] font-extrabold leading-[1.1] transition-[transform,box-shadow] motion-reduce:transition-none ${
                  answered
                    ? lit
                      ? 'bg-dusk-fire shadow-[3px_3px_0_#0B1A45]'
                      : 'bg-white opacity-50'
                    : `shadow-[3px_3px_0_#0B1A45] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none ${lit ? 'bg-dusk-fire' : 'bg-white'}`
                }`}
              >
                <LiveGlyph level={a.answer} size={22} tone="day" />
                {liveLabel(a.answer)}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[13px] font-medium leading-snug text-day-sub">
          {answered ? liveCount(answered.total) : LIVE_WHY}
        </p>
        {askPseudo && (
          <form
            className="mt-3 border-t-[1.5px] border-dashed border-ink/30 pt-3"
            onSubmit={(e) => {
              e.preventDefault();
              savePseudo();
            }}
          >
            <label htmlFor="live-pseudo" className="block font-display text-[15px] font-extrabold leading-snug">
              Tu signes tes réponses ?
            </label>
            <p className="mt-0.5 text-[12.5px] leading-snug text-day-sub">Les autres verront « confirmé par … ». Un pseudo, pas ton vrai nom.</p>
            <div className="mt-2 flex gap-2">
              <input
                id="live-pseudo"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setInvalid(false);
                }}
                maxLength={PSEUDO_MAX}
                autoComplete="nickname"
                placeholder="Ton pseudo"
                aria-invalid={invalid}
                className="min-h-11 min-w-0 flex-1 rounded-[12px] border-[1.5px] border-ink bg-white px-3 text-[15px] font-semibold outline-none focus:shadow-[2px_2px_0_#0B1A45]"
              />
              <button
                type="submit"
                className="min-h-11 rounded-[12px] border-[1.5px] border-ink bg-dusk-fire px-4 font-display text-[14px] font-extrabold shadow-[3px_3px_0_#0B1A45] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none transition-[transform,box-shadow] motion-reduce:transition-none"
              >
                OK
              </button>
            </div>
            {invalid && (
              <p role="alert" className="mt-1.5 text-[12.5px] font-semibold text-day-ember">
                Lettres, chiffres, espaces et . _ ' - seulement.
              </p>
            )}
            <button type="button" onClick={() => onPseudo?.(null)} className="mt-1 min-h-11 text-[13px] font-semibold text-day-sub underline underline-offset-2">
              Plus tard
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
