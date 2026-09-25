import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GeoPoint, Recommendation, SunMode } from '@/types';
import { IN_IT_THRESHOLD, RecommendationService } from '@/services/RecommendationService';
import { ReliefService } from '@/services/ReliefService';
import { SunService } from '@/services/SunService';
import { VenueService } from '@/services/VenueService';
import { SunTrailService, type SunTrail } from '@/services/SunTrailService';
import { SunsetService } from '@/services/SunsetService';
import { SunsetScreen } from './SunsetScreen';
import { DayRibbon } from './DayRibbon';
import { SkyHeader } from './SkyHeader';
import { formatLisbonTime } from '@/utils/lisbonTime';
import { categoryLabel, formatGap, placeName, statusCopy, statusShort, travelLabel, venueCountLine } from '@/utils/copy';
import { inviteText, inviteUrl, shareInvite } from '@/utils/share';
import { LIGHT, NIGHT } from '@/utils/palette';
import { HaloIcon } from './Halo';
import { lightCut } from '@/utils/lightCut';

// ---------------------------------------------------------------------------
// L'écran réponse — l'écran d'accueil.
//
// Tous les concurrents de la catégorie s'arrêtent à une carte filtrée et
// laissent la décision à l'utilisateur ; les avis qui les coulent disent tous
// la même chose : « impressionnant, mais ça ne m'aide pas à décider ». Cet
// écran nomme UN lieu et dit quand son soleil s'arrête. La carte reste à un
// onglet, pour qui veut explorer.
//
// Le compte à rebours est la raison d'être du moteur physique : « perd le
// soleil dans 1h 45 » est le seul chiffre qu'aucune autre app ne peut
// imprimer, et c'est lui qui fait rouvrir l'app le lendemain.
// ---------------------------------------------------------------------------

interface NowScreenProps {
  mode: SunMode;
  currentDate: Date;
  userLocation: GeoPoint;
  locationGranted: boolean;
  /** Position GPS obtenue mais hors de Lisbonne : on mesure depuis le centre. */
  outsideLisbon: boolean;
  onModeChange: (mode: SunMode) => void;
  onVenueSelect: (venueId: string) => void;
  onGetDirections: (venueId: string) => void;
  onOpenMap: () => void;
  /** Mode choisi par l'app selon cette température, pas encore par la personne. */
  autoTemperature?: number | null;
  /** L'écran passe à « Plein ouest » (coucher sur l'eau) : la navigation suit. */
  onDuskChange?: (dusk: boolean) => void;
}

/** La journée que montrent les bandes de lumière. */
interface RibbonDay {
  date: Date;
  sunrise: Date;
  sunset: Date;
  hideNow: boolean;
}

// Compté, pas écrit en dur : le chiffre suit les ajouts et les retraits.
const ALL_VENUES = VenueService.getVenuesByCategory([]);
const VENUE_COUNT_LINE = venueCountLine(ALL_VENUES.length, ALL_VENUES.filter((v) => v.verifiedOnFoot).length);

export function NowScreen({
  mode,
  currentDate,
  userLocation,
  locationGranted,
  outsideLisbon,
  onModeChange,
  onVenueSelect,
  onGetDirections,
  onOpenMap,
  autoTemperature = null,
  onDuskChange,
}: NowScreenProps) {
  // « Autre chose » descend la liste au lieu de renvoyer à la carte : un
  // premier choix qui ne plaît pas ne doit jamais être une impasse. C'est ce
  // qui rend une réponse unique sans risque.
  const [pickIndex, setPickIndex] = useState(0);

  const answers = useMemo(
    () => RecommendationService.getAnswerList(mode, userLocation, currentDate, [], undefined, 6),
    [mode, userLocation, currentDate]
  );

  // Une nouvelle liste (changement de mode, autre heure) invalide le curseur
  // qui pointait dans l'ancienne.
  useEffect(() => {
    setPickIndex(0);
  }, [mode, answers]);

  const pick: Recommendation | undefined = answers[pickIndex];
  const alternatives = useMemo(
    () => answers.filter((_, i) => i !== pickIndex).slice(0, 3),
    [answers, pickIndex]
  );

  // Lever et coucher de LISBONNE, pas de la position : l'app ne parle que
  // de cette ville.
  const sunrise = useMemo(() => SunService.getSunrise(currentDate), [currentDate]);
  const sunset = useMemo(() => SunService.getSunset(currentDate), [currentDate]);
  const phase: 'before' | 'day' | 'after' =
    currentDate < sunrise ? 'before' : currentDate < sunset ? 'day' : 'after';
  const minutesToSunset = Math.round((sunset.getTime() - currentDate.getTime()) / 60000);
  const nextSunrise = useMemo(
    () =>
      phase === 'after'
        ? SunService.getSunrise(new Date(currentDate.getTime() + 24 * 3600 * 1000))
        : sunrise,
    [phase, currentDate, sunrise]
  );

  // La nuit, la réponse parle de demain : la bande de lumière aussi.
  const ribbonDay = useMemo(() => {
    if (phase !== 'after') return { date: currentDate, sunrise, sunset, hideNow: false };
    const tomorrow = new Date(currentDate.getTime() + 24 * 3600 * 1000);
    return { date: tomorrow, sunrise: nextSunrise, sunset: SunService.getSunset(tomorrow), hideNow: true };
  }, [phase, currentDate, sunrise, sunset, nextSunrise]);

  // Le parcours suit le lieu affiché : « Autre chose » en change le départ.
  const trail = useMemo(
    () =>
      mode === 'SUN' && phase === 'day' && pick
        ? SunTrailService.plan(pick, userLocation, currentDate)
        : null,
    [mode, phase, pick, userLocation, currentDate]
  );

  // Retour visible quand la feuille de partage native n'existe pas (desktop) :
  // le lien part dans le presse-papiers, et il faut le dire.
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (shareState === 'idle') return;
    const t = setTimeout(() => setShareState('idle'), 2500);
    return () => clearTimeout(t);
  }, [shareState]);

  const handleShare = useCallback(async () => {
    if (!pick) return;
    const result = await shareInvite(
      inviteText(pick, mode, trail, formatLisbonTime(sunset)),
      inviteUrl(window.location.origin, pick.venue.id)
    );
    if (result === 'copied' || result === 'failed') setShareState(result);
  }, [pick, mode, trail, sunset]);

  const handleSomethingElse = useCallback(() => {
    setPickIndex((i) => (answers.length > 0 ? (i + 1) % answers.length : 0));
  }, [answers.length]);

  const isSun = mode === 'SUN';
  // La nuit, l'ombre est partout : un classement « à l'ombre » n'a plus de sens.
  const nightShade = !isSun && phase !== 'day';
  const place = placeName(userLocation);
  const placeInSentence = placeName(userLocation, true);

  // L'heure du coucher, quand un lieu à portée de pied voit le soleil toucher
  // l'eau : l'écran entier devient la réponse à « où le voir plonger ».
  const sunsetMoment = useMemo(
    () => SunsetService.moment(mode, userLocation, currentDate),
    [mode, userLocation, currentDate]
  );
  const dusk = sunsetMoment !== null;
  useEffect(() => {
    onDuskChange?.(dusk);
  }, [dusk, onDuskChange]);
  useEffect(() => () => onDuskChange?.(false), [onDuskChange]);

  if (sunsetMoment) {
    return (
      <SunsetScreen
        moment={sunsetMoment}
        now={currentDate}
        userLocation={userLocation}
        place={place}
        mode={mode}
        onModeChange={onModeChange}
        onDirections={onGetDirections}
        onVenueSelect={onVenueSelect}
      />
    );
  }


  const tone = toneFor(mode);
  const sunAlt = SunService.getSunElevation(currentDate);

  return (
    <div className={`absolute inset-0 overflow-y-auto pb-24 ${tone.screen}`}>
      {/* --- le ciel de cette minute, et ce qu'il reste de jour ---------------- */}
      <SkyHeader date={currentDate} sunrise={sunrise} sunset={sunset} mode={mode} onModeChange={onModeChange} place={place}>
        {phase === 'day' ? (
          <>
            Le soleil quitte {placeInSentence} dans <span className="font-semibold">{formatGap(minutesToSunset)}</span>.
          </>
        ) : phase === 'before' ? (
          <>
            Le soleil se lève à <span className="font-semibold">{formatLisbonTime(sunrise)}</span>.
          </>
        ) : (
          <>Le soleil est couché sur {placeInSentence}.{isSun && ' Voici où il revient en premier demain.'}</>
        )}
      </SkyHeader>

      <div className={`relative z-10 px-6 ${!isSun ? '-mt-6' : autoTemperature !== null ? '-mt-24' : '-mt-14'}`}>
        {/* Premier lancement : dire pourquoi soleil ou ombre, et offrir l'autre. */}
        {autoTemperature !== null && (
          <div
            className={`flex items-center justify-between gap-2.5 rounded-2xl border py-2 pl-3.5 pr-2 ${
              isSun ? 'border-white/25 bg-ink/60 text-white backdrop-blur-md' : `mt-4 ${tone.card}`
            }`}
          >
            <p className="text-[13px] leading-snug">
              Il fait {autoTemperature} °C : on te montre {isSun ? 'le soleil' : "l'ombre"}.
            </p>
            <button
              onClick={() => onModeChange(isSun ? 'SHADE' : 'SUN')}
              className={`min-h-11 shrink-0 rounded-xl px-2.5 text-[12.5px] font-semibold active:scale-95 transition-transform motion-reduce:transition-none ${isSun ? 'text-dusk-pale' : tone.link}`}
            >
              {isSun ? "L'ombre plutôt ?" : 'Le soleil plutôt ?'}
            </button>
          </div>
        )}

        {/* --- la réponse --------------------------------------------------- */}
        {nightShade ? (
          <section className="mt-6">
            <h2 className="font-display text-[2.4rem] font-medium leading-[0.98] tracking-[-0.02em] [font-stretch:78%]">
              Il fait nuit : l'ombre est partout.
            </h2>
            <p className={`mt-2 text-sm ${tone.sub}`}>
              Le soleil revient à <span className="font-mono font-semibold text-dusk-ember">{formatLisbonTime(nextSunrise)}</span>. Le mode
              ombre reprendra son sens à ce moment-là.
            </p>
            <button
              onClick={() => onModeChange('SUN')}
              className={`mt-5 min-h-[52px] w-full rounded-full text-[16px] font-bold active:scale-[0.98] transition-transform motion-reduce:transition-none ${tone.primary}`}
            >
              Voir où le soleil revient
            </button>
          </section>
        ) : pick ? (
          <AnswerCard
            rec={pick}
            mode={mode}
            day={ribbonDay}
            sunAlt={sunAlt}
            currentDate={currentDate}
            onOpen={() => onVenueSelect(pick.venue.id)}
            onDirections={() => onGetDirections(pick.venue.id)}
            onSomethingElse={handleSomethingElse}
            hasAlternatives={answers.length > 1}
            onShare={handleShare}
            shareState={shareState}
          />
        ) : (
          <section className="mt-6">
            <h2 className="font-display text-[2.2rem] font-bold leading-[1] tracking-[-0.02em] [font-stretch:90%]">
              Tout est fermé pour l'instant.
            </h2>
            <p className={`mt-1.5 text-sm ${tone.sub}`}>
              Ouvre la carte pour voir où tombe {isSun ? 'le soleil' : "l'ombre"} malgré tout.
            </p>
            <button
              onClick={onOpenMap}
              className={`mt-4 min-h-[52px] w-full rounded-full text-[16px] font-bold active:scale-[0.98] transition-transform motion-reduce:transition-none ${tone.primary}`}
            >
              Voir la carte
            </button>
          </section>
        )}

        {trail && <SunTrailCard trail={trail} onSelect={onVenueSelect} />}

        {/* --- le filet, toujours visible ----------------------------------- */}
        {!nightShade && alternatives.length > 0 && (
          <section className="mt-7">
            <h2 className={`mb-1 text-[13px] font-semibold ${tone.sub}`}>
              Aussi {isSun ? 'au soleil' : "à l'ombre"}
            </h2>
            {alternatives.map((alt) => (
              <AlternativeRow
                key={alt.venue.id}
                rec={alt}
                mode={mode}
                day={ribbonDay}
                onSelect={() => onVenueSelect(alt.venue.id)}
              />
            ))}
          </section>
        )}

        {/* --- la promesse que les gros ne peuvent structurellement pas tenir */}
        <p className={`mt-8 px-1 text-center text-[11.5px] leading-relaxed ${tone.sub}`}>
          <span className="font-semibold">{VENUE_COUNT_LINE}</span>
          <br />
          Pas 2 000 adresses aspirées d'une base.
          {outsideLisbon ? (
            <>
              <br />
              Tu n'es pas à Lisbonne : temps de marche depuis le centre.
            </>
          ) : (
            !locationGranted && (
              <>
                <br />
                Temps de marche depuis le centre — active ta position pour les tiens.
              </>
            )
          )}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Deux tons, un seul bleu : le soleil est un jour clair, l'ombre une nuit. */
function toneFor(mode: SunMode) {
  return mode === 'SUN'
    ? {
        night: false,
        screen: 'bg-day text-ink',
        sub: 'text-day-sub',
        line: 'border-day-line',
        card: 'border-day-line bg-day-2',
        link: 'text-day-ember',
        primary: 'bg-ink text-white',
        secondary: 'border-[1.5px] border-ink text-ink',
        underline: LIGHT.fire,
        // La carte réponse : crème, coupée à l'angle du soleil, ombre dure.
        answer: 'border-ink bg-cream text-ink',
        shadowColor: NIGHT.night,
        cutColor: 'rgba(11,26,69,0.13)',
        cta: 'border-ink bg-dusk-fire text-ink shadow-[3px_3px_0_#0B1A45] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
      }
    : {
        night: true,
        screen: 'bg-dusk-night text-dusk-shell',
        sub: 'text-dusk-sub',
        line: 'border-dusk-line',
        card: 'border-dusk-line bg-dusk-panel',
        link: 'text-dusk-sub',
        primary: 'bg-dusk-sub text-dusk-night',
        secondary: 'border-[1.5px] border-dusk-edge text-dusk-shell',
        underline: NIGHT.sub,
        answer: 'border-dusk-edge bg-dusk-panel text-dusk-shell',
        shadowColor: 'rgba(0,0,0,0.55)',
        cutColor: 'rgba(0,0,0,0.18)',
        cta: 'border-dusk-edge bg-dusk-sub text-dusk-night shadow-[3px_3px_0_rgba(0,0,0,0.55)] active:translate-x-[3px] active:translate-y-[3px] active:shadow-none',
      };
}

/** « dernier rayon », « puis le soleil revient ici » : ce que dit l'heure géante. */
function bigTimeCaption(rec: Recommendation, mode: SunMode): [string, string] {
  // À l'ombre jusqu'au coucher : le soleil ne revient pas, la nuit tombe.
  if (mode === 'SHADE') return rec.lastsUntilSunset ? ['coucher du', 'soleil'] : ['puis le soleil', 'revient ici'];
  return rec.endsAtSunset ? ['dernier', 'rayon'] : ['puis', "l'ombre"];
}

function AnswerCard({
  rec,
  mode,
  day,
  sunAlt,
  currentDate,
  onOpen,
  onDirections,
  onSomethingElse,
  hasAlternatives,
  onShare,
  shareState,
}: {
  rec: Recommendation;
  mode: SunMode;
  day: RibbonDay;
  /** Hauteur du soleil maintenant : couleur et largeur du halo. */
  sunAlt: number;
  currentDate: Date;
  onOpen: () => void;
  onDirections: () => void;
  onSomethingElse: () => void;
  hasAlternatives: boolean;
  onShare: () => void;
  shareState: 'idle' | 'copied' | 'failed';
}) {
  const isSun = mode === 'SUN';
  const tone = toneFor(mode);
  const exposure = isSun ? rec.sunPercentage : rec.shadePercentage;
  const inItNow = exposure >= IN_IT_THRESHOLD[mode];
  const status = statusCopy(rec, mode);
  // L'heure est l'illustration : quand on y est, la fin de la fenêtre s'écrit
  // en géant ; sinon, la phrase de statut suffit.
  const bigTime = inItNow && rec.sunLeavesInMin !== null ? rec.sunWindowEnd : null;
  const headline = bigTime
    ? isSun
      ? rec.endsAtSunset
        ? "Au soleil jusqu'au coucher."
        : "Au soleil jusqu'à"
      : rec.lastsUntilSunset
        ? "À l'ombre jusqu'au coucher."
        : "À l'ombre jusqu'à"
    : `${status.title}.`;
  const [cap1, cap2] = bigTimeCaption(rec, mode);
  // L'orange dit une heure de soleil : « le soleil revient », « dernier rayon ».
  // « coucher du soleil » en mode Ombre n'en est pas une.
  const captionColor = isSun ? 'text-day-ember' : rec.lastsUntilSunset ? 'text-dusk-sub' : 'text-dusk-ember';

  // Le relief — la seule chose qu'une app née en ville plate ne peut pas dire.
  // `null` sur les deux tiers des lieux, et c'est voulu : voir ReliefService.
  //
  // Mode Ombre exclu, et pas par prudence : dominer le quartier donne MOINS
  // d'ombre, pas plus. La même mesure y dirait l'inverse de la vérité.
  //
  // Et seulement quand le lieu EST au soleil : la nuit, « garde le soleil
  // après les rues d'en bas » ne décrit rien.
  const relief = useMemo(
    () =>
      isSun && inItNow ? ReliefService.explain({ lat: rec.venue.latitude, lng: rec.venue.longitude }) : null,
    [isSun, inItNow, rec.venue.latitude, rec.venue.longitude]
  );

  // La carte est coupée à l'angle du soleil de cette minute ; son ombre tombe
  // à l'opposé. Trois nombres, aucun état : voir utils/lightCut.
  const cut = useMemo(
    () => lightCut(SunService.getSunAzimuth(currentDate), sunAlt),
    [currentDate, sunAlt]
  );

  return (
    <section className="mt-5">
      <div
        className={`relative rounded-[20px] border-[1.5px] p-4 ${tone.answer}`}
        style={{ boxShadow: `${cut.dx}px ${cut.dy}px 0 ${tone.shadowColor}` }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[inherit]"
          style={{ background: `linear-gradient(${cut.angle}deg, transparent ${cut.cut}%, ${tone.cutColor} ${cut.cut}%)` }}
        />
        <div className="relative">
          <div className="-mr-2 -mt-1 flex items-start justify-between gap-2">
            <p className={`pt-1 text-[10.5px] font-bold uppercase tracking-[0.1em] [text-wrap:balance] ${isSun ? 'text-day-ember' : 'text-dusk-ember'}`}>
              {headline.replace(/\.$/, '')}
            </p>
            <button
              onClick={onShare}
              aria-label="Inviter quelqu'un"
              className={`-mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full active:scale-90 transition-transform motion-reduce:transition-none ${tone.sub}`}
            >
              <ShareIcon />
            </button>
          </div>

          <button onClick={onOpen} className="-mt-2 flex min-h-11 items-center gap-2 text-left active:opacity-70 transition-opacity">
            {/* Ça brille : au soleil maintenant. Éteint : à l'ombre. */}
            <HaloIcon kind={rec.sunPercentage >= IN_IT_THRESHOLD.SUN && sunAlt > 0.5 ? 'sun' : 'shade'} tone={tone.night ? 'night' : 'day'} alt={sunAlt} size={24} />
            <span className="font-display text-[26px] font-extrabold leading-none tracking-[-0.02em] [text-wrap:pretty]">{rec.venue.name}</span>
          </button>
          <p className={`mt-1 text-[13px] font-medium ${tone.sub}`}>
            {categoryLabel(rec.venue.category)} · {VenueService.getNeighborhood(rec.venue)} · {travelLabel(rec)}
          </p>

          {bigTime && (
            <p className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-[22px] font-extrabold leading-none tracking-[-0.01em] tabular-nums">{bigTime}</span>
              <span className={`text-[12.5px] font-semibold leading-tight ${captionColor}`}>
                {cap1} {cap2}
              </span>
            </p>
          )}
          <p className={`mt-1.5 text-[13.5px] font-medium leading-snug ${tone.sub}`}>{status.detail}</p>

          <div className="mt-3.5">
            <DayRibbon venue={rec.venue} mode={mode} {...day} tone={tone.night ? 'night' : 'day'} />
          </div>

          {relief && (
            <p className={`mt-3 flex items-start gap-2 text-[12.5px] leading-snug ${tone.sub}`}>
              <ReliefIcon />
              <span>{relief}</span>
            </p>
          )}

          {shareState !== 'idle' && (
            <p role="status" className="mt-3 text-center text-[12.5px] font-semibold">
              {shareState === 'copied'
                ? "Invitation copiée — colle-la dans ta conversation."
                : "Copie impossible sur cet appareil."}
            </p>
          )}

          <div className="mt-4 flex gap-2.5">
            <button
              onClick={onDirections}
              className={`min-h-12 flex-1 rounded-[14px] border-[1.5px] font-display text-[16px] font-extrabold transition-[transform,box-shadow] motion-reduce:transition-none ${tone.cta}`}
            >
              M'y emmener
            </button>
            {hasAlternatives && (
              <button
                onClick={onSomethingElse}
                className={`min-h-12 rounded-[14px] px-4 text-[14px] font-bold active:scale-[0.98] transition-transform motion-reduce:transition-none ${tone.secondary}`}
              >
                Autre chose
              </button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** « Et après ? » — là où aller quand l'ombre rattrape le lieu proposé.
 *  Seulement en mode Soleil, donc sur le ton de jour. */
function SunTrailCard({ trail, onSelect }: { trail: SunTrail; onSelect: (venueId: string) => void }) {
  const [first, ...next] = trail.stops;
  const last = trail.stops[trail.stops.length - 1];

  return (
    <div className="mt-6 rounded-[20px] border border-day-line bg-day-2 p-5">
      <p className="text-[12px] font-semibold text-day-ember">Suivre le soleil</p>
      <h2 className="mt-1 font-display text-[1.6rem] font-bold leading-tight [font-stretch:90%]">
        Et après <span className="font-mono">{formatLisbonTime(first.leaveAt)}</span> ?
      </h2>
      <p className="mt-0.5 text-[13px] text-day-sub">
        {trail.untilSunset
          ? `Au soleil jusqu'au coucher, à ${formatLisbonTime(last.leaveAt)}.`
          : `Au soleil jusqu'à ${formatLisbonTime(last.leaveAt)}.`}
      </p>

      <ol className="mt-4">
        <TrailRow
          time={`jusqu'à ${formatLisbonTime(first.leaveAt)}`}
          name={first.rec.venue.name}
          detail={first.closes ? 'ferme' : undefined}
          muted
        />
        {next.map((stop) => (
          <li key={stop.rec.venue.id}>
            <p className="ml-[5px] border-l-2 border-dashed border-day-line py-1.5 pl-[17px] text-[11.5px] text-day-sub">
              {stop.walkMin} min à pied
            </p>
            <button
              onClick={() => onSelect(stop.rec.venue.id)}
              className="block w-full text-left active:opacity-70 transition-opacity"
            >
              <TrailRow
                as="div"
                time={`${formatLisbonTime(stop.arriveAt)} – ${formatLisbonTime(stop.leaveAt)}`}
                name={stop.rec.venue.name}
                detail={`${categoryLabel(stop.rec.venue.category)}${stop.closes ? ' · ferme' : ''}`}
              />
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

function TrailRow({
  time,
  name,
  detail,
  muted = false,
  as = 'li',
}: {
  time: string;
  name: string;
  detail?: string;
  muted?: boolean;
  as?: 'li' | 'div';
}) {
  const Tag = as;
  return (
    <Tag className="flex items-start gap-3">
      <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${muted ? 'border-2 border-day-sub' : 'bg-dusk-fire'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${muted ? 'text-day-sub' : 'text-ink'}`}>
          {name}
        </span>
        <span className="block font-mono text-xs tabular-nums text-day-sub">
          {time}
          {detail && <span className="font-sans"> · {detail}</span>}
        </span>
      </span>
    </Tag>
  );
}


// ---------------------------------------------------------------------------

function AlternativeRow({
  rec,
  mode,
  day,
  onSelect,
}: {
  rec: Recommendation;
  mode: SunMode;
  day: RibbonDay;
  onSelect: () => void;
}) {
  const tone = toneFor(mode);
  return (
    <button
      onClick={onSelect}
      className={`flex min-h-14 w-full items-center gap-3.5 border-t px-1 py-2.5 text-left active:opacity-70 transition-opacity ${tone.line}`}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{rec.venue.name}</p>
        <p className={`text-[12.5px] ${tone.sub}`}>
          {travelLabel(rec)} · {statusShort(rec, mode)}
        </p>
      </div>
      <DayRibbon venue={rec.venue} mode={mode} {...day} size="mini" tone={tone.night ? 'night' : 'day'} />
    </button>
  );
}

// ---------------------------------------------------------------------------

/** Partager — une flèche qui sort d'une boîte. */
function ShareIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <polyline points="7 8 12 3 17 8" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

/** Une crête — le relief sous le lieu, pas une décoration. */
function ReliefIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3 20h18L14 7l-4 7-2.5-3z" />
    </svg>
  );
}
