import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GeoPoint, Recommendation, SunMode } from '@/types';
import { RecommendationService } from '@/services/RecommendationService';
import { SunService } from '@/services/SunService';
import { formatLisbonTime } from '@/utils/lisbonTime';

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
  onModeChange: (mode: SunMode) => void;
  onVenueSelect: (venueId: string) => void;
  onGetDirections: (venueId: string) => void;
  onOpenMap: () => void;
}

const CATEGORY_LABEL: Record<string, string> = {
  rooftop: 'Rooftop',
  terrace: 'Terrasse',
  miradouro: 'Belvédère',
  viewpoint: 'Belvédère',
  park: 'Parc',
  beach: 'Plage',
  square: 'Place',
  cafe: 'Café',
  bar: 'Bar',
  restaurant: 'Restaurant',
};

function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

function formatGap(minutes: number): string {
  return RecommendationService.formatDuration(Math.max(0, Math.round(minutes)));
}

export function NowScreen({
  mode,
  currentDate,
  userLocation,
  locationGranted,
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

  const sunset = useMemo(
    () => SunService.getSunset(currentDate, userLocation.lat, userLocation.lng),
    [currentDate, userLocation.lat, userLocation.lng]
  );
  const minutesToSunset = Math.round((sunset.getTime() - currentDate.getTime()) / 60000);
  const daylightLeft = minutesToSunset > 0;

  const handleSomethingElse = useCallback(() => {
    setPickIndex((i) => (answers.length > 0 ? (i + 1) % answers.length : 0));
  }, [answers.length]);

  const isSun = mode === 'SUN';
  const seeking = isSun ? 'soleil' : 'ombre';

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
          {daylightLeft ? (
            <>
              Le soleil quitte Lisbonne dans{' '}
              <span className="font-semibold text-shade-700">{formatGap(minutesToSunset)}</span>.
            </>
          ) : (
            <>Le soleil est couché sur Lisbonne. Voici où il revient en premier.</>
          )}
        </p>

        {/* --- la réponse --------------------------------------------------- */}
        {pick ? (
          <AnswerCard
            rec={pick}
            mode={mode}
            onOpen={() => onVenueSelect(pick.venue.id)}
            onDirections={() => onGetDirections(pick.venue.id)}
            onSomethingElse={handleSomethingElse}
            hasAlternatives={answers.length > 1}
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

        {/* --- le filet, toujours visible ----------------------------------- */}
        {alternatives.length > 0 && (
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
          {!locationGranted && (
            <>
              <br />
              <span className="text-shade-300">
                Temps de marche depuis le centre — active ta position pour les tiens.
              </span>
            </>
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
}: {
  rec: Recommendation;
  mode: SunMode;
  onOpen: () => void;
  onDirections: () => void;
  onSomethingElse: () => void;
  hasAlternatives: boolean;
}) {
  const isSun = mode === 'SUN';
  const exposure = isSun ? rec.sunPercentage : rec.shadePercentage;
  const inItNow = exposure >= 40;
  const leavesIn = rec.sunLeavesInMin;
  const arrivesIn = rec.sunArrivesInMin;
  const word = isSun ? 'soleil' : 'ombre';

  return (
    <div className="mt-6 rounded-3xl bg-white p-6 shadow-xl shadow-shade-900/10">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-sun-600">
        {inItNow ? `Va là pour ${isSun ? 'le soleil' : "l'ombre"}` : `Prochain ${isSun ? 'au soleil' : "à l'ombre"}`}
      </p>

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
          {inItNow && leavesIn !== null ? (
            <>
              <p className="text-[15px] font-bold leading-tight text-shade-900">
                Perd {isSun ? 'le soleil' : "l'ombre"} dans {formatGap(leavesIn)}
              </p>
              <p className="mt-0.5 text-xs text-shade-500">
                {exposure} % de {word} maintenant
                {rec.sunWindowEnd ? ` · jusqu'à ${rec.sunWindowEnd}` : ''}
              </p>
            </>
          ) : arrivesIn !== null ? (
            <>
              <p className="text-[15px] font-bold leading-tight text-shade-900">
                {isSun ? 'Le soleil arrive' : "L'ombre arrive"} dans {formatGap(arrivesIn)}
              </p>
              <p className="mt-0.5 text-xs text-shade-500">
                {rec.sunWindowStart ? `À partir de ${rec.sunWindowStart}` : 'Plus tard'} · {exposure} % maintenant
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] font-bold leading-tight text-shade-900">
                {exposure} % de {word} maintenant
              </p>
              <p className="mt-0.5 text-xs text-shade-500">Stable pour la prochaine heure</p>
            </>
          )}
        </div>
      </div>

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
  const leavesIn = rec.sunLeavesInMin;
  const arrivesIn = rec.sunArrivesInMin;

  const detail =
    leavesIn !== null
      ? `${formatGap(leavesIn)} restantes`
      : arrivesIn !== null
        ? `dans ${formatGap(arrivesIn)}`
        : `${exposure} %`;

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
