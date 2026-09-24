import { useState, useCallback, useMemo, useSyncExternalStore } from 'react';
import type { Venue, SunMode, Recommendation, ReportType } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { SunService } from '@/services/SunService';
import { VenueService } from '@/services/VenueService';
import { ReportService } from '@/services/ReportService';
import { liveReports, type LiveAnswer } from '@/services/LiveReportService';
import { LIVE_ANSWERS, LIVE_SHORT, isDaylight, liveAge, liveWho } from '@/utils/live';
import { formatLisbonTime, lisbonHour, lisbonMinutesOfDay, setLisbonTime } from '@/utils/lisbonTime';
import { categoryLabel, statusCopy, travelParts } from '@/utils/copy';
import { LIGHT } from '@/utils/palette';
import type { HaloKind } from '@/utils/haloMarkup';
import { Squiggle } from './Squiggle';
import { HaloIcon, LiveGlyph } from './Halo';
import { FicheSky } from './FicheSky';

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

/** L'état d'une heure dans la grammaire halo (plus d'emoji météo) : ça brille
 *  au soleil, éteint à l'ombre ; la nuit, rien ne brille. */
interface Glyph {
  kind: HaloKind;
  alt: number;
}
const LIT: Glyph = { kind: 'sun', alt: 30 };
const OUT: Glyph = { kind: 'shade', alt: 0 };

function hourGlyph(sunPct: number, isNight: boolean, sunAlt: number): Glyph {
  if (isNight) return OUT;
  if (sunPct >= 30) return { kind: 'sun', alt: Math.max(1, sunAlt) };
  return OUT;
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

  // Les réponses de ceux qui sont sur place : l'heure réelle, pas celle du curseur.
  useSyncExternalStore(
    (cb) => liveReports.subscribe(cb),
    () => liveReports.getVersion()
  );
  const liveNow = Date.now();
  const live = liveReports.getState(venue.id, liveNow);
  const inZone = liveReports.isInZone(venue, userLocation);
  const canAsk = inZone && isDaylight(new Date(liveNow));
  const answered = liveReports.hasAnswered(venue.id, liveNow);
  const answerLive = (answer: LiveAnswer) => liveReports.submit(venue, answer, userLocation);

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
  const nextChange: { at: string; word: string; glyph: Glyph } | null = arrivalIn
    ? arrivalRec.sunWindowEnd
      ? { at: arrivalRec.sunWindowEnd, word: arrivalRec.endsAtSunset ? 'Nuit' : opposite, glyph: arrivalRec.endsAtSunset || isSun ? OUT : LIT }
      : null
    : arrivalRec.sunWindowStart && !arrivalRec.arrivesTomorrow
      ? { at: arrivalRec.sunWindowStart, word: wanted, glyph: isSun ? LIT : OUT }
      : null;

  // Après le coucher, « ombre » serait faux : c'est la nuit, pour tout le monde.
  const sunsetMin = lisbonMinutesOfDay(SunService.getSunset(currentDate));
  const isNightAt = (d: Date) => lisbonMinutesOfDay(d) >= sunsetMin;
  const stateOf = (yes: boolean, d: Date): { glyph: Glyph; word: string } =>
    !yes && isSun && isNightAt(d)
      ? { glyph: OUT, word: 'Nuit' }
      : { glyph: yes === isSun ? { kind: 'sun', alt: Math.max(1, SunService.getSunElevation(d)) } : OUT, word: yes ? wanted : opposite };
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

  const Row = ({ label, sub, glyph, word, highlight }: { label: string; sub: string; glyph: Glyph; word: string; highlight?: boolean }) => (
    <div className={`flex items-center justify-between px-4 py-3 ${highlight ? 'bg-day-2' : ''}`}>
      <div>
        <p className="text-[15px] font-medium leading-tight">{label}</p>
        <p className="mt-0.5 font-mono text-xs tabular-nums text-day-sub">{sub}</p>
      </div>
      <div className="flex items-center gap-2 font-semibold">
        <HaloIcon kind={glyph.kind} tone="day" alt={glyph.alt} size={24} />
        {word}
      </div>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-dusk-deep/50 animate-fade-in motion-reduce:animate-none" onClick={onClose} />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 inset-x-0 z-50 animate-slide-up motion-reduce:animate-none">
        <div className="mx-auto max-h-[85vh] max-w-xl overflow-y-auto no-scrollbar rounded-t-[28px] bg-day text-ink shadow-[0_-8px_24px_rgba(8,20,58,0.35)]">
          {/* Drag handle */}
          <div className="sticky top-0 z-10 flex justify-center bg-day py-2.5">
            <div className="h-1.5 w-10 rounded-full bg-day-line" />
          </div>

          {!showReport ? (
            <div className="pb-6">
              {/* Le ciel du lieu : son soleil, son horizon, son dernier rayon. */}
              <div className="relative -mt-1 mb-4">
                <FicheSky venue={venue} date={currentDate} />
                <button
                  onClick={onClose}
                  aria-label="Fermer"
                  className="absolute right-4 top-3 flex h-11 w-11 items-center justify-center rounded-full bg-ink active:scale-90 transition-transform motion-reduce:transition-none"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF6EC" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="px-5">
                {/* En-tête : qui, où, à combien de marche. */}
                <h2 className="font-display text-[2.1rem] font-extrabold leading-[1] tracking-[-0.02em] [font-stretch:90%] [text-wrap:balance]">{venue.name}</h2>
                <Squiggle text={venue.name} color={LIGHT.fire} width={Math.min(260, 20 + venue.name.length * 11)} />
                <p className="mt-1.5 text-sm text-day-sub">
                  {neighborhood} · {categoryLabel(venue.category)} · {travel.value} {travel.unit}
                </p>

                {/* La réponse : une phrase, lisible en deux secondes. */}
                <p className={`mt-4 font-display text-[32px] font-bold leading-[1.05] [font-stretch:90%] ${isSun ? 'text-day-ember' : 'text-ink'}`}>
                  {status.title}
                </p>
                <p className="mt-1.5 text-sm text-day-sub">
                  {rec.isOpen ? 'Ouvert' : 'Fermé'} · {venue.verifiedOnFoot ? 'Vérifié à pied' : 'À vérifier sur place'}
                </p>

                {/* Trois lignes : maintenant, à l'arrivée, plus tard. */}
                <div className="mt-4 divide-y divide-day-line overflow-hidden rounded-2xl border border-day-line">
                  <Row label="Maintenant" sub={formatLisbonTime(currentDate)} glyph={nowState.glyph} word={nowState.word} />
                  {walkable && (
                    <Row label="À ton arrivée" sub={formatLisbonTime(arrivalDate)} glyph={arrivalState.glyph} word={arrivalState.word} highlight />
                  )}
                  {nextChange && <Row label="Plus tard" sub={`dès ${nextChange.at}`} glyph={nextChange.glyph} word={nextChange.word} />}
                </div>

                {/* Les prochaines heures : le halo de chaque heure. */}
                <p className="mb-2 mt-5 text-[13px] font-semibold text-day-sub">Les prochaines heures</p>
                <div className="flex gap-2 overflow-x-auto no-scrollbar">
                  {railHours.map((h, i) => {
                    const at = i === 0 ? currentDate : setLisbonTime(currentDate, h, 30);
                    const g = hourGlyph(venue.sunExposureByHour[h] ?? 0, i === 0 ? isNightAt(currentDate) : h * 60 >= sunsetMin, SunService.getSunElevation(at));
                    return (
                      <div
                        key={h}
                        className={`w-[52px] shrink-0 rounded-2xl py-2.5 text-center font-mono text-xs ${
                          i === 0 ? 'border-[1.5px] border-ink font-bold' : 'border border-day-line text-day-sub'
                        }`}
                      >
                        {i === 0 ? <span className="font-sans">Là</span> : `${h}h`}
                        <span className="mt-1.5 flex justify-center">
                          <HaloIcon kind={g.kind} tone="day" alt={g.alt} size={24} />
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Sur place, en direct : ce que disent ceux qui y sont. Rien tant
                    que personne n'a répondu et qu'on n'est pas soi-même là. */}
                {(live || canAsk) && (
                  <div className="mt-5 rounded-2xl border border-day-line p-4">
                    <p className="flex items-center gap-2 text-[13px] font-semibold text-day-sub">
                      <HaloIcon kind="you" tone="day" size={16} />
                      Sur place, en direct
                    </p>
                    {live && (
                      <p className="mt-2 flex items-center gap-2 text-base leading-snug">
                        <LiveGlyph level={live.level} tone="day" size={20} />
                        <span>
                          <span className="font-semibold">{LIVE_SHORT[live.level]}</span>
                          {' · '}
                          {liveWho(live.count)}, {liveAge(live.ageMin)}
                        </span>
                      </p>
                    )}
                    {canAsk && !answered && (
                      <>
                        <p className="mt-3 text-sm text-day-sub">
                          Il reste des places {isSun ? 'au soleil' : "à l'ombre"} ? Dis-le aux autres
                        </p>
                        <div className="mt-2 flex gap-2">
                          {LIVE_ANSWERS.map((a) => (
                            <button
                              key={a.answer}
                              onClick={() => answerLive(a.answer)}
                              className="min-h-11 flex-1 rounded-2xl border border-day-line bg-day-2 py-2.5 text-[13px] font-semibold active:scale-95 transition-transform motion-reduce:transition-none"
                            >
                              <LiveGlyph level={a.answer} tone="day" size={20} className="mx-auto mb-0.5" />
                              {a.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {canAsk && answered && (
                      <p className="mt-3 rounded-xl bg-day-2 px-3 py-2 text-sm font-semibold">Merci, les autres le voient</p>
                    )}
                  </div>
                )}

                {/* Actions : un seul bouton principal, encre au jour. */}
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={onGetDirections}
                    className="flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-bold text-white active:scale-[0.98] transition-transform motion-reduce:transition-none"
                  >
                    M'y emmener
                  </button>
                  <button
                    onClick={handleSave}
                    aria-label={saved ? 'Retirer des enregistrés' : 'Enregistrer'}
                    aria-pressed={saved}
                    className={`flex h-[52px] w-[52px] items-center justify-center rounded-full border-[1.5px] active:scale-95 transition-transform motion-reduce:transition-none ${
                      saved ? 'border-ink bg-day-2' : 'border-day-line'
                    }`}
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 3.5h10v17l-5-3.5-5 3.5z" />
                    </svg>
                  </button>
                </div>

                {/* Le reste, à la demande : d'où vient le chiffre, ce qu'est le lieu. */}
                <div className="mt-2 flex items-center justify-center gap-1 text-[13px] text-day-sub">
                  <button onClick={() => setShowMore((v) => !v)} className="min-h-11 px-2 active:scale-95 transition-transform motion-reduce:transition-none">
                    {showMore ? 'Masquer' : "Plus d'infos"}
                  </button>
                  <span aria-hidden>·</span>
                  <button onClick={() => setShowReport(true)} className="min-h-11 px-2 active:scale-95 transition-transform motion-reduce:transition-none">
                    Signaler une erreur
                  </button>
                </div>

                {showMore && (
                  <div className="mt-2 space-y-2 rounded-2xl border border-day-line bg-day-2 p-4 text-[13px] leading-relaxed text-day-sub">
                    <p className="text-ink">{venue.description}</p>
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
            </div>
          ) : (
            /* Report flow */
            <div className="px-5 pb-8 pt-2">
              {!reportSubmitted ? (
                <>
                  <h3 className="mb-4 font-display text-[1.6rem] font-bold [font-stretch:90%]">Quelque chose cloche ?</h3>
                  <div className="space-y-2">
                    {REPORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.type}
                        onClick={() => handleSubmitReport(opt.type)}
                        className="min-h-12 w-full rounded-2xl border border-day-line bg-day-2 px-4 py-3 text-left text-sm font-medium active:scale-[0.98] transition-transform motion-reduce:transition-none"
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowReport(false)} className="mt-4 min-h-11 w-full text-[13px] font-semibold text-day-sub">
                    Annuler
                  </button>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 animate-scale-in motion-reduce:animate-none">
                  <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-ink">
                    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#FFF6EC" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <p className="font-display text-[1.4rem] font-bold">Merci !</p>
                  <p className="mt-1 text-center text-sm text-day-sub">On s'en sert pour corriger la carte.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
