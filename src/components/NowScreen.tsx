import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GeoPoint, Recommendation, SunMode } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { ReliefService } from '@/services/ReliefService';
import { SunService } from '@/services/SunService';
import { SunTrailService, type SunTrail } from '@/services/SunTrailService';
import { formatLisbonTime } from '@/utils/lisbonTime';
import { categoryLabel, formatGap, statusCopy, statusShort } from '@/utils/copy';
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
}

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
    <div className="absolute inset-0 overflow-y-auto pb-24 bg-gradient-to-b from-sun-50 via-shade-50 to-shade-100">
      <div className="px-5 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
        {/* --- l'heure, et ce qu'il reste de jour --------------------------- */}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[2.6rem] leading-none font-bold tracking-tight text-shade-900 tabular-nums">
            {formatLisbonTime(currentDate)}
          </h1>
          <button
            onClick={() => onModeChange(isSun ? 'SHADE' : 'SUN')}
            className="flex items-center gap-1.5 rounded-full bg-white/70 px-3 py-1.5 text-[10.5px] font-bold uppercase tracking-wider shadow-sm backdrop-blur active:scale-95 transition-transform"
          >
            <span className={isSun ? 'text-sun-600' : 'text-shade-600'}>
              {isSun ? 'Soleil' : 'Ombre'}
            </span>
            <span className="text-shade-400">· changer</span>
          </button>
        </div>

        <p className="mt-2 text-sm text-shade-500">
          {phase === 'day' ? (
            <>
              Le soleil quitte Lisbonne dans{' '}
              <span className="font-semibold text-shade-700">{formatGap(minutesToSunset)}</span>.
            </>
          ) : phase === 'before' ? (
            <>
              Le soleil se lève à{' '}
              <span className="font-semibold text-shade-700">{formatLisbonTime(sunrise)}</span>.
            </>
          ) : (
            <>Le soleil est couché sur Lisbonne.{isSun && ' Voici où il revient en premier demain.'}</>
          )}
        </p>

        {/* --- la réponse --------------------------------------------------- */}
        {nightShade ? (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow-xl shadow-shade-900/10">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-shade-400">Mode ombre</p>
            <p className="mt-1.5 text-[1.4rem] font-bold leading-tight text-shade-900">
              Il fait nuit : l'ombre est partout.
            </p>
            <p className="mt-2 text-sm text-shade-500">
              Le soleil revient à{' '}
              <span className="font-semibold text-shade-700">{formatLisbonTime(nextSunrise)}</span>. Le mode
              ombre reprendra son sens à ce moment-là.
            </p>
            <button
              onClick={() => onModeChange('SUN')}
              className="mt-5 w-full rounded-2xl bg-shade-900 py-3.5 text-sm font-bold text-white active:scale-[0.98] transition-transform"
            >
              Voir où le soleil revient
            </button>
          </div>
        ) : pick ? (
          <AnswerCard
            rec={pick}
            mode={mode}
            onOpen={() => onVenueSelect(pick.venue.id)}
            onDirections={() => onGetDirections(pick.venue.id)}
            onSomethingElse={handleSomethingElse}
            hasAlternatives={answers.length > 1}
            onShare={handleShare}
            shareState={shareState}
          />
        ) : (
          <div className="mt-6 rounded-3xl bg-white p-6 shadow-lg shadow-shade-900/5">
            <p className="text-lg font-bold text-shade-900">Tout est fermé pour l'instant.</p>
            <p className="mt-1.5 text-sm text-shade-500">
              Ouvre la carte pour voir où tombe {isSun ? 'le soleil' : "l'ombre"} malgré tout.
            </p>
            <button
              onClick={onOpenMap}
              className="mt-4 w-full rounded-2xl bg-shade-900 py-3 text-sm font-bold text-white active:scale-[0.98] transition-transform"
            >
              Voir la carte
            </button>
          </div>
        )}

        {trail && <SunTrailCard trail={trail} onSelect={onVenueSelect} />}

        {/* --- le filet, toujours visible ----------------------------------- */}
        {!nightShade && alternatives.length > 0 && (
          <div className="mt-7">
            <h2 className="px-1 text-[10.5px] font-bold uppercase tracking-wider text-shade-400">
              Aussi {isSun ? 'au soleil' : "à l'ombre"}
            </h2>
            <div className="mt-2 space-y-2">
              {alternatives.map((alt) => (
                <AlternativeRow
                  key={alt.venue.id}
                  rec={alt}
                  mode={mode}
                  onSelect={() => onVenueSelect(alt.venue.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* --- la promesse que les gros ne peuvent structurellement pas tenir */}
        <p className="mt-8 px-1 text-center text-[11px] leading-relaxed text-shade-400">
          <span className="font-semibold text-shade-500">64 lieux à Lisbonne. Tous vérifiés à pied.</span>
          <br />
          Pas 2 000 adresses aspirées d'une base.
          {outsideLisbon ? (
            <>
              <br />
              <span className="text-shade-300">
                Tu n'es pas à Lisbonne : temps de marche depuis le centre.
              </span>
            </>
          ) : (
            !locationGranted && (
              <>
                <br />
                <span className="text-shade-300">
                  Temps de marche depuis le centre — active ta position pour les tiens.
                </span>
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
  onOpen,
  onDirections,
  onSomethingElse,
  hasAlternatives,
  onShare,
  shareState,
}: {
  rec: Recommendation;
  mode: SunMode;
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
    <div className="mt-6 rounded-3xl bg-white p-6 shadow-xl shadow-shade-900/10">
      <div className="-mr-2.5 -mt-2.5 flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-sun-600">
          {inItNow ? `Va là pour ${isSun ? 'le soleil' : "l'ombre"}` : `Prochain ${isSun ? 'au soleil' : "à l'ombre"}`}
        </p>
        <button
          onClick={onShare}
          aria-label="Inviter quelqu'un"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-shade-400 active:scale-90 active:bg-shade-50 transition-transform"
        >
          <ShareIcon />
        </button>
      </div>

      <button onClick={onOpen} className="mt-1.5 block text-left active:opacity-70 transition-opacity">
        <h2 className="text-[1.7rem] font-bold leading-tight tracking-tight text-shade-900">
          {rec.venue.name}
        </h2>
      </button>

      <p className="mt-1 text-sm text-shade-500">
        {categoryLabel(rec.venue.category)} · {rec.walkTimeMin} min à pied
      </p>

      {/* Le compte à rebours — le chiffre qu'aucune autre app ne peut imprimer. */}
      <div className="mt-5 flex items-center gap-3 rounded-2xl bg-sun-50 px-4 py-3.5">
        <SunDial percentage={exposure} />
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight text-shade-900">{status.title}</p>
          <p className="mt-0.5 text-xs text-shade-500">{status.detail}</p>
        </div>
      </div>

      {relief && (
        <p className="mt-3.5 flex items-start gap-2 px-0.5 text-[12.5px] leading-snug text-shade-500">
          <ReliefIcon />
          <span>{relief}</span>
        </p>
      )}

      {shareState !== 'idle' && (
        <p role="status" className="mt-3.5 text-center text-[12.5px] font-semibold text-shade-600">
          {shareState === 'copied'
            ? "Invitation copiée — colle-la dans ta conversation."
            : "Copie impossible sur cet appareil."}
        </p>
      )}

      <div className="mt-5 flex gap-2.5">
        <button
          onClick={onDirections}
          className="flex-1 rounded-2xl bg-shade-900 py-3.5 text-sm font-bold text-white active:scale-[0.98] transition-transform"
        >
          M'y emmener
        </button>
        {hasAlternatives && (
          <button
            onClick={onSomethingElse}
            className="rounded-2xl border border-shade-200 bg-white px-5 py-3.5 text-sm font-bold text-shade-600 active:scale-[0.98] transition-transform"
          >
            Autre chose
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** « Et après ? » — là où aller quand l'ombre rattrape le lieu proposé. */
function SunTrailCard({ trail, onSelect }: { trail: SunTrail; onSelect: (venueId: string) => void }) {
  const [first, ...next] = trail.stops;
  const last = trail.stops[trail.stops.length - 1];

  return (
    <div className="mt-4 rounded-3xl bg-white/80 p-5 shadow-sm backdrop-blur">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-sun-600">Suivre le soleil</p>
      <h2 className="mt-1 text-[1.15rem] font-bold leading-tight text-shade-900">
        Et après {formatLisbonTime(first.leaveAt)} ?
      </h2>
      <p className="mt-0.5 text-[13px] text-shade-500">
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
            <p className="ml-[5px] border-l-2 border-dashed border-shade-200 py-1.5 pl-[17px] text-[11.5px] text-shade-400">
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
        <span className={`block truncate text-sm font-semibold ${muted ? 'text-shade-500' : 'text-shade-800'}`}>
          {name}
        </span>
        <span className="block text-xs tabular-nums text-shade-400">
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
  onSelect,
}: {
  rec: Recommendation;
  mode: SunMode;
  onSelect: () => void;
}) {
  const exposure = mode === 'SUN' ? rec.sunPercentage : rec.shadePercentage;
  const detail = statusShort(rec, mode);

  return (
    <button
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-2xl bg-white/80 px-4 py-3 text-left shadow-sm backdrop-blur active:scale-[0.99] transition-transform"
    >
      <SunDial percentage={exposure} small />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-shade-800">{rec.venue.name}</p>
        <p className="text-xs text-shade-400">
          {rec.walkTimeMin} min à pied · {detail}
        </p>
      </div>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 18 15 12 9 6" />
      </svg>
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
      stroke="#94A3B8"
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

/** Un anneau rempli — ce qu'il reste de ciel à ce lieu. */
function SunDial({ percentage, small = false }: { percentage: number; small?: boolean }) {
  const size = small ? 32 : 44;
  const stroke = small ? 3 : 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.max(0, Math.min(100, percentage)) / 100;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#FFEDD5" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#F59E0B"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${circumference * filled} ${circumference}`}
      />
    </svg>
  );
}
