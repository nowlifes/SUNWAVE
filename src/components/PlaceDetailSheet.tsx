import { useState, useCallback, useMemo } from 'react';
import type { Venue, SunMode, Recommendation, ReportType } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { SunService } from '@/services/SunService';
import { VenueService } from '@/services/VenueService';
import { ReportService } from '@/services/ReportService';
import { formatLisbonTime, lisbonHour, lisbonMinutesOfDay } from '@/utils/lisbonTime';
import { categoryLabel, statusCopy, travelParts } from '@/utils/copy';

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

const RAIL_HOURS = 6;

/** Le langage de toutes les applis météo : on lit une icône, pas un pourcentage. */
function skyEmoji(sunPct: number, isNight: boolean, isSunsetHour: boolean): string {
  if (isNight) return '🌙';
  if (isSunsetHour) return '🌅';
  if (sunPct >= 60) return '☀️';
  if (sunPct >= 30) return '🌤️';
  return '🌑';
}

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
  const [showMore, setShowMore] = useState(false);

  const isSun = mode === 'SUN';
  const hour = lisbonHour(currentDate);

  // Les chiffres de la fiche sont ceux de l'accueil et de la carte : même
  // calcul, même minute. Elle recomposait les siens et se contredisait.
  const rec = useMemo(
    () => recommendation ?? RecommendationService.getRecommendationFor(venue, mode, userLocation, currentDate),
    [recommendation, venue, mode, userLocation, currentDate]
  );

  // Ce qui compte, c'est l'état à l'arrivée, pas celui de maintenant : douze
  // minutes de marche suffisent à faire perdre le soleil à une terrasse.
  const travel = travelParts(rec);
  const walkable = travel.unit === 'min à pied' && rec.walkTimeMin >= 1;
  const arrivalDate = useMemo(
    () => new Date(currentDate.getTime() + rec.walkTimeMin * 60_000),
    [currentDate, rec.walkTimeMin]
  );
  const arrivalRec = useMemo(
    () =>
      walkable
        ? RecommendationService.getRecommendationFor(venue, mode, userLocation, arrivalDate)
        : rec,
    [walkable, venue, mode, userLocation, arrivalDate, rec]
  );

  const wanted = isSun ? 'Soleil' : 'Ombre';
  const opposite = isSun ? 'Ombre' : 'Soleil';
  const inIt = (r: Recommendation) => r.sunLeavesInMin !== null;
  const status = statusCopy(arrivalRec, mode);

  // Trois lignes : maintenant, à l'arrivée, puis la prochaine bascule.
  const arrivalIn = inIt(arrivalRec);
  const nextChange = arrivalIn
    ? arrivalRec.sunWindowEnd
      ? { at: arrivalRec.sunWindowEnd, word: arrivalRec.endsAtSunset ? 'Nuit' : opposite, emoji: '🌙' }
      : null
    : arrivalRec.sunWindowStart && !arrivalRec.arrivesTomorrow
      ? { at: arrivalRec.sunWindowStart, word: wanted, emoji: isSun ? '☀️' : '🌑' }
      : null;

  // Après le coucher, « ombre » serait faux : c'est la nuit, pour tout le monde.
  const sunsetMin = lisbonMinutesOfDay(SunService.getSunset(currentDate));
  const isNightAt = (d: Date) => lisbonMinutesOfDay(d) >= sunsetMin;
  const stateOf = (yes: boolean, d: Date) =>
    !yes && isSun && isNightAt(d)
      ? { emoji: '🌙', word: 'Nuit' }
      : yes === isSun
        ? { emoji: '☀️', word: yes ? wanted : opposite }
        : { emoji: '🌑', word: yes ? wanted : opposite };
  const nowState = stateOf(inIt(rec), currentDate);
  const arrivalState = stateOf(arrivalIn, arrivalDate);
  const railHours = Array.from({ length: RAIL_HOURS }, (_, i) => hour + i).filter((h) => h <= 23);

  const neighborhood = VenueService.getNeighborhood(venue);

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

  // `venue.sunBand` encadre le chiffre en refaisant le calcul d'ombre avec
  // chaque voisin non mesuré un étage plus haut, puis plus bas. En mode Ombre
  // la bande se retourne avec le chiffre : ombre = 100 − soleil.
  const bandAt = useCallback((h: number) => {
    const lo = venue.sunBand.low[h] ?? 0;
    const hi = venue.sunBand.high[h] ?? 0;
    return isSun ? { lo, hi } : { lo: 100 - hi, hi: 100 - lo };
  }, [venue.sunBand, isSun]);

  const displayPct = isSun ? rec.sunPercentage : rec.shadePercentage;
  const nowBand = bandAt(hour);
  const bandWidth = nowBand.hi - nowBand.lo;
  // Sous 2 points la marge est plus étroite que l'arrondi : « 95-96 % » aurait
  // l'air précis, l'inverse de ce qu'on veut dire.
  const showRange = bandWidth >= 2;

  const prov = venue.heightProvenance;
  const estimatedShare = prov.total > 0 ? prov.estimated / prov.total : 0;
  const provVerdict =
    prov.total === 0 ? 'open' : estimatedShare > 0.5 ? 'estimated' : estimatedShare > 0.2 ? 'mixed' : 'measured';
  const reliability = {
    open: "Rien de haut autour : le chiffre ne dépend d'aucune hauteur devinée.",
    measured: 'Les immeubles voisins sont mesurés : le chiffre est fiable.',
    mixed: 'Une partie des immeubles voisins est estimée : le chiffre est assez fiable.',
    estimated: 'Les immeubles voisins sont surtout estimés, pas mesurés : le chiffre est approximatif.',
  }[provVerdict];

  const rowBase = 'flex items-center justify-between px-4 py-3';
  const Row = ({ label, sub, emoji, word, highlight }: { label: string; sub: string; emoji: string; word: string; highlight?: boolean }) => (
    <div className={`${rowBase} ${highlight ? (isSun ? 'bg-sun-100/70' : 'bg-shade-200/70') : ''}`}>
      <div>
        <p className="text-[15px] font-medium text-shade-800 leading-tight">{label}</p>
        <p className="text-xs text-shade-400 mt-0.5 tabular-nums">{sub}</p>
      </div>
      <div className="flex items-center gap-2 font-semibold text-shade-800">
        <span className="text-2xl leading-none">{emoji}</span>
        {word}
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40 animate-fade-in"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 inset-x-0 z-50 animate-slide-up">
        <div className="glass mx-auto max-w-xl rounded-t-3xl shadow-2xl max-h-[85vh] overflow-y-auto no-scrollbar">
          {/* Drag handle */}
          <div className="sticky top-0 flex justify-center py-2.5 glass z-10">
            <div className="w-10 h-1.5 rounded-full bg-shade-300" />
          </div>

          {!showReport ? (
            <div className="px-5 pb-6">
              {/* En-tête : qui, où, à combien de marche. */}
              <div className="flex items-start justify-between gap-3 pt-1">
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-2xl font-bold leading-tight text-shade-900">{venue.name}</h2>
                  <p className="text-sm text-shade-500 mt-1">
                    {neighborhood} · {categoryLabel(venue.category)} · {travel.value} {travel.unit}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Fermer"
                  className="w-9 h-9 shrink-0 rounded-full bg-shade-100 flex items-center justify-center active:scale-90 transition-transform"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2.5" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* La réponse : une phrase, lisible en deux secondes. */}
              <p className={`font-display text-[32px] font-bold leading-[1.05] mt-4 ${isSun ? 'text-ember' : 'text-shade-700'}`}>
                {status.title}
              </p>
              <p className="text-sm text-shade-500 mt-1.5">
                {rec.isOpen ? 'Ouvert' : 'Fermé'} · {venue.verifiedOnFoot ? '✓ Vérifié à pied' : 'À vérifier sur place'}
              </p>

              {/* Trois lignes : maintenant, à l'arrivée, plus tard. */}
              <div className="mt-4 rounded-2xl bg-shade-50 overflow-hidden divide-y divide-shade-100">
                <Row label="Maintenant" sub={formatLisbonTime(currentDate)} emoji={nowState.emoji} word={nowState.word} />
                {walkable && (
                  <Row label="À ton arrivée" sub={formatLisbonTime(arrivalDate)} emoji={arrivalState.emoji} word={arrivalState.word} highlight />
                )}
                {nextChange && (
                  <Row label="Plus tard" sub={`dès ${nextChange.at}`} emoji={nextChange.emoji} word={nextChange.word} />
                )}
              </div>

              {/* Les prochaines heures, comme une appli météo. */}
              <p className="text-[13px] font-semibold text-shade-500 mt-5 mb-2">Les prochaines heures</p>
              <div className="flex gap-2 overflow-x-auto no-scrollbar">
                {railHours.map((h, i) => (
                  <div
                    key={h}
                    className={`shrink-0 w-[52px] text-center py-2.5 rounded-2xl text-xs ${
                      i === 0 ? 'bg-sun-100 text-shade-900 font-bold ring-2 ring-sun-500' : 'bg-shade-50 text-shade-500'
                    }`}
                  >
                    {i === 0 ? 'Là' : `${h}h`}
                    <span className="block text-[22px] leading-tight mt-1">
                      {skyEmoji(venue.sunExposureByHour[h] ?? 0, i === 0 ? isNightAt(currentDate) : h * 60 >= sunsetMin, h === Math.floor(sunsetMin / 60))}
                    </span>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={onGetDirections}
                  className={`flex-1 h-[52px] rounded-2xl font-bold text-base active:scale-95 transition-transform flex items-center justify-center gap-2 ${
                    isSun ? 'bg-sun-500 text-sun-900' : 'bg-shade-600 text-white'
                  }`}
                >
                  Y aller
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
                <button
                  onClick={handleSave}
                  aria-label={saved ? 'Retirer des enregistrés' : 'Enregistrer'}
                  className={`w-[52px] h-[52px] rounded-2xl text-xl active:scale-95 transition-transform ${
                    saved ? 'bg-sun-100 text-sun-600' : 'bg-shade-100 text-shade-500'
                  }`}
                >
                  {saved ? '♥' : '♡'}
                </button>
              </div>

              {/* Le reste, à la demande : d'où vient le chiffre, ce qu'est le lieu. */}
              <div className="mt-4 flex items-center justify-center gap-3 text-[13px] text-shade-400">
                <button onClick={() => setShowMore((v) => !v)} className="active:scale-95 transition-transform">
                  {showMore ? 'Masquer' : "Plus d'infos"}
                </button>
                <span aria-hidden>·</span>
                <button onClick={() => setShowReport(true)} className="active:scale-95 transition-transform">
                  Signaler une erreur
                </button>
              </div>

              {showMore && (
                <div className="mt-3 rounded-2xl bg-shade-50 p-4 space-y-2 text-[13px] leading-relaxed text-shade-500">
                  <p className="text-shade-600">{venue.description}</p>
                  <p>{reliability}</p>
                  {prov.total > 0 && (
                    <p>
                      {prov.total} bâtiments autour : {prov.tagged} mesurés, {prov.levels} déduits des étages, {prov.estimated} estimés.
                    </p>
                  )}
                  <p>
                    {showRange
                      ? `Un étage de plus ou de moins chez les voisins ferait varier ${isSun ? 'le soleil' : "l'ombre"} de ${nowBand.lo} % à ${nowBand.hi} % en ce moment (${displayPct} % calculé).`
                      : `Un étage de plus ou de moins chez les voisins ne change presque rien à cette heure (${displayPct} %).`}
                  </p>
                </div>
              )}
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
