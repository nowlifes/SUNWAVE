import { useMemo } from 'react';
import type { SunMode, Venue } from '@/types';
import { VenueSunService } from '@/services/VenueSunService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonMinutesOfDay } from '@/utils/lisbonTime';
import { RIBBON_END_MIN, RIBBON_START_MIN, ribbonCells } from '@/utils/ribbon';

// ---------------------------------------------------------------------------
// La bande de lumière — la journée d'un lieu d'un seul coup d'œil : quand le
// soleil (ou l'ombre) arrive, quand il part, et où on en est. Chaque lieu a
// la sienne ; c'est ce qui les distingue quand ils partagent le même
// pourcentage à cette minute.
// ---------------------------------------------------------------------------

const GOOD = { SUN: '#F59E0B', SHADE: '#2F6FA6' } as const;
const NONE = '#E4DED3';
const NIGHT = '#1E3A5F';

const span = RIBBON_END_MIN - RIBBON_START_MIN;
const pct = (min: number) => `${((min - RIBBON_START_MIN) / span) * 100}%`;

interface DayRibbonProps {
  venue: Venue;
  mode: SunMode;
  date: Date;
  sunrise: Date;
  sunset: Date;
  /** Bande pleine largeur avec heures, ou miniature de ligne de liste. */
  size?: 'full' | 'mini';
  /** La journée montrée n'est pas celle de maintenant (la nuit : demain). */
  hideNow?: boolean;
}

export function DayRibbon({ venue, mode, date, sunrise, sunset, size = 'full', hideNow = false }: DayRibbonProps) {
  const cells = useMemo(
    () =>
      ribbonCells(
        VenueSunService.getSunExposureByQuarter(venue, lisbonBuildings, date),
        mode,
        lisbonMinutesOfDay(sunrise),
        lisbonMinutesOfDay(sunset)
      ),
    [venue, mode, date, sunrise, sunset]
  );
  const nowMin = lisbonMinutesOfDay(date);
  const showNow = !hideNow && nowMin >= RIBBON_START_MIN && nowMin <= RIBBON_END_MIN;
  const full = size === 'full';

  const bar = (
    <div className={`relative ${full ? 'h-[26px]' : 'h-2 w-16 shrink-0'}`}>
      <div className={`flex h-full overflow-hidden ${full ? 'rounded' : 'rounded-full'}`}>
        {cells.map((c) => (
          <div
            key={c.startMin}
            className="h-full flex-1"
            style={
              c.value === null
                ? { background: NIGHT, opacity: 0.85 }
                : c.value === 0
                  ? { background: NONE }
                  : { background: GOOD[mode], opacity: 0.25 + (0.75 * c.value) / 100 }
            }
          />
        ))}
      </div>
      {showNow && (
        <div
          className={`absolute ${full ? '-top-1.5 -bottom-1.5 w-0.5' : 'inset-y-0 w-[1.5px]'} -translate-x-1/2 rounded-full bg-ink`}
          style={{ left: pct(nowMin) }}
        />
      )}
    </div>
  );

  if (!full) return bar;

  return (
    <div role="img" aria-label={ribbonLabel(cells, mode)}>
      {bar}
      <div className="relative mt-2 h-4 text-[11px] tabular-nums text-mute">
        {/* Les bornes s'effacent quand « maintenant » les recouvrirait. */}
        {(!showNow || nowMin - RIBBON_START_MIN > 150) && <span className="absolute left-0">06:00</span>}
        {showNow && (
          <span
            className="absolute -translate-x-1/2 font-semibold text-ink"
            style={{ left: `clamp(2.5rem, ${pct(nowMin)}, calc(100% - 2.5rem))` }}
          >
            maintenant
          </span>
        )}
        {(!showNow || RIBBON_END_MIN - nowMin > 150) && <span className="absolute right-0">21:00</span>}
      </div>
    </div>
  );
}

/** Ce que la bande montre, dit à voix haute pour un lecteur d'écran. */
function ribbonLabel(cells: { startMin: number; value: number | null }[], mode: SunMode): string {
  const good = cells.filter((c) => c.value !== null && c.value >= 40);
  if (good.length === 0) return `Pas ${mode === 'SUN' ? 'de soleil' : "d'ombre"} franc aujourd'hui`;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `${mode === 'SUN' ? 'Soleil' : 'Ombre'} de ${hhmm(good[0].startMin)} à ${hhmm(good[good.length - 1].startMin + 30)}`;
}
