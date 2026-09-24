import type { ReactNode } from 'react';
import type { SunMode } from '@/types';
import { SunService } from '@/services/SunService';
import { formatLisbonTime } from '@/utils/lisbonTime';
import { SHADE_SKY, skyPalette, sunArcProgress } from '@/utils/sky';
import { LIGHT, NIGHT } from '@/utils/palette';
import { haloLook } from '@/utils/halo';

// ---------------------------------------------------------------------------
// Le haut de l'écran d'accueil est le ciel de Lisbonne à cette minute : des
// strates du même bleu qui suivent la hauteur du soleil, et le soleil posé sur
// sa course du lever au coucher. Avant de lire un chiffre, on sait où en est
// la journée. En mode Ombre l'écran est de nuit : le ciel aussi.
// ---------------------------------------------------------------------------

// Géométrie de l'arc, dans le repère du SVG (390 × 250).
const W = 390;
const H = 250;
const X0 = 28;
const X1 = 362;
const BASE = 238;
const HEIGHT = 150;
/** Hauteur de chaque strate, du zénith à l'horizon. */
const BAND_H = [110, 46, 38, 30, 26];
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
  /** La rive où l'on est — « Lisbonne » à Caparica était faux. */
  place: string;
  /** La phrase sous l'heure : ce qu'il reste de jour. */
  children: ReactNode;
}

export function SkyHeader({ date, sunrise, sunset, mode, onModeChange, place, children }: SkyHeaderProps) {
  const night = mode === 'SHADE';
  const elevation = SunService.getSunElevation(date);
  const sky = night ? SHADE_SKY : skyPalette(elevation);
  const t = sunArcProgress(date, sunrise, sunset);
  const sun = t === null ? null : arcPoint(t);
  let y = 0;
  const bands = sky.bands.map((fill, i) => {
    const band = { y, h: BAND_H[i], fill };
    y += BAND_H[i];
    return band;
  });
  const ink = night ? NIGHT.sub : NIGHT.night;

  return (
    <header className="relative overflow-hidden pt-[env(safe-area-inset-top)]" style={{ background: sky.top }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="pointer-events-none absolute inset-x-0 bottom-0 block w-full" aria-hidden="true">
        {bands.map((b) => (
          <rect key={b.y} x="0" y={b.y} width={W} height={b.h} fill={b.fill} />
        ))}
        <polyline
          points={FULL_ARC}
          fill="none"
          stroke={night ? NIGHT.sub : NIGHT.night}
          strokeOpacity={night ? 0.35 : 0.28}
          strokeWidth="1.5"
          strokeDasharray="2 5"
        />
        {t !== null && !night && (
          <polyline points={arcPath(t)} fill="none" stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="2" />
        )}
        {sun && <SkySun x={sun.x} y={sun.y} night={night} elevation={elevation} />}
        <text x={X0} y={BASE + 8} fontSize="11" fontWeight="600" fill={ink} className="font-mono">
          {formatLisbonTime(sunrise)}
        </text>
        <text x={X1} y={BASE + 8} fontSize="11" fontWeight="600" textAnchor="end" fill={ink} className="font-mono">
          {formatLisbonTime(sunset)}
        </text>
      </svg>

      <div className="relative flex min-h-[250px] items-start justify-between gap-3 pl-6 pr-5 pt-[46px]">
        <div className={`min-w-0 ${night ? 'text-dusk-shell' : 'text-white'}`}>
          <p className="text-[13px] font-semibold">{place}</p>
          <h1 className="mt-0.5 font-mono text-[38px] font-semibold leading-none tracking-[-0.02em] tabular-nums">
            {formatLisbonTime(date)}
          </h1>
          <p className="mt-2 max-w-[13.5rem] text-[13.5px] leading-snug">{children}</p>
        </div>
        <ModeSwitch mode={mode} onModeChange={onModeChange} />
      </div>
    </header>
  );
}

/** Le disque du ciel : même halo que partout ; plus le soleil est haut, plus
 *  il est large et pâle. Sur fond clair le disque reste braise. */
function SkySun({ x, y, night, elevation }: { x: number; y: number; night: boolean; elevation: number }) {
  const look = haloLook(Math.max(elevation, 1));
  const glowR = 28 + 26 * look.glow;
  if (night) {
    return (
      <>
        <circle cx={x} cy={y} r={glowR - 4} fill={look.color} fillOpacity="0.16" />
        <circle cx={x} cy={y} r="17" fill={look.color} fillOpacity="0.9" />
      </>
    );
  }
  return (
    <>
      <defs>
        <radialGradient id="sky-sun-glow">
          <stop offset="0.3" stopColor={look.color} stopOpacity="0.75" />
          <stop offset="1" stopColor={look.color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={x} cy={y} r={glowR} fill="url(#sky-sun-glow)" />
      <circle cx={x} cy={y} r="17" fill={LIGHT.fire} />
    </>
  );
}

function ModeSwitch({ mode, onModeChange }: { mode: SunMode; onModeChange: (mode: SunMode) => void }) {
  const night = mode === 'SHADE';
  return (
    <div
      role="radiogroup"
      aria-label="Chercher"
      className="flex shrink-0 rounded-full p-1"
      style={{ background: night ? NIGHT.deep : NIGHT.night }}
    >
      {(['SUN', 'SHADE'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => onModeChange(m)}
          className="min-h-10 rounded-full px-4 text-[13px] font-bold transition-colors duration-300 motion-reduce:transition-none"
          style={
            mode === m
              ? { background: m === 'SUN' ? LIGHT.fire : NIGHT.sub, color: NIGHT.night }
              : { background: 'transparent', color: NIGHT.shell }
          }
        >
          {m === 'SUN' ? 'Soleil' : 'Ombre'}
        </button>
      ))}
    </div>
  );
}

