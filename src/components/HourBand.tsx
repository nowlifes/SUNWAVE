import type { SunMode, Venue } from '@/types';
import { VenueSunService } from '@/services/VenueSunService';
import { SunService } from '@/services/SunService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonMinutesOfDay, setLisbonTime } from '@/utils/lisbonTime';
import { BAND_FROM, bandCells, nowFraction } from '@/utils/carteDuJour';
import { hourCell, hourTint } from '@/utils/circadian';
import { tr } from '@/utils/lang';

/** La journée d'un lieu, de 8 h à 21 h : une case par heure, de la couleur du
 *  ciel à cette heure (voir hourCell). Le bon moment (soleil en Soleil, ombre
 *  en Ombre) garde la couleur pleine et porte un trait d'encre ; le reste est
 *  voilé, ou sable en Ombre là où le soleil tape. */
export function HourBand({ venue, date, showNow = true, mode = 'SUN' }: { venue: Venue; date: Date; showNow?: boolean; mode?: SunMode }) {
  const sunByHour = VenueSunService.getSunExposureByHour(venue, lisbonBuildings, date);
  const cells = bandCells(sunByHour, lisbonMinutesOfDay(SunService.getSunset(date)));
  return (
    <div className="cdj-bandw" aria-hidden="true">
      <div className="cdj-band">
        {cells.map((c, i) => {
          const h = BAND_FROM + i;
          const cell = hourCell(setLisbonTime(date, h, 30), mode, c === 'night' ? null : (sunByHour[h] ?? 0));
          return <span key={h} className={cell.good ? 'good' : undefined} style={{ background: cell.background }} />;
        })}
      </div>
      {showNow && <i className="cdj-now" style={{ left: `${(nowFraction(lisbonMinutesOfDay(date)) * 100).toFixed(1)}%` }} />}
    </div>
  );
}

/** La légende de la bande, aux couleurs de l'heure affichée (celles de midi la
 *  nuit, pour que « soleil » et « ombre » restent lisibles). */
export function HourLegend({ date, mode }: { date: Date; mode: SunMode }) {
  const night = date.getTime() > SunService.getSunset(date).getTime() || date.getTime() < SunService.getSunrise(date).getTime();
  const at = night ? setLisbonTime(date, 13, 0) : date;
  const good = hourCell(at, mode, mode === 'SUN' ? 100 : 0).background;
  const half = hourCell(at, mode, 25).background;
  const bad = hourCell(at, mode, mode === 'SUN' ? 0 : 100).background;
  const nightTint = hourTint(setLisbonTime(date, 23, 0), mode);
  const items = mode === 'SUN'
    ? [[tr('soleil', 'sun'), good], [tr('un peu', 'a little'), half], [tr('ombre', 'shade'), bad]]
    : [[tr('ombre', 'shade'), good], [tr('un peu', 'a little'), half], [tr('soleil', 'sun'), bad]];
  return (
    <p className="cdj-legend">
      {items.map(([label, bg]) => (
        <span key={label}><i style={{ background: bg }} />{label}</span>
      ))}
      <span><i style={{ background: nightTint }} />{tr('nuit', 'night')}</span>
    </p>
  );
}
