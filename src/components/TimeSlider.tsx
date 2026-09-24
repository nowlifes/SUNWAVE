import { useRef, useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { SunMode } from '@/types';
import { formatLisbonTime, lisbonMinutesOfDay, setLisbonTime, snapToQuarter } from '@/utils/lisbonTime';
import { RIBBON_END_MIN, RIBBON_START_MIN, type RibbonCell } from '@/utils/ribbon';

// ---------------------------------------------------------------------------
// La bande de lumière EST le curseur d'heure : on glisse le doigt sur la
// journée et la carte suit (ombres, pastilles, titre). Repliée en fine bande
// tant qu'on n'y touche pas, elle s'ouvre sous le doigt avec ses heures.
// ---------------------------------------------------------------------------

interface TimeSliderProps {
  mode: SunMode;
  currentDate: Date;
  onTimeChange: (date: Date) => void;
  /** La journée du quartier, case par demi-heure (voir cityLightCurve). */
  cells: RibbonCell[];
  onScrubStart?: () => void;
  onScrubEnd?: () => void;
  /** À droite de l'heure : la bascule Soleil / Ombre. */
  trailing?: ReactNode;
}

const SPAN = RIBBON_END_MIN - RIBBON_START_MIN;
const GOOD = { SUN: '#FF6A2B', SHADE: '#6EE0D2' } as const;
const NOT = '#2A4590';
const NIGHT = '#08143A';
/** Après le lâcher, la bande reste ouverte le temps de lire l'heure. */
const SETTLE_MS = 1500;

const pctOf = (min: number) => Math.max(0, Math.min(100, ((min - RIBBON_START_MIN) / SPAN) * 100));

export function TimeSlider({ mode, currentDate, onTimeChange, cells, onScrubStart, onScrubEnd, trailing }: TimeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Lu dans les gestionnaires de pointeur : une ref, pas un état (un état
  // lu dans onPointerMove serait celui du rendu d'avant).
  const draggingRef = useRef(false);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => () => {
    if (settleRef.current) clearTimeout(settleRef.current);
  }, []);

  const nowMin = lisbonMinutesOfDay(currentDate);
  const isNow = Math.abs(currentDate.getTime() - Date.now()) < 90000;
  const pct = pctOf(nowMin);
  const good = GOOD[mode];

  const cellStyles = useMemo(
    () =>
      cells.map((c) =>
        c.value === null
          ? { background: NIGHT }
          : c.value >= 50
            ? { background: good, opacity: 0.45 + (0.55 * c.value) / 100 }
            : { background: NOT }
      ),
    [cells, good]
  );

  const setFromMinutes = useCallback(
    (min: number) => {
      const clamped = Math.max(RIBBON_START_MIN, Math.min(RIBBON_END_MIN, min));
      const { hour, minute } = snapToQuarter(clamped);
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
      if (settleRef.current) clearTimeout(settleRef.current);
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
    onScrubEnd?.();
    settleRef.current = setTimeout(() => setActive(false), SETTLE_MS);
  }, [onScrubEnd]);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 15 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -15 : 0;
      if (!step) return;
      e.preventDefault();
      // Pas de onScrubStart au clavier : sans relâcher de pointeur, rien ne
      // dirait quand le glissement finit, et la feuille resterait repliée.
      setFromMinutes(nowMin + step);
    },
    [nowMin, setFromMinutes]
  );

  return (
    <div className="px-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="font-mono text-[22px] font-semibold leading-none tabular-nums text-dusk-shell">
            {formatLisbonTime(currentDate)}
          </span>
          {isNow ? (
            <span className="text-[13px] font-medium text-dusk-sub">maintenant</span>
          ) : (
            <button
              onClick={() => onTimeChange(new Date())}
              aria-label="Revenir à maintenant"
              className="-my-3 min-h-11 whitespace-nowrap px-1 text-[13px] font-semibold text-dusk-glow active:opacity-70"
            >
              ← maintenant
            </button>
          )}
        </div>
        {trailing}
      </div>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Heure de la carte"
        aria-valuemin={RIBBON_START_MIN}
        aria-valuemax={RIBBON_END_MIN}
        aria-valuenow={nowMin}
        aria-valuetext={formatLisbonTime(currentDate)}
        className="relative flex h-11 cursor-pointer touch-none select-none items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-dusk-glow"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={onKey}
      >
        <div
          className={`flex w-full overflow-hidden transition-[height] duration-200 motion-reduce:transition-none ${
            active ? 'h-[26px] rounded' : 'h-2.5 rounded-full'
          }`}
        >
          {cells.map((c, i) => (
            <div key={c.startMin} className="h-full flex-1" style={cellStyles[i]} />
          ))}
        </div>
        <div
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${pct}%` }}
        >
          <div
            className={`rounded-full border-dusk-shell bg-dusk-night shadow-[0_0_0_3px_rgba(11,26,69,0.6)] transition-all duration-200 motion-reduce:transition-none ${
              active ? 'h-7 w-7 border-[5px]' : 'h-4 w-4 border-[3px]'
            }`}
          />
        </div>
      </div>

      <div
        className={`relative -mt-1 h-4 font-mono text-[11px] tabular-nums text-dusk-dim transition-opacity duration-200 motion-reduce:transition-none ${
          active ? 'opacity-100' : 'opacity-0'
        }`}
        aria-hidden="true"
      >
        <span className="absolute left-0">06:00</span>
        <span className="absolute right-0">21:00</span>
      </div>
    </div>
  );
}
