import { useRef, useCallback, useMemo, useState } from 'react';
import type { SunMode } from '@/types';
import { lisbonHour, lisbonMinute, setLisbonTime, snapToQuarter } from '@/utils/lisbonTime';

interface TimeSliderProps {
  mode: SunMode;
  currentDate: Date;
  onTimeChange: (date: Date) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 7);
const MAX_MIN = (20 - 7) * 60;

export function TimeSlider({ mode, currentDate, onTimeChange }: TimeSliderProps) {
  const sliderRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const [expanded, setExpanded] = useState(false);

  const h = lisbonHour(currentDate);
  const m = lisbonMinute(currentDate);
  const accent = mode === 'SUN' ? '#F59E0B' : '#64748B';
  const accentText = mode === 'SUN' ? 'text-sun-600' : 'text-shade-600';
  const accentBg = mode === 'SUN' ? 'bg-sun-500' : 'bg-shade-500';

  const isNow = useMemo(() => Math.abs(currentDate.getTime() - Date.now()) < 90000, [currentDate]);
  const totalMin = (h - 7) * 60 + m;
  const pct = Math.max(0, Math.min(100, (totalMin / MAX_MIN) * 100));
  const nowPct = useMemo(() => {
    const n = new Date();
    return Math.max(0, Math.min(100, ((lisbonHour(n) - 7) * 60 + lisbonMinute(n)) / MAX_MIN * 100));
  }, []);

  const posToTime = useCallback((clientX: number) => {
    if (!sliderRef.current) return;
    const r = sliderRef.current.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    const { hour, minute } = snapToQuarter(7 * 60 + p * MAX_MIN);
    onTimeChange(setLisbonTime(new Date(), hour, minute));
  }, [onTimeChange]);

  const onDown = useCallback((e: React.PointerEvent) => {
    isDragging.current = true;
    setExpanded(true);
    sliderRef.current?.setPointerCapture(e.pointerId);
    posToTime(e.clientX);
  }, [posToTime]);

  const onMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    posToTime(e.clientX);
  }, [posToTime]);

  const onUp = useCallback(() => {
    isDragging.current = false;
    setTimeout(() => setExpanded(false), 2000);
  }, []);

  const fmt = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const trackGrad = mode === 'SUN'
    ? 'linear-gradient(90deg, #FDE68A, #FBBF24 50%, #F59E0B)'
    : 'linear-gradient(90deg, #CBD5E1, #94A3B8 50%, #64748B)';

  return (
    <div className="px-3 pb-1">
      <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-lg px-3 py-2.5 smooth-transition">
        {/* Top row */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold ${accentText}`}>{fmt(h, m)}</span>
            {isNow ? (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${mode === 'SUN' ? 'bg-sun-100 text-sun-700' : 'bg-shade-200 text-shade-600'}`}>MAINTENANT</span>
            ) : (
              <button onClick={() => onTimeChange(new Date())} className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full text-white active:scale-95 transition-transform ${accentBg}`}>
                Revenir à maintenant
              </button>
            )}
          </div>
          {!isNow && !expanded && (
            <span className="text-[10px] text-shade-400">Glisse pour explorer</span>
          )}
        </div>

        {/* Slider track */}
        <div
          ref={sliderRef}
          className="relative h-8 cursor-pointer touch-none select-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="absolute top-3 left-0 right-0 h-1 rounded-full bg-shade-200" />
          <div className="absolute top-3 left-0 h-1 rounded-full smooth-transition" style={{ width: `${pct}%`, background: trackGrad }} />

          {nowPct > 0 && nowPct < 100 && (
            <div className="absolute top-2 w-px h-5 bg-shade-400 opacity-40" style={{ left: `${nowPct}%` }} />
          )}

          <div
            className="absolute top-2 w-5 h-5 rounded-full border-2 border-white shadow-md smooth-transition"
            style={{ left: `calc(${pct}% - 10px)`, background: accent }}
          />

          {/* Hour labels — placés à leur vraie heure sur la piste. En
              `justify-between` ils tombaient à côté : toucher « 18 »
              posait le curseur à 17:45, et le clic du bouton, avalé par
              la capture du pointeur, ne corrigeait rien. Simples libellés :
              le toucher remonte à la piste (par le DOM — ils débordent sous
              elle, donc pas de pointer-events-none), qui arrondit au quart
              d'heure. */}
          <div className="absolute top-7 left-0 right-0 h-3">
            {HOURS.map((hr) => (
              <span
                key={hr}
                className={`absolute -translate-x-1/2 text-[8px] font-medium ${h === hr ? `${accentText} font-bold` : 'text-shade-400'}`}
                style={{ left: `${((hr - 7) * 60 / MAX_MIN) * 100}%` }}
              >
                {String(hr).padStart(2, '0')}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
