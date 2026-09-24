import { useMemo } from 'react';
import type { SunMode, Venue } from '@/types';
import { IN_IT_THRESHOLD } from '@/services/RecommendationService';
import { VenueSunService } from '@/services/VenueSunService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonMinutesOfDay } from '@/utils/lisbonTime';
import { RIBBON_END_MIN, RIBBON_START_MIN, ribbonCells } from '@/utils/ribbon';
import { DAY, LIGHT, NIGHT } from '@/utils/palette';

// ---------------------------------------------------------------------------
// La bande de lumière — la journée d'un lieu d'un seul coup d'œil : quand le
// soleil (ou l'ombre) arrive, quand il part, et où on en est. Chaque lieu a
// la sienne ; c'est ce qui les distingue quand ils partagent le même
// pourcentage à cette minute.
// ---------------------------------------------------------------------------

// Un seul bleu, une seule lumière : le soleil est braise, l'ombre est le bleu
// clair du palier (jamais une autre couleur), la nuit est la nuit.
const PALETTE = {
  day: { good: { SUN: LIGHT.fire, SHADE: DAY.sky2 }, none: '#D9E0F1', night: NIGHT.night, now: 'bg-ink', label: 'text-day-sub', nowLabel: 'text-ink' },
  night: { good: { SUN: LIGHT.fire, SHADE: NIGHT.sub }, none: NIGHT.p3, night: NIGHT.deep, now: 'bg-dusk-shell', label: 'text-dusk-dim', nowLabel: 'text-dusk-shell' },
} as const;

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
  tone?: 'day' | 'night';
}

export function DayRibbon({ venue, mode, date, sunrise, sunset, size = 'full', hideNow = false, tone = 'day' }: DayRibbonProps) {
  const { good, none, night, now, label, nowLabel } = PALETTE[tone];
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
      <div className={`flex h-full overflow-hidden ${full ? 'gap-[1.5px] rounded' : 'rounded-full'}`}>
        {cells.map((c) => (
          <div
            key={c.startMin}
            className="h-full flex-1"
            style={
              c.value === null
                ? { background: night }
                : c.value === 0
                  ? { background: none }
                  : { background: good[mode], opacity: 0.25 + (0.75 * c.value) / 100 }
            }
          />
        ))}
      </div>
      {showNow && (
        <div
          className={`absolute ${full ? '-top-1.5 -bottom-1.5 w-[3px]' : 'inset-y-0 w-[1.5px]'} -translate-x-1/2 rounded-full ${now}`}
          style={{ left: pct(nowMin) }}
        />
      )}
    </div>
  );

  if (!full) return bar;

  return (
    <div role="img" aria-label={ribbonLabel(cells, mode)}>
      {bar}
      <div className={`relative mt-2 h-4 font-mono text-[11px] tabular-nums ${label}`}>
        {/* Les bornes s'effacent quand « maintenant » les recouvrirait. */}
        {(!showNow || nowMin - RIBBON_START_MIN > 150) && <span className="absolute left-0">06:00</span>}
        {showNow && (
          <span
            className={`absolute -translate-x-1/2 whitespace-nowrap font-sans font-bold ${nowLabel}`}
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
  const good = cells.filter((c) => c.value !== null && c.value >= IN_IT_THRESHOLD[mode]);
  if (good.length === 0) return `Pas ${mode === 'SUN' ? 'de soleil' : "d'ombre"} franc aujourd'hui`;
  const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  return `${mode === 'SUN' ? 'Soleil' : 'Ombre'} de ${hhmm(good[0].startMin)} à ${hhmm(good[good.length - 1].startMin + 30)}`;
}
