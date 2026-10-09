import { useState, useCallback, useMemo, useSyncExternalStore, type CSSProperties } from 'react';
import type { Venue, SunMode, Recommendation, ReportType } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { SunService } from '@/services/SunService';
import { VenueService } from '@/services/VenueService';
import { ReportService } from '@/services/ReportService';
import { liveReports, type LiveAnswer } from '@/services/LiveReportService';
import { LIVE_ANSWERS, LIVE_SHORT, LIVE_WHY, isDaylight, liveAge, liveLabel, liveQuestion, liveWho } from '@/utils/live';
import { formatLisbonTime, lisbonHour } from '@/utils/lisbonTime';
import { categoryLabel, statusCopy, travelParts } from '@/utils/copy';
import { LIGHT } from '@/utils/palette';
import { lightCut } from '@/utils/lightCut';
import { CYCLE, circadian, textOn } from '@/utils/circadian';
import { isNightAt, stateWord } from '@/utils/ficheState';
import { BAND_FROM, BAND_TO } from '@/utils/carteDuJour';
import type { HaloKind } from '@/utils/haloMarkup';
import { Squiggle } from './Squiggle';
import { HaloIcon, LiveGlyph } from './Halo';
import { VoicePile } from './Avatar';
import { FicheSky } from './FicheSky';
import { HourBand, HourLegend } from './HourBand';
import './carteDuJour.css';

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

/** L'état d'une heure dans la grammaire halo (plus d'emoji météo) : ça brille
 *  au soleil, éteint à l'ombre ; la nuit, rien ne brille. */
interface Glyph {
  kind: HaloKind;
  alt: number;
}
const LIT: Glyph = { kind: 'sun', alt: 30 };
const OUT: Glyph = { kind: 'shade', alt: 0 };

/** Coupe et ombre de la minute, posées en variables CSS sur la fiche — même
 *  calcul que l'Explorer et les Favoris (utils/lightCut) : l'heure se lit
 *  dans l'angle de la carte, pas seulement dans le texte. */
function useLightVars(date: Date): CSSProperties {
  return useMemo(() => {
    const cut = lightCut(SunService.getSunAzimuth(date), SunService.getSunElevation(date));
    return {
      '--ang': `${cut.angle}deg`,
      '--cut': `${cut.cut}%`,
      '--sx': `${cut.dx}px`,
      '--sy': `${cut.dy}px`,
    } as CSSProperties;
  }, [date]);
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
  const lightVars = useLightVars(currentDate);
  // Cycle circadien : le ciel du lieu suit l'heure ; la feuille prend la
  // teinte profonde de l'heure, pour que la carte crème se détache.
  const cyc = useMemo(() => (CYCLE ? circadian(currentDate, mode) : null), [currentDate, mode]);
  const ground = cyc?.deep;
  const sheetStyle = useMemo(
    () => (ground ? ({ ...lightVars, '--cyc-ground': ground } as CSSProperties) : lightVars),
    [lightVars, ground]
  );

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
  const status = statusCopy(arrivalRec, mode, arrivalDate);

  // Trois lignes : maintenant, à l'arrivée, puis la prochaine bascule.
  const arrivalIn = inIt(arrivalRec);
  // On arrive de nuit dans la fenêtre : pas de « plus tard » — « dès 19:11
  // nuit » à 5 h 30 annoncerait une nuit déjà là. Hors fenêtre, le soleil
  // de 8 h reste à annoncer.
  const nextChange: { at: string; word: string; glyph: Glyph } | null = isNightAt(arrivalDate) && arrivalIn
    ? null
    : arrivalIn
    ? arrivalRec.sunWindowEnd
      ? { at: arrivalRec.sunWindowEnd, word: arrivalRec.endsAtSunset ? 'Nuit' : opposite, glyph: arrivalRec.endsAtSunset || isSun ? OUT : LIT }
      : null
    : arrivalRec.sunWindowStart && !arrivalRec.arrivesTomorrow
      ? { at: arrivalRec.sunWindowStart, word: wanted, glyph: isSun ? LIT : OUT }
      : null;

  // La nuit, ni « Soleil » ni « Ombre » : c'est la nuit, dans les deux modes.
  const stateOf = (yes: boolean, d: Date): { glyph: Glyph; word: string } => {
    const word = stateWord(yes, isSun, isNightAt(d));
    return { glyph: word === 'Soleil' ? { kind: 'sun', alt: Math.max(1, SunService.getSunElevation(d)) } : OUT, word };
  };
  const nowState = stateOf(inIt(rec), currentDate);
  const arrivalState = stateOf(arrivalIn, arrivalDate);

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

  const hour = lisbonHour(currentDate);
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

  // Même règle que l'ancienne fiche : la phrase-réponse est chaude en mode
  // Soleil (encre-chaude sur crème), sobre en mode Ombre — jamais l'inverse.
  const statusTone = isSun ? 'warm' : 'cool';

  const Row = ({ label, sub, glyph, word, highlight }: { label: string; sub: string; glyph: Glyph; word: string; highlight?: boolean }) => (
    <div className={`cdj-drow${highlight ? ' hi' : ''}`}>
      <span className="lbl">
        <b>{label}</b>
        <span>{sub}</span>
      </span>
      <span className="val">
        <HaloIcon kind={glyph.kind} tone="day" alt={glyph.alt} size={22} />
        {word}
      </span>
    </div>
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-dusk-deep/50 animate-fade-in motion-reduce:animate-none" onClick={onClose} />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 inset-x-0 z-50 animate-slide-up motion-reduce:animate-none">
        <div
          className="cdj cdj-sheet mx-auto max-h-[85vh] max-w-xl overflow-y-auto no-scrollbar"
          style={sheetStyle}
          data-cycle={cyc ? '' : undefined}
          data-fg={ground ? textOn(ground) : undefined}
        >
          {/* Drag handle */}
          <div className="cdj-handle sticky top-0 z-10 flex justify-center bg-day py-2.5">
            <div className="h-1.5 w-10 rounded-full bg-day-line" />
          </div>

          {!showReport ? (
            <div className="pb-6">
              {/* Le ciel du lieu : son soleil, son horizon, son dernier rayon. */}
              <div className="cdj-sheet-hero">
                <FicheSky venue={venue} date={currentDate} cyc={cyc} ground={ground} />
                <button type="button" onClick={onClose} aria-label="Fermer" className="cdj-st">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className={`cdj-card cdj-sheet-card${isSun ? '' : ' shade'}`}>
                {/* En-tête : qui, où, à combien de marche. */}
                <h2 className="cdj-sheet-title">{venue.name}</h2>
                <Squiggle text={venue.name} color={LIGHT.fire} width={Math.min(260, 20 + venue.name.length * 11)} />
                <p className="cdj-sheet-sub">
                  {neighborhood} · {categoryLabel(venue.category)} · {travel.value} {travel.unit}
                </p>

                {/* La réponse : une phrase, lisible en deux secondes. */}
                <p className={`cdj-sheet-status ${statusTone}`}>{status.title}</p>
                <p className="cdj-sheet-open">
                  {rec.isOpen ? 'Ouvert' : 'Fermé'} · {venue.verifiedOnFoot ? 'Vérifié à pied' : 'À vérifier sur place'}
                </p>

                {/* Trois lignes : maintenant, à l'arrivée, plus tard — chacune finit par une heure. */}
                <div className="cdj-rows">
                  <Row label="Maintenant" sub={formatLisbonTime(currentDate)} glyph={nowState.glyph} word={nowState.word} />
                  {walkable && (
                    <Row label="À ton arrivée" sub={formatLisbonTime(arrivalDate)} glyph={arrivalState.glyph} word={arrivalState.word} highlight />
                  )}
                  {nextChange && <Row label="Plus tard" sub={`dès ${nextChange.at}`} glyph={nextChange.glyph} word={nextChange.word} />}
                </div>

                {/* La bande de la journée : le composant signature, partagé avec l'Explorer et les Favoris. */}
                <p className="cdj-rail-label">{isSun ? "Le soleil aujourd'hui" : "L'ombre aujourd'hui"}</p>
                <HourBand venue={venue} date={currentDate} mode={mode} />
                <div className="cdj-ticks" aria-hidden="true">
                  <span>{BAND_FROM}h</span><span>14h</span><span>{BAND_TO}h</span>
                </div>
                <HourLegend date={currentDate} mode={mode} />

                {/* Sur place, en direct : ce que disent ceux qui y sont. Rien tant
                    que personne n'a répondu et qu'on n'est pas soi-même là. */}
                {(live || canAsk) && (
                  <div className="cdj-live">
                    <p className="cdj-live-head">
                      <HaloIcon kind="you" tone="day" size={15} />
                      Sur place, en direct
                    </p>
                    {live && (
                      <p className="cdj-live-now">
                        <VoicePile voices={live.voices} sunByHour={venue.sunExposureByHour} category={venue.category} size={34} />
                        <span>
                          <b>{LIVE_SHORT[live.level]}</b>
                          {' · '}
                          {liveWho(live.count, live.by)}, {liveAge(live.ageMin)}
                        </span>
                      </p>
                    )}
                    {canAsk && !answered && (
                      <>
                        <p className="cdj-live-q">
                          {liveQuestion(venue.category, mode)} {LIVE_WHY}
                        </p>
                        <div className="cdj-live-ask">
                          {LIVE_ANSWERS.map((a) => (
                            <button key={a.answer} type="button" onClick={() => answerLive(a.answer)}>
                              <LiveGlyph level={a.answer} tone="day" size={19} className="mx-auto mb-0.5" />
                              {liveLabel(a.answer)}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {canAsk && answered && <p className="cdj-live-thanks">Merci, les autres le voient</p>}
                  </div>
                )}

                {/* Actions : un bouton plein, un bouton fantôme — même vocabulaire que les tickets de l'Explorer. */}
                <div className="cdj-cta">
                  <button type="button" onClick={onGetDirections}>M'y emmener</button>
                  <button type="button" className="g" onClick={handleSave} aria-pressed={saved}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                      <path d="M7 3.5h10v17l-5-3.5-5 3.5z" />
                    </svg>
                    {saved ? 'Enregistré' : 'Enregistrer'}
                  </button>
                </div>

                {/* Le reste, à la demande : d'où vient le chiffre, ce qu'est le lieu. */}
                <div className="cdj-more-links">
                  <button type="button" onClick={() => setShowMore((v) => !v)}>
                    {showMore ? 'Masquer' : "Plus d'infos"}
                  </button>
                  <span aria-hidden>·</span>
                  <button type="button" onClick={() => setShowReport(true)}>Signaler une erreur</button>
                </div>

                {showMore && (
                  <div className="cdj-more-box">
                    <p>{venue.description}</p>
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
            <div className="cdj-card cdj-sheet-card pt-2">
              {!reportSubmitted ? (
                <>
                  <h3 className="mb-4 font-display text-[1.4rem] font-extrabold [font-stretch:90%]">Quelque chose cloche ?</h3>
                  {REPORT_OPTIONS.map((opt) => (
                    <button key={opt.type} type="button" className="cdj-report-opt" onClick={() => handleSubmitReport(opt.type)}>
                      {opt.label}
                    </button>
                  ))}
                  <button type="button" className="cdj-report-cancel" onClick={() => setShowReport(false)}>Annuler</button>
                </>
              ) : (
                <div className="cdj-report-done animate-scale-in motion-reduce:animate-none">
                  <div className="ok">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--cream)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <b>Merci !</b>
                  <p>On s'en sert pour corriger la carte.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
