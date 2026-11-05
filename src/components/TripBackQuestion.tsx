import type { Venue } from '@/types';
import type { Trip, TripAnswer } from '@/utils/trip';
import { tr } from '@/utils/lang';
import { shortVenueName } from '@/utils/mapGuide';

const ANSWERS: { answer: TripAnswer; label: () => string }[] = [
  { answer: 'yes', label: () => tr('Oui', 'Yes') },
  { answer: 'partly', label: () => tr('En partie', 'Partly') },
  { answer: 'no', label: () => tr('Non', 'No') },
];

interface TripBackQuestionProps {
  trip: Trip;
  venue: Venue;
  onAnswer: (answer: TripAnswer) => void;
  onDismiss: () => void;
}

/** « Tu étais à … , c'était au soleil ? » — posée au retour d'une sortie lancée
 *  par « M'y emmener ». Un tap pour répondre, un tap pour passer. Même carte que
 *  la question sur place (crème, bordure encre, ombre dure, première réponse
 *  jaune), jamais posée en même temps qu'elle. */
export function TripBackQuestion({ trip, venue, onAnswer, onDismiss }: TripBackQuestionProps) {
  const name = shortVenueName(venue.name);
  const sun = trip.mode === 'SUN';
  return (
    <div className="pointer-events-none absolute inset-x-4 top-[calc(env(safe-area-inset-top)+58px)] z-20 flex flex-col gap-3">
      <div
        role="group"
        aria-label={tr('Retour de sortie', 'Back from your trip')}
        className="pointer-events-auto relative rounded-[20px] border-[1.5px] border-ink bg-cream p-4 text-ink shadow-[4px_4px_0_#0B1A45] animate-scale-in motion-reduce:animate-none"
      >
        <button
          onClick={onDismiss}
          aria-label={tr('Pas maintenant', 'Not now')}
          className="absolute right-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-[14px] border-[1.5px] border-ink bg-white text-[18px] font-bold active:scale-95 transition-transform motion-reduce:transition-none"
        >
          ✕
        </button>
        <p className="mr-12 text-[10.5px] font-bold uppercase leading-tight tracking-[0.1em] text-day-ember">{tr('ta sortie', 'your trip')}</p>
        <p className="mr-12 mt-1.5 font-display text-[22px] font-extrabold leading-[1.1] tracking-[-0.02em] [text-wrap:balance]">
          {sun
            ? tr(`Tu étais à ${name}, c’était au soleil ?`, `You were at ${name}. Was it sunny?`)
            : tr(`Tu étais à ${name}, c’était à l’ombre ?`, `You were at ${name}. Was it shady?`)}
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {ANSWERS.map((a, i) => (
            <button
              key={a.answer}
              onClick={() => onAnswer(a.answer)}
              className={`flex min-h-12 items-center justify-center rounded-[14px] border-[1.5px] px-1 py-2 font-display text-[15px] font-extrabold leading-[1.1] transition-[transform,box-shadow] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none motion-reduce:transition-none ${
                i === 0
                  ? 'border-transparent bg-dusk-fire shadow-[0_3px_0_rgba(11,26,69,0.35)]'
                  : 'border-ink bg-white shadow-[3px_3px_0_#0B1A45]'
              }`}
            >
              {a.label()}
            </button>
          ))}
        </div>
        <p className="mt-3 text-[13px] font-medium leading-snug text-day-sub">
          {tr('Ta réponse aide ceux qui hésitent à y aller.', 'Your answer helps anyone wondering whether to go.')}
        </p>
      </div>
    </div>
  );
}
