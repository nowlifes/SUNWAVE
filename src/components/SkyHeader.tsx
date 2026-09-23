import type { ReactNode } from 'react';
import type { SunMode } from '@/types';
import { SunService } from '@/services/SunService';
import { formatLisbonTime } from '@/utils/lisbonTime';
import { skyPalette, sunArcProgress } from '@/utils/sky';

// ---------------------------------------------------------------------------
// Le haut de l'écran d'accueil est le ciel de Lisbonne à cette minute : sa
// couleur suit la hauteur du soleil, et le soleil est posé sur sa course du
// lever au coucher. Avant de lire un chiffre, on sait où en est la journée.
// ---------------------------------------------------------------------------

// Géométrie de l'arc, dans le repère du SVG (390 × 200).
const X0 = 28;
const X1 = 362;
const BASE = 178;
const HEIGHT = 128;
const arcPoint = (t: number) => ({ x: X0 + t * (X1 - X0), y: BASE - HEIGHT * Math.sin(Math.PI * t) });
const arcPath = (upTo: number) =>
  Array.from({ length: 61 }, (_, i) => {
    const p = arcPoint((i / 60) * upTo);
    return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
  }).join(' ');
const FULL_ARC = arcPath(1);

interface SkyHeaderProps {
  date: Date;
  sunrise: Date;
  sunset: Date;
  mode: SunMode;
  onModeChange: (mode: SunMode) => void;
  /** La phrase sous l'heure : ce qu'il reste de jour. */
  children: ReactNode;
}

export function SkyHeader({ date, sunrise, sunset, mode, onModeChange, children }: SkyHeaderProps) {
  const sky = skyPalette(SunService.getSunElevation(date));
  const t = sunArcProgress(date, sunrise, sunset);
  const sun = t === null ? null : arcPoint(t);

  return (
    <header
      className="relative overflow-hidden pt-[env(safe-area-inset-top)]"
      style={{ background: `linear-gradient(180deg, ${sky.top} 0%, ${sky.middle} 45%, ${sky.bottom} 88%, #F7F3EC 100%)` }}
    >
      <svg viewBox="0 0 390 200" className="pointer-events-none absolute inset-x-0 bottom-3 w-full" aria-hidden="true">
        <defs>
          <radialGradient id="sky-sun-glow">
            <stop offset="0" stopColor="#FFF4D6" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#FFD58A" stopOpacity="0.5" />
            <stop offset="1" stopColor="#FFD58A" stopOpacity="0" />
          </radialGradient>
        </defs>
        <polyline points={FULL_ARC} fill="none" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="1.5" strokeDasharray="2 5" />
        {t !== null && (
          <polyline points={arcPath(t)} fill="none" stroke="#FFFFFF" strokeOpacity="0.8" strokeWidth="1.5" />
        )}
        {sun && (
          <>
            <circle cx={sun.x} cy={sun.y} r="50" fill="url(#sky-sun-glow)" />
            <circle cx={sun.x} cy={sun.y} r="12" fill="#FFF7E3" />
          </>
        )}
        <line x1="0" y1={BASE} x2="390" y2={BASE} stroke="#FFFFFF" strokeOpacity="0.45" strokeWidth="1" />
        <text x={X0} y={BASE + 16} fontSize="11" fill="#FFFFFF" fillOpacity="0.85">
          {formatLisbonTime(sunrise)}
        </text>
        <text x={X1} y={BASE + 16} fontSize="11" textAnchor="end" fill="#FFFFFF" fillOpacity="0.85">
          {formatLisbonTime(sunset)}
        </text>
      </svg>

      <div className="relative flex min-h-[248px] items-start justify-between gap-3 px-6 pt-10">
        <div className="min-w-0 text-white">
          <p className="text-[13px] font-medium opacity-90">Lisbonne</p>
          <h1 className="mt-0.5 font-serif text-[3.2rem] leading-none tabular-nums">{formatLisbonTime(date)}</h1>
          <p className="mt-2 max-w-[15rem] text-[13.5px] leading-snug opacity-95">{children}</p>
        </div>
        <ModeSwitch mode={mode} onModeChange={onModeChange} />
      </div>
    </header>
  );
}

function ModeSwitch({ mode, onModeChange }: { mode: SunMode; onModeChange: (mode: SunMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Chercher" className="flex shrink-0 rounded-full border border-white/40 bg-ink/25 p-1 backdrop-blur">
      {(['SUN', 'SHADE'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => onModeChange(m)}
          className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
            mode === m ? 'bg-white text-ink' : 'text-white'
          }`}
        >
          {m === 'SUN' ? 'Soleil' : 'Ombre'}
        </button>
      ))}
    </div>
  );
}
