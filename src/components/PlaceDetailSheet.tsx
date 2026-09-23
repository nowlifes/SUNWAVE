import { useState, useCallback, useMemo } from 'react';
import type { Venue, SunMode, Recommendation, ReportType } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { ReportService } from '@/services/ReportService';
import { MapService } from '@/services/MapService';
import { lisbonHour } from '@/utils/lisbonTime';
import { categoryLabel, statusCopy } from '@/utils/copy';

interface PlaceDetailSheetProps {
  venue: Venue;
  mode: SunMode;
  recommendation: Recommendation | null;
  userLocation: { lat: number; lng: number };
  currentDate: Date;
  isSaved: boolean;
  onSave: () => void;
  onClose: () => void;
  onGetDirections: () => void;
}

const REPORT_OPTIONS: { type: ReportType; label: string }[] = [
  { type: 'terrace_shaded', label: "La terrasse est en fait à l'ombre" },
  { type: 'terrace_sunny', label: 'La terrasse est en fait au soleil' },
  { type: 'terrace_missing', label: "Il n'y a pas de terrasse" },
  { type: 'venue_closed', label: 'Le lieu est fermé' },
  { type: 'building_missing', label: 'Un bâtiment manque sur la carte' },
  { type: 'outdoor_different', label: "L'espace extérieur est différent" },
  { type: 'other', label: 'Autre chose' },
];

const PROVENANCE_LABEL = {
  open: 'CIEL DÉGAGÉ',
  estimated: 'ESTIMÉ',
  mixed: 'MIXTE',
  measured: 'MESURÉ',
} as const;

export function PlaceDetailSheet({
  venue,
  mode,
  recommendation,
  userLocation,
  currentDate,
  isSaved,
  onSave,
  onClose,
  onGetDirections,
}: PlaceDetailSheetProps) {
  const [showReport, setShowReport] = useState(false);
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [saved, setSaved] = useState(isSaved);

  const hour = lisbonHour(currentDate);

  // Les chiffres de la fiche sont ceux de l'accueil et de la carte : même
  // calcul, même minute. Elle recomposait les siens et se contredisait.
  const rec = useMemo(
    () => recommendation ?? RecommendationService.getRecommendationFor(venue, mode, userLocation, currentDate),
    [recommendation, venue, mode, userLocation, currentDate]
  );
  const status = statusCopy(rec, mode);
  const displayPct = mode === 'SUN' ? rec.sunPercentage : rec.shadePercentage;

  const neighborhood = VenueService.getNeighborhood(venue);
  const bestTime = RecommendationService.getBestTime(venue, mode, currentDate);

  const handleSave = useCallback(() => {
    setSaved((s) => !s);
    onSave();
  }, [onSave]);

  const handleSubmitReport = useCallback((type: ReportType) => {
    ReportService.submit(venue.id, type);
    setReportSubmitted(true);
    setTimeout(() => {
      setShowReport(false);
      setReportSubmitted(false);
    }, 2500);
  }, [venue.id]);

  // THE BAND. `venue.sunBand` brackets the figure by re-running the shadow
  // geometry with every unmeasured neighbour a storey taller, then shorter.
  // In SHADE mode the band flips with the number: shade = 100 - sun, so the
  // optimistic end of one is the pessimistic end of the other.
  const bandAt = useCallback((h: number) => {
    const lo = venue.sunBand.low[h] ?? 0;
    const hi = venue.sunBand.high[h] ?? 0;
    return mode === 'SUN' ? { lo, hi } : { lo: 100 - hi, hi: 100 - lo };
  }, [venue.sunBand, mode]);

  const nowBand = bandAt(hour);
  const bandWidth = nowBand.hi - nowBand.lo;
  // Under 2 points the range is narrower than the rounding and showing it as
  // "95-96%" reads as precision, which is the opposite of the point.
  const showRange = bandWidth >= 2;

  const prov = venue.heightProvenance;
  const estimatedShare = prov.total > 0 ? prov.estimated / prov.total : 0;
  const provVerdict =
    prov.total === 0 ? 'open' : estimatedShare > 0.5 ? 'estimated' : estimatedShare > 0.2 ? 'mixed' : 'measured';
  const provColor =
    provVerdict === 'estimated' ? 'text-orange-600' : provVerdict === 'mixed' ? 'text-amber-600' : 'text-green-600';

  const sunBars = venue.sunExposureByHour.slice(7, 20).map((pct, i) => {
    const h = i + 7;
    const isCurrent = h === hour;
    return { hour: h, pct, isCurrent };
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="glass rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar">
          {/* Drag handle */}
          <div className="sticky top-0 flex justify-center py-2.5 glass z-10">
            <div className="w-10 h-1.5 rounded-full bg-shade-300" />
          </div>

          {!showReport ? (
            <div className="px-5 pb-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-shade-800">{venue.name}</h2>
                  <p className="text-sm text-shade-500 mt-0.5">{venue.address}</p>
                  <p className="text-xs text-shade-400 mt-0.5">{neighborhood} · {categoryLabel(venue.category)}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-shade-100 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Ce qu'il faut savoir maintenant — la même phrase qu'à l'accueil. */}
              <div className={`flex items-start justify-between gap-3 mb-4 px-4 py-3 rounded-2xl ${mode === 'SUN' ? 'bg-sun-50' : 'bg-shade-100'}`}>
                <div className="min-w-0">
                  <p className="text-base font-bold leading-tight text-shade-900">{status.title}</p>
                  <p className="text-xs text-shade-500 mt-0.5">{status.detail}</p>
                  {bestTime && <p className="text-[11px] text-shade-400 mt-1">Meilleur créneau aujourd'hui : {bestTime.start} → {bestTime.end}</p>}
                </div>
                {rec.isOpen ? (
                  <div className="flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-full bg-green-50">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <span className="text-[10px] font-bold text-green-600">OUVERT</span>
                  </div>
                ) : (
                  <div className="flex shrink-0 items-center gap-1 px-2.5 py-1 rounded-full bg-shade-100">
                    <span className="w-1.5 h-1.5 rounded-full bg-shade-400" />
                    <span className="text-[10px] font-bold text-shade-500">FERMÉ</span>
                  </div>
                )}
              </div>

              {/* Exposition et marche — une seule fois chacune. */}
              <div className="flex flex-wrap items-center gap-2 mb-5">
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full ${mode === 'SUN' ? 'bg-sun-100' : 'bg-shade-200'}`}>
                  <span className="text-sm">{mode === 'SUN' ? '☀' : '🌑'}</span>
                  <span className={`text-sm font-bold ${mode === 'SUN' ? 'text-sun-600' : 'text-shade-600'}`}>
                    {showRange ? `${nowBand.lo}–${nowBand.hi} %` : `${displayPct} %`}
                  </span>
                  <span className="text-[10px] font-medium text-shade-500">{mode === 'SUN' ? 'au soleil' : "à l'ombre"}</span>
                </div>
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-shade-100">
                  <span className="text-sm font-bold text-shade-700">{rec.walkTimeMin} min</span>
                  <span className="text-[10px] font-medium text-shade-500">à pied · {MapService.formatDistance(rec.distanceM)}</span>
                </div>
              </div>

              {/* Sun/shade today bars */}
              <div className="mb-5">
                <h3 className="text-xs font-bold tracking-wider text-shade-500 mb-3">{mode === 'SUN' ? "SOLEIL AUJOURD'HUI" : "OMBRE AUJOURD'HUI"}</h3>
                <div className="space-y-1.5">
                  {sunBars.map(({ hour: h, pct, isCurrent }) => {
                    const barPct = mode === 'SUN' ? pct : venue.shadeExposureByHour[h] || 0;
                    const activeColor = mode === 'SUN' ? 'bg-sun-500' : 'bg-shade-500';
                    const inactiveColor = mode === 'SUN' ? 'bg-sun-300' : 'bg-shade-300';
                    const accentText = mode === 'SUN' ? 'text-sun-600' : 'text-shade-600';
                    const hb = bandAt(h);
                    const rangeColor = mode === 'SUN' ? 'bg-sun-200' : 'bg-shade-200';
                    return (
                      <div key={h} className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium w-8 ${isCurrent ? `${accentText} font-bold` : 'text-shade-400'}`}>
                          {String(h).padStart(2, '0')}:00
                        </span>
                        <div className="relative flex-1 h-3 bg-shade-100 rounded-full overflow-hidden">
                          {/* Three layers, in reading order: what holds however
                              wrong the guessed heights are (solid, up to the
                              low end), how far it could go (pale, to the high
                              end), and the central estimate (tick). Drawing the
                              band UNDER a full-width bar would have hidden its
                              lower half, which is the half that matters. */}
                          <div
                            className={`absolute inset-y-0 left-0 rounded-full smooth-transition ${isCurrent ? activeColor : inactiveColor}`}
                            style={{ width: `${hb.lo}%` }}
                          />
                          <div
                            className={`absolute inset-y-0 ${rangeColor}`}
                            style={{ left: `${hb.lo}%`, width: `${Math.max(0, hb.hi - hb.lo)}%` }}
                          />
                          {hb.hi > hb.lo && (
                            <div
                              className={`absolute inset-y-0 w-0.5 ${activeColor}`}
                              style={{ left: `calc(${barPct}% - 1px)` }}
                            />
                          )}
                        </div>
                        <span className={`text-[10px] font-semibold w-7 text-right ${isCurrent ? accentText : 'text-shade-500'}`}>
                          {barPct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Where this number comes from — provenance of the heights the
                  shadow engine used here, and how far the figure moves with
                  them. Replaces a `confidence` field typed by hand per venue,
                  which knew nothing about the data behind the calculation. */}
              <div className="bg-shade-50 rounded-2xl p-3 mb-5">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold tracking-wider text-shade-400">D'OÙ VIENT CE CHIFFRE</p>
                  <span className={`text-xs font-bold ${provColor}`}>{PROVENANCE_LABEL[provVerdict]}</span>
                </div>

                {prov.total > 0 && (
                  <div className="flex h-1.5 rounded-full overflow-hidden bg-shade-200 mb-2">
                    <span className="bg-green-500" style={{ width: `${(prov.tagged / prov.total) * 100}%` }} />
                    <span className="bg-blue-400" style={{ width: `${(prov.levels / prov.total) * 100}%` }} />
                    <span className="bg-sun-500" style={{ width: `${(prov.estimated / prov.total) * 100}%` }} />
                  </div>
                )}

                <p className="text-[11px] text-shade-500 leading-relaxed">
                  {prov.total === 0
                    ? "Aucun bâtiment n'est assez proche pour faire de l'ombre ici : le chiffre ne repose sur aucune hauteur devinée."
                    : `Sur les ${prov.total} bâtiments testés autour, ${prov.tagged} ont une hauteur mesurée, ${prov.levels} une hauteur déduite du nombre d'étages et ${prov.estimated} une hauteur estimée d'après le quartier.`}
                </p>
                <p className="text-[11px] text-shade-500 leading-relaxed mt-1.5">
                  {showRange
                    ? `Avec ces voisins un étage plus haut ou plus bas, ${
                        mode === 'SUN' ? 'le soleil' : "l'ombre"
                      } varie entre ${nowBand.lo} % et ${nowBand.hi} % — ${bandWidth} points d'écart autour de ${displayPct} %.`
                    : `Monter ou baisser ces voisins d'un étage ne change presque rien : ${
                        bandWidth === 0 ? 'aucun écart' : `${bandWidth} point`
                      } à cette heure.`}
                </p>
              </div>

              {/* Description */}
              <p className="text-sm text-shade-600 leading-relaxed mb-5">{venue.description}</p>

              {/* Action buttons */}
              <div className="flex gap-3 mb-3">
                <button
                  onClick={onGetDirections}
                  className={`flex-1 py-3.5 rounded-2xl font-bold text-sm text-white active:scale-95 transition-transform flex items-center justify-center gap-2 ${
                    mode === 'SUN' ? 'bg-sun-500' : 'bg-shade-600'
                  }`}
                >
                  Y aller
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
                <button
                  onClick={handleSave}
                  className={`px-5 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform ${
                    saved ? 'bg-sun-100 text-sun-600' : 'bg-shade-100 text-shade-600'
                  }`}
                >
                  {saved ? 'Enregistré' : 'Enregistrer'}
                </button>
              </div>

              <button
                onClick={() => setShowReport(true)}
                className="w-full py-2.5 text-xs font-semibold text-shade-400 active:scale-95 transition-transform"
              >
                Signaler une erreur
              </button>
            </div>
          ) : (
            /* Report flow */
            <div className="px-5 pb-8 pt-2">
              {!reportSubmitted ? (
                <>
                  <h3 className="text-xl font-bold text-shade-800 mb-4">Quelque chose cloche ?</h3>
                  <div className="space-y-2">
                    {REPORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.type}
                        onClick={() => handleSubmitReport(opt.type)}
                        className="w-full text-left px-4 py-3.5 rounded-2xl bg-shade-50 text-sm font-medium text-shade-700 active:scale-95 transition-all hover:bg-shade-100"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setShowReport(false)}
                    className="w-full mt-4 py-2.5 text-xs font-semibold text-shade-400"
                  >
                    Annuler
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 animate-scale-in">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="text-lg font-bold text-shade-800">Merci !</p>
                  <p className="text-sm text-shade-500 mt-1 text-center">On s'en sert pour corriger la carte.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
