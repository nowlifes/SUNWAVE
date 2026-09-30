import { useMemo, type CSSProperties } from 'react';
import type { DiscoverCategory, GeoPoint, Recommendation, SunMode } from '@/types';
import { ANSWER_REACH_MIN, IN_IT_THRESHOLD, RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { SunService } from '@/services/SunService';
import { SunsetService } from '@/services/SunsetService';
import { categoryLabel, travelLabel } from '@/utils/copy';
import { formatLisbonTime, APP_TIMEZONE } from '@/utils/lisbonTime';
import { lightCut } from '@/utils/lightCut';
import { untilOf, BAND_FROM, BAND_TO } from '@/utils/carteDuJour';
import { HourBand } from './HourBand';
import './carteDuJour.css';

// ---------------------------------------------------------------------------
// Explorer = « la carte du jour » d'une esplanada. Chaque envie est une ligne
// de menu : à la place du prix, jusqu'à quand il y a de la lumière. Le « plat
// du jour » est l'envie qui marche le mieux maintenant ; sa photo prend
// l'en-tête. Le coucher ferme la carte, comme un dessert.
// ---------------------------------------------------------------------------

interface Envie extends DiscoverCategory {
  photo: string;
  /** Ce qu'on compte sur la ligne : « 4 terrasses ». */
  noun: [string, string];
}

const ENVIES: Envie[] = [
  { id: 'drink', label: 'Un verre', icon: '', mode: 'ANY', categories: ['bar', 'rooftop'], description: 'Bars et rooftops', photo: 'verre', noun: ['bar', 'bars'] },
  { id: 'coffee', label: 'Café', icon: '', mode: 'ANY', categories: ['cafe'], description: 'Terrasses de café', photo: 'cafe', noun: ['terrasse', 'terrasses'] },
  { id: 'eat', label: 'Manger', icon: '', mode: 'ANY', categories: ['restaurant'], description: 'Manger dehors', photo: 'manger', noun: ['table', 'tables'] },
  { id: 'beach', label: 'Plage', icon: '', mode: 'ANY', categories: ['beach'], description: "Au bord de l'eau", photo: 'plage', noun: ['plage', 'plages'] },
  { id: 'park', label: 'Parc', icon: '', mode: 'ANY', categories: ['park'], description: 'Jardins et espaces verts', photo: 'parc', noun: ['jardin', 'jardins'] },
];

const BELLE_LUMIERE: Envie = {
  id: 'best_light', label: 'Belle lumière', icon: '', mode: 'SUN', categories: ['viewpoint', 'square'],
  description: "Miradouros et places, pour l'heure dorée", photo: 'lumiere', noun: ['lieu', 'lieux'],
};

const PHOTO: Record<string, string> = Object.fromEntries(
  [...ENVIES, BELLE_LUMIERE].map((e) => [e.id, `/da/${e.photo}.jpg`])
);

const exposureOf = (r: Recommendation, mode: SunMode) => (mode === 'SUN' ? r.sunPercentage : r.shadePercentage);
const inItNow = (r: Recommendation, mode: SunMode) => exposureOf(r, mode) >= IN_IT_THRESHOLD[mode] && r.sunLeavesInMin !== null;

/** Coupe et ombre de la minute, posées en variables CSS sur l'écran. */
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

const DAY_LABEL = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: APP_TIMEZONE });

function UntilPrice({ rec, mode }: { rec: Recommendation; mode: SunMode }) {
  const u = untilOf(rec, mode);
  return (
    <span className={`cdj-until${u.cool ? ' cool' : ''}`}>
      <small>
        <span className={`cdj-dot${u.cool ? ' o' : ''}`} />
        {u.label}
      </small>
      {u.value}
    </span>
  );
}

function ModeToggle({ mode, onChange }: { mode: SunMode; onChange: (m: SunMode) => void }) {
  return (
    <div className="cdj-seg" role="group" aria-label="Lumière">
      <button type="button" aria-pressed={mode === 'SUN'} onClick={() => onChange('SUN')}>Soleil</button>
      <button type="button" className="shade" aria-pressed={mode === 'SHADE'} onClick={() => onChange('SHADE')}>Ombre</button>
    </div>
  );
}

interface DiscoverScreenProps {
  currentDate: Date;
  userLocation: GeoPoint;
  mode: SunMode;
  onModeChange: (mode: SunMode) => void;
  onCategorySelect: (category: DiscoverCategory) => void;
}

export function DiscoverScreen({ currentDate, userLocation, mode, onModeChange, onCategorySelect }: DiscoverScreenProps) {
  const lightVars = useLightVars(currentDate);

  const menu = useMemo(() => {
    const lines = ENVIES.map((envie) => {
      const recs = RecommendationService.getAnswerList(mode, userLocation, currentDate, envie.categories, undefined, 20);
      const top = recs[0] as Recommendation | undefined;
      return {
        envie,
        top,
        count: recs.filter((r) => inItNow(r, mode)).length,
        // Rien à portée de pied (ex. les plages, depuis la Baixa) : le
        // quartier du n°1 dit où chercher, un compte de genre ne le dirait pas.
        far: top !== undefined && top.walkTimeMin > ANSWER_REACH_MIN,
      };
    }).filter((l) => l.top);

    // Le plat du jour : parmi les envies où l'on est dans la lumière voulue
    // maintenant, celle dont le meilleur lieu marque le mieux.
    const lit = lines.filter((l) => l.count > 0);
    const special = [...(lit.length > 0 ? lit : lines)].sort((a, b) => b.top!.sunMatch - a.top!.sunMatch)[0];
    return { special, others: lines.filter((l) => l !== special) };
  }, [mode, userLocation, currentDate]);

  // Le dessert : le dernier rayon sur l'eau ce soir, sinon le coucher officiel.
  const dessert = useMemo(() => {
    const light = SunsetService.waterSunsets(VenueService.getAllVenues(), currentDate)[0];
    return light
      ? { time: formatLisbonTime(light.time), where: `${light.venue.name}, sur l'eau` }
      : { time: formatLisbonTime(SunService.getSunset(currentDate)), where: 'Plein ouest' };
  }, [currentDate]);

  const venueCount = VenueService.getAllVenues().length;
  const select = (envie: Envie) => onCategorySelect({ ...envie, mode: envie.mode === 'ANY' ? mode : envie.mode });
  const { special, others } = menu;
  const isSun = mode === 'SUN';

  return (
    <div className="cdj h-full overflow-y-auto no-scrollbar pb-24" style={lightVars}>
      <header className="cdj-hero" style={{ backgroundImage: special ? `url(${PHOTO[special.envie.id]})` : undefined }}>
        <div className="cdj-bar">
          <span className="cdj-st"><i className="orb" aria-hidden="true" />Lisboa · {formatLisbonTime(currentDate)}</span>
          <ModeToggle mode={mode} onChange={onModeChange} />
        </div>
        <h1>Aujourd'hui dehors</h1>
        <p className="sub">Choisis une envie, on te dit où et jusqu'à quand.</p>
      </header>

      <section className="cdj-card" aria-label="La carte du jour">
        <div className="cdj-menuhead">
          <h2>La carte du jour</h2>
          <span>{DAY_LABEL.format(currentDate)}</span>
        </div>
        <div className="cdj-rule" />

        {special?.top && (
          <>
            <button type="button" className="cdj-special" onClick={() => select(special.envie)}>
              <span className="cdj-tag">Plat du jour</span>
              <b>{special.envie.label} {isSun ? 'au soleil' : 'au frais'}</b>
              <span className="where">{special.top.venue.name} · {travelLabel(special.top)}</span>
              <UntilPrice rec={special.top} mode={mode} />
            </button>
            <HourBand venue={special.top.venue} date={currentDate} />
            <div className="cdj-ticks" aria-hidden="true">
              <span>{BAND_FROM}h</span><span>14h</span><span>{BAND_TO}h</span>
            </div>
          </>
        )}

        {others.map(({ envie, top, count, far }) => (
          <button key={envie.id} type="button" className="cdj-line" onClick={() => select(envie)}>
            <span className="cdj-th" style={{ backgroundImage: `url(${PHOTO[envie.id]})` }} aria-hidden="true" />
            <span className="cdj-nm">
              <b>{envie.label}</b>
              <i aria-hidden="true" />
              <em>
                {far
                  ? `${VenueService.getNeighborhood(top!.venue)} · ${count || '?'}`
                  : count > 0
                    ? `${count} ${envie.noun[count > 1 ? 1 : 0]}`
                    : 'plus tard'}
              </em>
            </span>
            <UntilPrice rec={top!} mode={mode} />
          </button>
        ))}

        <button type="button" className="cdj-dessert" onClick={() => select(BELLE_LUMIERE)}>
          <span className="cdj-th" style={{ backgroundImage: `url(${PHOTO.best_light})` }} aria-hidden="true" />
          <span>
            <b>Le dessert : le coucher</b>
            <span>{dessert.where}</span>
          </span>
          <strong>{dessert.time}</strong>
        </button>
      </section>

      <p className="cdj-more">{ENVIES.length + 1} envies · {venueCount} lieux calculés à l'ombre des vrais bâtiments</p>
    </div>
  );
}

interface DiscoverResultsProps {
  category: DiscoverCategory;
  currentDate: Date;
  userLocation: GeoPoint;
  savedVenueIds: string[];
  onBack: () => void;
  onVenueSelect: (venueId: string) => void;
  onDirections: (venueId: string) => void;
  onSave: (venueId: string) => void;
}

export function DiscoverResults({
  category, currentDate, userLocation, savedVenueIds, onBack, onVenueSelect, onDirections, onSave,
}: DiscoverResultsProps) {
  const mode = (category.mode === 'ANY' ? 'SUN' : category.mode) as SunMode;
  const isSun = mode === 'SUN';
  const lightVars = useLightVars(currentDate);
  const recs = useMemo(
    () => RecommendationService.getAnswerList(mode, userLocation, currentDate, category.categories, undefined, 20),
    [mode, userLocation, currentDate, category.categories]
  );
  const count = recs.filter((r) => inItNow(r, mode)).length;

  return (
    <div className="cdj h-full overflow-y-auto no-scrollbar pb-24 animate-slide-in-right motion-reduce:animate-none" style={lightVars}>
      <header className="cdj-hero" style={{ backgroundImage: PHOTO[category.id] ? `url(${PHOTO[category.id]})` : undefined, backgroundPosition: '50% 70%' }}>
        <div className="cdj-bar">
          <button type="button" className="cdj-st" onClick={onBack}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            La carte
          </button>
          <span className="cdj-st cdj-st--gold">
            {count > 0 ? `${count} ${isSun ? 'au soleil' : 'au frais'}` : isSun ? 'soleil plus tard' : 'ombre plus tard'}
          </span>
        </div>
        <h1>{category.label}</h1>
        <p className="sub">{category.description}, {isSun ? 'du plus longtemps au soleil' : 'du plus longtemps au frais'}.</p>
      </header>

      <div className="cdj-tickets">
        {recs.length === 0 && (
          <div className="cdj-ticket"><p>Aucun lieu ouvert de ce genre pour l'instant.</p></div>
        )}
        {recs.map((rec, idx) => {
          const saved = savedVenueIds.includes(rec.venue.id);
          return (
            <article key={rec.venue.id} className={`cdj-ticket${isSun ? '' : ' shade'}`}>
              <button type="button" onClick={() => onVenueSelect(rec.venue.id)}>
                <div className="h">
                  <span className="rk">{idx + 1}</span>
                  <div className="min-w-0">
                    <h3>{rec.venue.name}</h3>
                    <p>{VenueService.getNeighborhood(rec.venue)} · {categoryLabel(rec.venue.category).toLowerCase()} · {travelLabel(rec)}</p>
                  </div>
                  <UntilPrice rec={rec} mode={mode} />
                </div>
                <HourBand venue={rec.venue} date={currentDate} />
              </button>
              {idx === 0 && (
                <div className="cdj-cta">
                  <button type="button" onClick={() => onDirections(rec.venue.id)}>M'y emmener</button>
                  <button type="button" className="g" aria-pressed={saved} onClick={() => onSave(rec.venue.id)}>
                    {saved ? 'Gardé' : 'Garder'}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
