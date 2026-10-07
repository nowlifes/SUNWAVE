import { useMemo, type CSSProperties } from 'react';
import type { GeoPoint, Recommendation, SunMode, Venue } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { VenueSunService } from '@/services/VenueSunService';
import { SunService } from '@/services/SunService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { formatLisbonTime, lisbonMinutesOfDay } from '@/utils/lisbonTime';
import { lightCut } from '@/utils/lightCut';
import { categoryLabel, statusShort, travelLabel } from '@/utils/copy';
import { favGroup, nowFraction, BAND_FROM, BAND_TO, type FavGroup } from '@/utils/carteDuJour';
import { HaloIcon } from './Halo';
import { HourBand } from './HourBand';
import { useCycleScreen } from './useCycleScreen';
import './carteDuJour.css';

// ---------------------------------------------------------------------------
// Favoris = « les horaires du jour » : tous les lieux partagent la même règle
// horaire et un trait « maintenant » qui les traverse. On voit d'un coup
// lesquels sont bons maintenant, plus tard, ou pas aujourd'hui.
// ---------------------------------------------------------------------------

interface SavedScreenProps {
  savedVenues: Venue[];
  currentDate: Date;
  userLocation: GeoPoint;
  onVenueSelect: (venueId: string) => void;
  mode?: SunMode;
}

const RULER = [BAND_FROM, 11, 14, 17, BAND_TO];

interface Row {
  venue: Venue;
  rec: Recommendation;
  group: FavGroup;
}

function rightLabel({ rec, group }: Row): string {
  if (group === 'now') return statusShort(rec, 'SUN');
  if (group === 'off') return "rue à l'ombre";
  if (rec.sunArrivesInMin !== null && rec.sunWindowStart) {
    return `${rec.arrivesTomorrow ? 'demain' : 'dès'} ${rec.sunWindowStart.replace(/^0/, '')}`;
  }
  return 'demain';
}

export function SavedScreen({ savedVenues, currentDate, userLocation, onVenueSelect, mode = 'SUN' }: SavedScreenProps) {
  const cyc = useCycleScreen(currentDate, mode);
  const lightVars = useMemo(() => {
    const cut = lightCut(SunService.getSunAzimuth(currentDate), SunService.getSunElevation(currentDate));
    return { '--sx': `${cut.dx}px`, '--sy': `${cut.dy}px`, '--f': nowFraction(lisbonMinutesOfDay(currentDate)).toFixed(3) } as CSSProperties;
  }, [currentDate]);

  const groups = useMemo(() => {
    const rows: Row[] = savedVenues.map((venue) => {
      const rec = RecommendationService.getRecommendationFor(venue, 'SUN', userLocation, currentDate);
      return { venue, rec, group: favGroup(rec, VenueSunService.getSunExposureByHour(venue, lisbonBuildings, currentDate)) };
    });
    const pick = (g: FavGroup) => rows.filter((r) => r.group === g);
    return {
      now: pick('now').sort((a, b) => (b.rec.sunLeavesInMin ?? 0) - (a.rec.sunLeavesInMin ?? 0)),
      later: pick('later').sort((a, b) => (a.rec.sunArrivesInMin ?? Infinity) - (b.rec.sunArrivesInMin ?? Infinity)),
      off: pick('off'),
    };
  }, [savedVenues, userLocation, currentDate]);

  const card = (row: Row) => (
    <button
      key={row.venue.id}
      type="button"
      className={`cdj-fav${row.group === 'now' ? '' : ` ${row.group}`}`}
      onClick={() => onVenueSelect(row.venue.id)}
      {...cyc.card(row.group === 'now')}
    >
      <div className="h">
        <h3>{row.venue.name}</h3>
        <span className={`t${row.group === 'now' ? ' sun' : ''}`}>{rightLabel(row)}</span>
      </div>
      <p>
        {VenueService.getNeighborhood(row.venue)} · {categoryLabel(row.venue.category).toLowerCase()} · {travelLabel(row.rec)}
      </p>
      <HourBand venue={row.venue} date={currentDate} showNow={false} />
    </button>
  );

  return (
    <div className="cdj h-full overflow-y-auto no-scrollbar pb-24" style={{ ...lightVars, ...cyc.vars }} {...cyc.attrs}>
      <header className="cdj-fhead">
        <h1>Mes lieux, aujourd'hui</h1>
        <p>Quand y aller pour avoir la bonne lumière.</p>
      </header>

      {savedVenues.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-6 py-20">
          <HaloIcon kind="sun" tone="day" alt={30} size={44} className="mb-4" />
          <p className="text-center text-sm font-semibold">Aucun lieu enregistré.</p>
          <p className="mt-1 text-center text-xs text-[color:var(--sub)]">Touche « Garder » sur un lieu pour voir ici ses heures de soleil.</p>
        </div>
      ) : (
        <>
          <div className="cdj-ruler" aria-hidden="true">
            <div>
              {RULER.map((h) => (
                <span key={h} style={{ left: `${((h - BAND_FROM) / (BAND_TO - BAND_FROM)) * 100}%` }}>{h}h</span>
              ))}
            </div>
          </div>
          <div className="cdj-flist">
            <div className="cdj-nowline"><span>{formatLisbonTime(currentDate)}</span></div>
            {groups.now.length > 0 && (
              <>
                <h2 className="cdj-grp"><span className="cdj-dot" aria-hidden="true" />Bons maintenant</h2>
                {groups.now.map(card)}
              </>
            )}
            {groups.later.length > 0 && (
              <>
                <h2 className="cdj-grp"><span className="cdj-dot o" aria-hidden="true" />Plus tard <small>ou au frais</small></h2>
                {groups.later.map(card)}
              </>
            )}
            {groups.off.length > 0 && (
              <>
                <h2 className="cdj-grp"><small>Pas de soleil aujourd'hui</small></h2>
                {groups.off.map(card)}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
