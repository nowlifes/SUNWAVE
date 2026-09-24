import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GeoPoint, Recommendation, SunMode } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { ReliefService } from '@/services/ReliefService';
import { SunService } from '@/services/SunService';
import { VenueService } from '@/services/VenueService';
import { SunTrailService, type SunTrail } from '@/services/SunTrailService';
import { DayRibbon } from './DayRibbon';
import { SkyHeader } from './SkyHeader';
import { formatLisbonTime } from '@/utils/lisbonTime';
import { categoryLabel, formatGap, statusCopy, statusShort, travelLabel, venueCountLine } from '@/utils/copy';
import { inviteText, inviteUrl, shareInvite } from '@/utils/share';

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


  return (
    <div className="absolute inset-0 overflow-y-auto bg-paper pb-24">
      {/* --- le ciel de cette minute, et ce qu'il reste de jour ---------------- */}
      <SkyHeader date={currentDate} sunrise={sunrise} sunset={sunset} mode={mode} onModeChange={onModeChange}>
        {phase === 'day' ? (
          <>
            Le soleil quitte Lisbonne dans <span className="font-semibold">{formatGap(minutesToSunset)}</span>.
          </>
        ) : phase === 'before' ? (
          <>
            Le soleil se lève à <span className="font-semibold">{formatLisbonTime(sunrise)}</span>.
          </>
        ) : (
          <>Le soleil est couché sur Lisbonne.{isSun && ' Voici où il revient en premier demain.'}</>
        )}
      </SkyHeader>

      <div className="px-6">
        {/* Premier lancement : dire pourquoi soleil ou ombre, et offrir l'autre. */}
        {autoTemperature !== null && (
          <div className="mt-4 flex items-center justify-between gap-2.5 rounded-2xl border border-line bg-white/60 py-2 pl-3.5 pr-2">
            <p className="text-[13px] leading-snug text-ink">
              Il fait {autoTemperature} °C : on te montre {isSun ? 'le soleil' : "l'ombre"}.
            </p>
            <button
              onClick={() => onModeChange(isSun ? 'SHADE' : 'SUN')}
              className="min-h-11 shrink-0 rounded-xl px-2.5 text-[12.5px] font-semibold text-ember active:scale-95 transition-transform"
            >
              {isSun ? "L'ombre plutôt ?" : 'Le soleil plutôt ?'}
            </button>
          </div>
        )}

        {/* --- la réponse --------------------------------------------------- */}
        {nightShade ? (
          <section className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-mute">Mode ombre</p>
            <h2 className="mt-1.5 font-serif text-[2.2rem] leading-[1.05] text-ink">Il fait nuit : l'ombre est partout.</h2>
            <p className="mt-2 text-sm text-mute">
              Le soleil revient à <span className="font-semibold text-ink">{formatLisbonTime(nextSunrise)}</span>. Le mode
              ombre reprendra son sens à ce moment-là.
            </p>
            <button
              onClick={() => onModeChange('SUN')}
              className="mt-5 min-h-[50px] w-full rounded-[14px] bg-ink text-[15px] font-semibold text-white active:scale-[0.98] transition-transform"
            >
              Voir où le soleil revient
            </button>
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
            shareState={shareState}
          />
        ) : (
          <section className="mt-6">
            <h2 className="font-serif text-[2rem] leading-tight text-ink">Tout est fermé pour l'instant.</h2>
            <p className="mt-1.5 text-sm text-mute">
              Ouvre la carte pour voir où tombe {isSun ? 'le soleil' : "l'ombre"} malgré tout.
            </p>
            <button
              onClick={onOpenMap}
              className="mt-4 min-h-[50px] w-full rounded-[14px] bg-ink text-[15px] font-semibold text-white active:scale-[0.98] transition-transform"
            >
              Voir la carte
            </button>
          </section>
        )}

        {trail && <SunTrailCard trail={trail} onSelect={onVenueSelect} />}

        {/* --- le filet, toujours visible ----------------------------------- */}
        {!nightShade && alternatives.length > 0 && (
          <section className="mt-7">
            <h2 className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-mute">
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
        <p className="mt-8 px-1 text-center text-[11.5px] leading-relaxed text-mute">
          <span className="font-semibold text-ink">{VENUE_COUNT_LINE}</span>
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
}: {
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
  const inItNow = exposure >= 40;
  const status = statusCopy(rec, mode);

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

  return (
    <section className="mt-5">
      <div className="-mr-2.5 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-ember">
          {inItNow ? `Va là pour ${isSun ? 'le soleil' : "l'ombre"}` : `Prochain ${isSun ? 'au soleil' : "à l'ombre"}`}
        </p>
        <button
          onClick={onShare}
          aria-label="Inviter quelqu'un"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-mute active:scale-90 active:bg-line/60 transition-transform"
        >
          <ShareIcon />
        </button>
      </div>

      <button onClick={onOpen} className="block text-left active:opacity-70 transition-opacity">
        <h2 className="font-serif text-[2.4rem] leading-[1.02] text-ink [text-wrap:pretty]">{rec.venue.name}</h2>
      </button>

      <p className="mt-2 text-sm text-mute">
        {categoryLabel(rec.venue.category)} · {VenueService.getNeighborhood(rec.venue)} · {travelLabel(rec)}
      </p>

      {/* Le compte à rebours — le chiffre qu'aucune autre app ne peut imprimer —
          et la journée entière du lieu, d'un coup d'œil. */}
      <p className="mt-5 text-[15px] leading-snug text-ink">
        <span className="font-semibold">{status.title}</span>
        <span className="block text-[13px] text-mute">{status.detail}</span>
      </p>
      <div className="mt-3">
        <DayRibbon venue={rec.venue} mode={mode} {...day} />
      </div>

      {relief && (
        <p className="mt-3.5 flex items-start gap-2 text-[12.5px] leading-snug text-mute">
          <ReliefIcon />
          <span>{relief}</span>
        </p>
      )}

      {shareState !== 'idle' && (
        <p role="status" className="mt-3.5 text-center text-[12.5px] font-semibold text-ink">
          {shareState === 'copied'
            ? "Invitation copiée — colle-la dans ta conversation."
            : "Copie impossible sur cet appareil."}
        </p>
      )}

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onDirections}
          className="min-h-[50px] flex-1 rounded-[14px] bg-ink text-[15px] font-semibold text-white active:scale-[0.98] transition-transform"
        >
          M'y emmener
        </button>
        {hasAlternatives && (
          <button
            onClick={onSomethingElse}
            className="min-h-[50px] rounded-[14px] border border-[#D5CEC2] px-5 text-[15px] font-semibold text-ink active:scale-[0.98] transition-transform"
          >
            Autre chose
          </button>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

/** « Et après ? » — là où aller quand l'ombre rattrape le lieu proposé. */
function SunTrailCard({ trail, onSelect }: { trail: SunTrail; onSelect: (venueId: string) => void }) {
  const [first, ...next] = trail.stops;
  const last = trail.stops[trail.stops.length - 1];

  return (
    <div className="mt-4 rounded-2xl border border-line bg-white/60 p-5">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-ember">Suivre le soleil</p>
      <h2 className="mt-1 font-serif text-[1.6rem] leading-tight text-ink">
        Et après {formatLisbonTime(first.leaveAt)} ?
      </h2>
      <p className="mt-0.5 text-[13px] text-mute">
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
            <p className="ml-[5px] border-l-2 border-dashed border-line py-1.5 pl-[17px] text-[11.5px] text-mute">
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
      <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${muted ? 'bg-sun-200' : 'bg-sun-500'}`} />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-semibold ${muted ? 'text-mute' : 'text-ink'}`}>
          {name}
        </span>
        <span className="block text-xs tabular-nums text-mute">
          {time}
          {detail && ` · ${detail}`}
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
  return (
    <button
      onClick={onSelect}
      className="flex min-h-14 w-full items-center gap-3.5 border-t border-line px-1 py-2.5 text-left active:opacity-70 transition-opacity"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{rec.venue.name}</p>
        <p className="text-[12.5px] text-mute">
          {travelLabel(rec)} · {statusShort(rec, mode)}
        </p>
      </div>
      <DayRibbon venue={rec.venue} mode={mode} {...day} size="mini" />
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
      stroke="#5B6B7F"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-0.5 shrink-0"
      aria-hidden="true"
    >
      <path d="M3 20h18L14 7l-4 7-2.5-3z" />
    </svg>
  );
}
