import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react';
import type { GeoPoint, Recommendation, SunMode } from '@/types';
import { IN_IT_THRESHOLD, RecommendationService } from '@/services/RecommendationService';
import { ReliefService } from '@/services/ReliefService';
import { SunService } from '@/services/SunService';
import { VenueService } from '@/services/VenueService';
import { SunTrailService, type SunTrail } from '@/services/SunTrailService';
import { SunsetService } from '@/services/SunsetService';
import { SunsetScreen } from './SunsetScreen';
import { DayRibbon, type RibbonTone } from './DayRibbon';
import { ModeSwitch } from './ModeSwitch';
import { formatLisbonTime } from '@/utils/lisbonTime';
import { categoryLabel, formatGap, placeName, statusCopy, statusShort, travelLabel, venueCountLine } from '@/utils/copy';
import { inviteText, inviteUrl, shareInvite } from '@/utils/share';
import { LiveGlyph } from './Halo';
import { VoicePile } from './Avatar';
import { liveReports } from '@/services/LiveReportService';
import { LIVE_SHORT, liveAge, liveHello, liveWho } from '@/utils/live';
import { getPseudo, subscribePseudo } from '@/utils/pseudo';
import { CYCLE, circadian } from '@/utils/circadian';
import type { HaloTone } from '@/utils/haloMarkup';
import { tr, useLang } from '@/utils/lang';

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

/** Les tons de la réponse : sur la feuille, ou sur la carte crème (Ombre). */
interface AnswerTones {
  ribbon: RibbonTone;
  glyph: HaloTone;
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
const VERIFIED_COUNT = ALL_VENUES.filter((v) => v.verifiedOnFoot).length;

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
  // Réabonne l'écran à la bascule de langue (les phrases se composent au rendu).
  useLang();
  // « Salut Léa. » en tête du ciel, dès qu'un pseudo est choisi.
  const hello = liveHello(useSyncExternalStore(subscribePseudo, getPseudo));

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

  // Le cycle circadien : la couleur du bain suit le vrai soleil (voir
  // utils/circadian). En Ombre, la réponse se pose sur une carte crème, sur
  // le ciel : sa bande et son glyphe prennent les tons de jour.
  const cyc = useMemo(() => (CYCLE ? circadian(currentDate, mode) : null), [currentDate, mode]);
  const onSheet: RibbonTone = cyc ? (cyc.fg === 'ink' ? 'transat' : 'bain') : isSun ? 'transat' : 'bain';
  const onSheetLow: RibbonTone = cyc ? (cyc.fgLow === 'ink' ? 'transat' : 'bain') : onSheet;
  const answerTones: AnswerTones = cyc && !isSun
    ? { ribbon: 'carte', glyph: 'day' }
    : { ribbon: onSheet, glyph: onSheet === 'transat' ? 'day' : 'night' };
  const cycStyle = cyc
    ? ({
        '--cyc-sheet': cyc.sheet,
        '--cyc-sky-top': cyc.sky[0],
        '--cyc-sky-bot': cyc.sky[1],
        '--cyc-sx': `${cyc.shadow?.x ?? 0}px`,
        '--cyc-sy': `${cyc.shadow?.y ?? 3}px`,
      } as CSSProperties)
    : undefined;

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


  return (
    <div
      className="bain absolute inset-0 overflow-y-auto pb-24"
      data-bain={isSun ? 'soleil' : 'ombre'}
      data-cycle={cyc ? '' : undefined}
      data-fg={cyc?.fg}
      data-fg-low={cyc?.fgLow}
      data-sunup={cyc?.shadow ? '' : undefined}
      style={cycStyle}
    >
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+14px)]">
        {/* --- l'heure, posée sur le bain ---------------------------------- */}
        <div className="bain-top">
          <div className="min-w-0">
            <p className="bain-city">{place}</p>
            <p className="bain-clock">{formatLisbonTime(currentDate)}</p>
          </div>
          {/* `relative` : le pouce est en absolu, il se cale sur la piste. */}
          <ModeSwitch mode={mode} onModeChange={onModeChange} className="relative shrink-0" tint={cyc && { bg: cyc.sheet, fg: cyc.fg }} />
        </div>
        <p className="bain-said">
          {hello && <span className="font-bold">{hello} </span>}
          {phase === 'day' ? (
            <>
              {tr(`Le soleil quitte ${placeInSentence} dans `, `The sun leaves ${placeInSentence} in `)}
              <span className="font-bold">{formatGap(minutesToSunset)}</span>.
            </>
          ) : phase === 'before' ? (
            <>
              {tr('Le soleil se lève à ', 'The sun rises at ')}
              <span className="font-bold">{formatLisbonTime(sunrise)}</span>.
            </>
          ) : (
            <>
              {tr(`Le soleil est couché sur ${placeInSentence}.`, `The sun has set over ${placeInSentence}.`)}
              {isSun && tr(' Voici où il revient en premier demain.', ' Here’s where it comes back first tomorrow.')}
            </>
          )}
        </p>

        {/* Premier lancement : dire pourquoi soleil ou ombre, et offrir l'autre. */}
        {autoTemperature !== null && (
          <div className="bain-live mt-4 justify-between">
            <span>
              {isSun
                ? tr(`Il fait ${autoTemperature} °C : on te montre le soleil.`, `It’s ${autoTemperature}°C, so here’s the sun.`)
                : tr(`Il fait ${autoTemperature} °C : on te montre l'ombre.`, `It’s ${autoTemperature}°C, so here’s the shade.`)}
            </span>
            <button
              onClick={() => onModeChange(isSun ? 'SHADE' : 'SUN')}
              className="min-h-11 shrink-0 px-1 font-bold underline active:opacity-70 transition-opacity motion-reduce:transition-none"
            >
              {isSun ? tr("L'ombre plutôt ?", 'Shade instead?') : tr('Le soleil plutôt ?', 'Sun instead?')}
            </button>
          </div>
        )}

        {/* --- la réponse --------------------------------------------------- */}
        {nightShade ? (
          <section className="bain-answer mt-7">
            <h2 className="bain-headline">{tr("Il fait nuit : l'ombre est partout.", 'It’s night: shade is everywhere.')}</h2>
            <p className="bain-detail">
              {tr('Le soleil revient à', 'The sun is back at')}{' '}
              <span className="font-bold" style={{ color: 'var(--b-key)' }}>{formatLisbonTime(nextSunrise)}</span>.{' '}
              {tr('Le mode ombre reprendra son sens à ce moment-là.', 'Shade mode will make sense again then.')}
            </p>
            <div className="bain-actions">
              <button className="bain-go" onClick={() => onModeChange('SUN')}>
                {tr('Voir où le soleil revient', 'See where the sun comes back')}
              </button>
            </div>
          </section>
        ) : pick ? (
          <AnswerCard
            rec={pick}
            mode={mode}
            day={ribbonDay}
            onOpen={() => onVenueSelect(pick.venue.id)}
            onDirections={() => onGetDirections(pick.venue.id)}
            onSomethingElse={handleSomethingElse}
            hasAlternatives={answers.length > 1}
            onShare={handleShare}
            tones={answerTones}
            shareState={shareState}
          />
        ) : (
          <section className="bain-answer mt-7">
            <h2 className="bain-headline">{tr("Tout est fermé pour l'instant.", 'Everything’s closed for now.')}</h2>
            <p className="bain-detail">
              {isSun
                ? tr('Ouvre la carte pour voir où tombe le soleil malgré tout.', 'Open the map to see where the sun falls anyway.')
                : tr("Ouvre la carte pour voir où tombe l'ombre malgré tout.", 'Open the map to see where the shade falls anyway.')}
            </p>
            <div className="bain-actions">
              <button className="bain-go" onClick={onOpenMap}>
                {tr('Voir la carte', 'See the map')}
              </button>
            </div>
          </section>
        )}

        {trail && <SunTrailCard trail={trail} onSelect={onVenueSelect} />}

        {/* --- le filet, toujours visible ----------------------------------- */}
        {!nightShade && alternatives.length > 0 && (
          <section className="bain-low">
            <h2 className="bain-also">{isSun ? tr('Aussi au soleil', 'Also in the sun') : tr('Aussi au frais', 'Also in the shade')}</h2>
            {alternatives.map((alt) => (
              <AlternativeRow
                key={alt.venue.id}
                rec={alt}
                mode={mode}
                day={ribbonDay}
                tone={onSheetLow}
                onSelect={() => onVenueSelect(alt.venue.id)}
              />
            ))}
          </section>
        )}

        {/* --- la promesse que les gros ne peuvent structurellement pas tenir */}
        <p className="bain-foot bain-low">
          <span className="font-bold">{venueCountLine(ALL_VENUES.length, VERIFIED_COUNT)}</span>
          <br />
          {tr("Pas 2 000 adresses aspirées d'une base.", 'Not 2,000 addresses scraped from a database.')}
          {outsideLisbon ? (
            <>
              <br />
              {tr("Tu n'es pas à Lisbonne : temps de marche depuis le centre.", 'You’re not in Lisbon: walking times from the centre.')}
            </>
          ) : (
            !locationGranted && (
              <>
                <br />
                {tr(
                  'Temps de marche depuis le centre — active ta position pour les tiens.',
                  'Walking times from the centre. Turn on your location for yours.'
                )}
              </>
            )
          )}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** « dernier rayon », « puis le soleil revient ici » : ce que dit l'heure géante. */
function bigTimeCaption(rec: Recommendation, mode: SunMode): [string, string] {
  // À l'ombre jusqu'au coucher : le soleil ne revient pas, la nuit tombe.
  if (mode === 'SHADE') {
    return rec.lastsUntilSunset
      ? [tr('coucher du', 'sunset'), tr('soleil', '')]
      : [tr('puis le soleil', 'then the sun'), tr('revient ici', 'comes back')];
  }
  return rec.endsAtSunset ? [tr('dernier', 'last'), tr('rayon', 'light')] : [tr('puis', 'then'), tr("l'ombre", 'shade')];
}

function AnswerCard({
  rec,
  mode,
  day,
  onOpen,
  onDirections,
  onSomethingElse,
  hasAlternatives,
  onShare,
  shareState,
  tones,
}: {
  tones: AnswerTones;
  rec: Recommendation;
  mode: SunMode;
  day: RibbonDay;
  onOpen: () => void;
  onDirections: () => void;
  onSomethingElse: () => void;
  hasAlternatives: boolean;
  onShare: () => void;
  shareState: 'idle' | 'copied' | 'failed';
}) {
  const isSun = mode === 'SUN';
  const exposure = isSun ? rec.sunPercentage : rec.shadePercentage;
  const inItNow = exposure >= IN_IT_THRESHOLD[mode];
  const status = statusCopy(rec, mode);
  // L'heure est l'illustration : quand on y est, la fin de la fenêtre s'écrit
  // en géant ; sinon, la phrase de statut suffit.
  const bigTime = inItNow && rec.sunLeavesInMin !== null ? rec.sunWindowEnd : null;
  // Le sticker tient seul : « *Au frais* ». Pas de « tu es » — le lieu est à huit
  // minutes à pied, on n'y est pas encore. Pas de « jusqu'à » non plus : son heure
  // est quatre blocs plus bas, la préposition resterait en l'air. L'heure géante
  // et sa légende (« dernier rayon », « coucher du soleil ») disent l'échéance.
  // Hors de l'état, il n'y a rien à coller — la phrase de statut suffit.
  const [cap1, cap2] = bigTimeCaption(rec, mode);

  // Le relief — la seule chose qu'une app née en ville plate ne peut pas dire.
  // `null` sur les deux tiers des lieux, et c'est voulu : voir ReliefService.
  //
  // Mode Ombre exclu, et pas par prudence : dominer le quartier donne MOINS
  // d'ombre, pas plus. La même mesure y dirait l'inverse de la vérité.
  //
  // Et seulement quand le lieu EST au soleil : la nuit, « garde le soleil
  // après les rues d'en bas » ne décrit rien.
  const lang = useLang();
  const relief = useMemo(
    () =>
      isSun && inItNow ? ReliefService.explain({ lat: rec.venue.latitude, lng: rec.venue.longitude }) : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lang` : tr() lit la langue hors de React, le texte du memo doit suivre la bascule.
    [isSun, inItNow, rec.venue.latitude, rec.venue.longitude, lang]
  );

  // Ce que disent ceux qui sont sur place : l'algo prédit, eux confirment.
  useSyncExternalStore(
    (cb) => liveReports.subscribe(cb),
    () => liveReports.getVersion()
  );
  const live = liveReports.getState(rec.venue.id);

  return (
    <section className="bain-answer mt-7">
      {/* La réponse : le sticker de la carte, seul. Le lieu et l'heure suivent. */}
      <h2 className="bain-headline">
        {bigTime ? (
          <span className="titre-sticker">{isSun ? tr('Au soleil', 'In the sun') : tr('Au frais', 'In the shade')}</span>
        ) : (
          `${status.title}.`
        )}
      </h2>

      <div className="flex items-start justify-between gap-2">
        <button onClick={onOpen} className="min-w-0 flex-1 text-left active:opacity-70 transition-opacity motion-reduce:transition-none">
          <p className="bain-venue">{rec.venue.name}</p>
          <p className="bain-meta">
            {categoryLabel(rec.venue.category)} · {VenueService.getNeighborhood(rec.venue)} · {travelLabel(rec)}
          </p>
        </button>
        <button
          onClick={onShare}
          aria-label={tr("Inviter quelqu'un", 'Invite someone')}
          className="mt-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full opacity-75 active:scale-90 transition-transform motion-reduce:transition-none"
        >
          <ShareIcon />
        </button>
      </div>

      {/* L'heure qu'on vient chercher : c'est elle qui porte le jaune. */}
      {bigTime && (
        <p className="bain-until">
          <b>{bigTime}</b>
          <span>{cap2 ? `${cap1} ${cap2}` : cap1}</span>
        </p>
      )}
      <p className="bain-detail">{status.detail}</p>

      {/* Le signal de la communauté : éclat = frais, éteint = personne n'a encore confirmé. */}
      <p className="bain-live">
        {live ? (
          <VoicePile voices={live.voices} sunByHour={rec.venue.sunExposureByHour} category={rec.venue.category} />
        ) : (
          <LiveGlyph level="none" size={20} tone={tones.glyph} className="opacity-60" />
        )}
        {live ? (
          <span>
            <span className="font-bold">{LIVE_SHORT[live.level]}</span> · {liveWho(live.count, live.by)}, {liveAge(live.ageMin)}
          </span>
        ) : (
          <span>{tr('Pas encore confirmé sur place. Sois le premier.', 'Not confirmed on the spot yet. Be the first.')}</span>
        )}
      </p>

      <div className="mt-5">
        <DayRibbon venue={rec.venue} mode={mode} {...day} tone={tones.ribbon} />
      </div>

      {relief && (
        <p className="bain-detail flex items-start gap-2">
          <ReliefIcon />
          <span>{relief}</span>
        </p>
      )}

      {shareState !== 'idle' && (
        <p role="status" className="bain-detail text-center font-bold">
          {shareState === 'copied'
            ? tr('Invitation copiée — colle-la dans ta conversation.', 'Invite copied. Paste it into your chat.')
            : tr('Copie impossible sur cet appareil.', 'Can’t copy on this device.')}
        </p>
      )}

      <div className="bain-actions">
        <button className="bain-go" onClick={onDirections}>
          {tr("M'y emmener", 'Take me there')}
        </button>
        {hasAlternatives && (
          <button className="bain-alt" onClick={onSomethingElse}>
            {tr('Autre chose', 'Something else')}
          </button>
        )}
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
    <div className="mt-7 rounded-[20px] p-5" style={{ background: 'var(--b-glass)' }}>
      <p className="text-[12px] font-bold uppercase tracking-[0.06em] opacity-75">{tr('Suivre le soleil', 'Follow the sun')}</p>
      <h2 className="mt-1 font-display text-[1.6rem] font-extrabold leading-tight tracking-[-0.02em]">
        {tr('Et après ', 'And after ')}
        <span className="tabular-nums">{formatLisbonTime(first.leaveAt)}</span>
        {tr(' ?', '?')}
      </h2>
      <p className="mt-0.5 text-[13px] opacity-75">
        {trail.untilSunset
          ? tr(`Au soleil jusqu'au coucher, à ${formatLisbonTime(last.leaveAt)}.`, `In the sun until sunset, at ${formatLisbonTime(last.leaveAt)}.`)
          : tr(`Au soleil jusqu'à ${formatLisbonTime(last.leaveAt)}.`, `In the sun until ${formatLisbonTime(last.leaveAt)}.`)}
      </p>

      <ol className="mt-4">
        <TrailRow
          time={tr(`jusqu'à ${formatLisbonTime(first.leaveAt)}`, `until ${formatLisbonTime(first.leaveAt)}`)}
          name={first.rec.venue.name}
          detail={first.closes ? tr('ferme', 'closes') : undefined}
          muted
        />
        {next.map((stop) => (
          <li key={stop.rec.venue.id}>
            <p className="ml-[5px] border-l-2 border-dashed py-1.5 pl-[17px] text-[11.5px] opacity-70" style={{ borderColor: 'var(--b-hair)' }}>
              {stop.walkMin} {tr('min à pied', 'min walk')}
            </p>
            <button
              onClick={() => onSelect(stop.rec.venue.id)}
              className="block w-full text-left active:opacity-70 transition-opacity"
            >
              <TrailRow
                as="div"
                time={`${formatLisbonTime(stop.arriveAt)} – ${formatLisbonTime(stop.leaveAt)}`}
                name={stop.rec.venue.name}
                detail={`${categoryLabel(stop.rec.venue.category)}${stop.closes ? ` · ${tr('ferme', 'closes')}` : ''}`}
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
      <span
        className={`mt-1 h-3 w-3 shrink-0 rounded-full ${muted ? 'border-2 border-current opacity-60' : ''}`}
        style={muted ? undefined : { background: '#FFE14D' }}
      />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-bold ${muted ? 'opacity-70' : ''}`}>{name}</span>
        <span className="block text-xs tabular-nums opacity-70">
          {time}
          {detail && <span> · {detail}</span>}
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
  tone,
  onSelect,
}: {
  rec: Recommendation;
  mode: SunMode;
  day: RibbonDay;
  tone: RibbonTone;
  onSelect: () => void;
}) {
  return (
    <button onClick={onSelect} className="bain-row active:opacity-70 transition-opacity motion-reduce:transition-none">
      <span className="min-w-0 flex-1">
        <b className="truncate">{rec.venue.name}</b>
        <small>
          {travelLabel(rec)} · {statusShort(rec, mode)}
        </small>
      </span>
      <DayRibbon venue={rec.venue} mode={mode} {...day} size="mini" tone={tone} />
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
