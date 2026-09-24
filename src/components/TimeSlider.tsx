import { useRef, useCallback, useState } from 'react';
import { formatLisbonTime, lisbonMinutesOfDay, setLisbonTime, snapToQuarter } from '@/utils/lisbonTime';
import { RIBBON_END_MIN, RIBBON_START_MIN } from '@/utils/ribbon';

// ---------------------------------------------------------------------------
// Le curseur d'heure : un trait fin, un rond, l'heure en grand à gauche. On
// glisse le doigt sur la journée et la carte suit (ombres, pastilles). Rien
// d'autre : la lecture de la carte passe par ses couleurs, pas par ce curseur.
// ---------------------------------------------------------------------------

interface TimeSliderProps {
  currentDate: Date;
  onTimeChange: (date: Date) => void;
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  /** Jour : fond clair, encre bleu nuit. Nuit : fond bleu nuit. */
  day: boolean;
  /** L'astuce d'usage, posée sous le curseur tant qu'on n'y touche pas. */
  hint?: string | null;
}

const SPAN = RIBBON_END_MIN - RIBBON_START_MIN;
/** Les repères sous le trait. */
const TICKS = [RIBBON_START_MIN, 12 * 60, 18 * 60, RIBBON_END_MIN];

const pctOf = (min: number) => Math.max(0, Math.min(100, ((min - RIBBON_START_MIN) / SPAN) * 100));
const clock = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export function TimeSlider({ currentDate, onTimeChange, onScrubStart, onScrubEnd, day, hint = null }: TimeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Lu dans les gestionnaires de pointeur : une ref, pas un état (un état
  // lu dans onPointerMove serait celui du rendu d'avant).
  const draggingRef = useRef(false);
  const [active, setActive] = useState(false);

  const nowMin = lisbonMinutesOfDay(currentDate);
  const isNow = Math.abs(currentDate.getTime() - Date.now()) < 90000;
  const pct = pctOf(nowMin);

  const setFromMinutes = useCallback(
    (min: number) => {
      const clamped = Math.max(RIBBON_START_MIN, Math.min(RIBBON_END_MIN, min));
      const { hour, minute } = snapToQuarter(clamped);
      // Le doigt bouge de quelques pixels sans changer de quart d'heure :
      // ne rien émettre, sinon toute la carte se recalcule pour la même heure.
      if (hour * 60 + minute === lisbonMinutesOfDay(currentDate)) return;
      onTimeChange(setLisbonTime(currentDate, hour, minute));
    },
    [currentDate, onTimeChange]
  );

  const posToTime = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return;
      const r = trackRef.current.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      setFromMinutes(RIBBON_START_MIN + p * SPAN);
    },
    [setFromMinutes]
  );

  const onDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true;
      setActive(true);
      onScrubStart?.();
      trackRef.current?.setPointerCapture(e.pointerId);
      posToTime(e.clientX);
    },
    [posToTime, onScrubStart]
  );

  const onMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      posToTime(e.clientX);
    },
    [posToTime]
  );

  const onUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setActive(false);
    onScrubEnd?.();
  }, [onScrubEnd]);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 15 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -15 : 0;
      if (!step) return;
      e.preventDefault();
      setFromMinutes(nowMin + step);
    },
    [nowMin, setFromMinutes]
  );

  const hourColor = day ? 'text-day-ember' : 'text-dusk-glow';
  const subColor = day ? 'text-day-sub' : 'text-dusk-dim';

  return (
    <div className="flex items-start gap-3 px-4">
      <div className="w-[68px] shrink-0 pt-[7px]">
        <span className={`block font-mono text-[22px] font-semibold leading-none tabular-nums ${hourColor}`}>
          {formatLisbonTime(currentDate)}
        </span>
        {!isNow && (
          <button
            onClick={() => onTimeChange(new Date())}
            aria-label="Revenir à maintenant"
            className={`-mb-3 mt-1 min-h-11 whitespace-nowrap text-left text-[12px] font-semibold active:opacity-70 ${subColor}`}
          >
            ← maintenant
          </button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label="Heure de la carte"
          aria-valuemin={RIBBON_START_MIN}
          aria-valuemax={RIBBON_END_MIN}
          aria-valuenow={nowMin}
          aria-valuetext={formatLisbonTime(currentDate)}
          className={`relative flex h-11 cursor-pointer touch-none select-none items-center outline-none focus-visible:ring-2 ${day ? 'focus-visible:ring-day-ember' : 'focus-visible:ring-dusk-glow'}`}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onKeyDown={onKey}
        >
          <div className={`h-[3px] w-full rounded-full ${day ? 'bg-day-line' : 'bg-dusk-line'}`} />
          <div className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ left: `${pct}%` }}>
            <div
              className={`h-[26px] w-[26px] rounded-full border-[3px] transition-transform duration-150 motion-reduce:transition-none ${
                day ? 'border-white bg-dusk-night shadow-[0_1px_5px_rgba(11,26,69,0.5)]' : 'border-dusk-shell bg-dusk-night'
              } ${active ? 'scale-125' : ''}`}
            />
          </div>
        </div>
        <div className={`relative -mt-1.5 h-4 font-mono text-[11px] font-semibold tabular-nums ${subColor}`} aria-hidden="true">
          {TICKS.map((m, i) => (
            <span
              key={m}
              className="absolute"
              style={i === 0 ? { left: 0 } : i === TICKS.length - 1 ? { right: 0 } : { left: `${pctOf(m)}%`, transform: 'translateX(-50%)' }}
            >
              {clock(m)}
            </span>
          ))}
        </div>
        {hint && !active && (
          <p className={`pt-1.5 text-[12px] font-medium ${hourColor}`} role="status">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
