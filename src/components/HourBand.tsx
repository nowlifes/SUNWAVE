import type { SunMode, Venue } from '@/types';
import { VenueSunService } from '@/services/VenueSunService';
import { SunService } from '@/services/SunService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonMinutesOfDay } from '@/utils/lisbonTime';
import { bandCells, nowFraction } from '@/utils/carteDuJour';

/** La journée d'un lieu, de 8 h à 21 h : une case par heure, orange à mesure
 *  que le soleil est franc, bleu pâle à l'ombre, encre après le coucher.
 *  En mode Ombre (`mode="SHADE"`), le sens s'inverse : bleu franc à mesure que
 *  l'ombre est franche, sable là où le soleil tape. */
export function HourBand({ venue, date, showNow = true, mode = 'SUN' }: { venue: Venue; date: Date; showNow?: boolean; mode?: SunMode }) {
  const cells = bandCells(
    VenueSunService.getSunExposureByHour(venue, lisbonBuildings, date),
    lisbonMinutesOfDay(SunService.getSunset(date))
  );
  return (
    <div className="cdj-bandw" aria-hidden="true">
      <div className={mode === 'SHADE' ? 'cdj-band shade' : 'cdj-band'}>
        {cells.map((c, i) => (
          <span key={i} className={c === 'cool' ? undefined : c} />
        ))}
      </div>
      {showNow && <i className="cdj-now" style={{ left: `${(nowFraction(lisbonMinutesOfDay(date)) * 100).toFixed(1)}%` }} />}
    </div>
  );
}
