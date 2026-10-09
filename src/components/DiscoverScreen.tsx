import { useMemo, type CSSProperties } from 'react';
import type { DiscoverCategory, GeoPoint, Recommendation, SunMode } from '@/types';
import { ANSWER_REACH_MIN, IN_IT_THRESHOLD, RecommendationService } from '@/services/RecommendationService';
import { VenueService } from '@/services/VenueService';
import { SunService } from '@/services/SunService';
import { SunsetService } from '@/services/SunsetService';
import { categoryLabel, travelLabel } from '@/utils/copy';
import { formatLisbonTime, APP_TIMEZONE } from '@/utils/lisbonTime';
import { lightCut } from '@/utils/lightCut';
import { useCycleScreen } from './useCycleScreen';
import { untilOf, BAND_FROM, BAND_TO } from '@/utils/carteDuJour';
import { HourBand } from './HourBand';
import { getLang, tr, useLang } from '@/utils/lang';
import './carteDuJour.css';

// ---------------------------------------------------------------------------
// Explorer = « la carte du jour » d'une esplanada. Chaque envie est une ligne
// de menu : à la place du prix, jusqu'à quand il y a de la lumière. Le « plat
// du jour » est l'envie qui marche le mieux maintenant ; sa photo prend
// l'en-tête. Le coucher ferme la carte, comme un dessert.
// ---------------------------------------------------------------------------

interface Envie extends Omit<DiscoverCategory, 'label' | 'description'> {
  photo: string;
}

const ENVIES: Envie[] = [
  { id: 'drink', icon: '', mode: 'ANY', categories: ['bar', 'rooftop'], photo: 'verre' },
  { id: 'coffee', icon: '', mode: 'ANY', categories: ['cafe'], photo: 'cafe' },
  { id: 'eat', icon: '', mode: 'ANY', categories: ['restaurant'], photo: 'manger' },
  { id: 'beach', icon: '', mode: 'ANY', categories: ['beach'], photo: 'plage' },
  { id: 'park', icon: '', mode: 'ANY', categories: ['park'], photo: 'parc' },
];

const BELLE_LUMIERE: Envie = {
  id: 'best_light', icon: '', mode: 'SUN', categories: ['viewpoint', 'square'], photo: 'lumiere',
};

type Pair = [fr: string, en: string];

/** Les mots d'une envie, dans les deux langues : lus au rendu, pas figés au
 *  chargement du module. `noun` : ce qu'on compte sur la ligne (« 4 terrasses »). */
const ENVIE_TEXT: Record<string, { label: Pair; description: Pair; noun: [one: Pair, many: Pair] }> = {
  drink: { label: ['Un verre', 'A drink'], description: ['Bars et rooftops', 'Bars and rooftops'], noun: [['bar', 'bar'], ['bars', 'bars']] },
  coffee: { label: ['Café', 'Coffee'], description: ['Terrasses de café', 'Café terraces'], noun: [['terrasse', 'terrace'], ['terrasses', 'terraces']] },
  eat: { label: ['Manger', 'Food'], description: ['Manger dehors', 'Eating outside'], noun: [['table', 'table'], ['tables', 'tables']] },
  beach: { label: ['Plage', 'Beach'], description: ["Au bord de l'eau", 'By the water'], noun: [['plage', 'beach'], ['plages', 'beaches']] },
  park: { label: ['Parc', 'Park'], description: ['Jardins et espaces verts', 'Gardens and green spaces'], noun: [['jardin', 'garden'], ['jardins', 'gardens']] },
  best_light: {
    label: ['Belle lumière', 'Good light'],
    description: ["Miradouros et places, pour l'heure dorée", 'Miradouros and squares, for golden hour'],
    noun: [['lieu', 'place'], ['lieux', 'places']],
  },
};

/** L'envie complète, avec ses mots dans la langue courante. */
function categoryOf(envie: Envie): DiscoverCategory {
  const t = ENVIE_TEXT[envie.id];
  return { ...envie, label: tr(...t.label), description: tr(...t.description) };
}

const nounOf = (envie: Envie, count: number) => tr(...ENVIE_TEXT[envie.id].noun[count > 1 ? 1 : 0]);

/** Graduation de la règle : « 14h » en français, « 14:00 » en anglais. */
const tick = (h: number) => (getLang() === 'en' ? `${h}:00` : `${h}h`);

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

/** Construit au rendu : la langue peut avoir changé depuis le chargement. */
const dayLabel = (d: Date) =>
  new Intl.DateTimeFormat(getLang() === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'short', timeZone: APP_TIMEZONE }).format(d);

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
    <div className="cdj-seg" role="group" aria-label={tr('Lumière', 'Light')}>
      <button type="button" aria-pressed={mode === 'SUN'} onClick={() => onChange('SUN')}>{tr('Soleil', 'Sun')}</button>
      <button type="button" className="shade" aria-pressed={mode === 'SHADE'} onClick={() => onChange('SHADE')}>{tr('Ombre', 'Shade')}</button>
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
  const cyc = useCycleScreen(currentDate, mode);
  const lang = useLang();

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
      ? { time: formatLisbonTime(light.time), where: tr(`${light.venue.name}, sur l'eau`, `${light.venue.name}, on the water`) }
      : { time: formatLisbonTime(SunService.getSunset(currentDate)), where: tr('Plein ouest', 'Due west') };
    // `lang` : le texte du dessert change avec la langue.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `lang` : tr() lit la langue hors de React, le texte du memo doit suivre la bascule.
  }, [currentDate, lang]);

  const venueCount = VenueService.getAllVenues().length;
  const select = (envie: Envie) => onCategorySelect({ ...categoryOf(envie), mode: envie.mode === 'ANY' ? mode : envie.mode });
  const { special, others } = menu;
  const isSun = mode === 'SUN';

  return (
    <div className="cdj h-full overflow-y-auto no-scrollbar pb-24" style={{ ...lightVars, ...cyc.vars }} {...cyc.attrs}>
      <header className="cdj-hero" style={{ backgroundImage: special ? `url(${PHOTO[special.envie.id]})` : undefined }}>
        <div className="cdj-bar">
          <span className="cdj-st"><i className="orb" aria-hidden="true" />Lisboa · {formatLisbonTime(currentDate)}</span>
          <ModeToggle mode={mode} onChange={onModeChange} />
        </div>
        <h1>{tr("Aujourd'hui dehors", 'Out today')}</h1>
        <p className="sub">{tr("Choisis une envie, on te dit où et jusqu'à quand.", 'Pick a mood, we’ll tell you where and until when.')}</p>
      </header>

      <section className="cdj-card" aria-label={tr('La carte du jour', 'Today’s map')}>
        <div className="cdj-menuhead">
          <h2>{tr('La carte du jour', 'Today’s map')}</h2>
          <span>{dayLabel(currentDate)}</span>
        </div>
        <div className="cdj-rule" />

        {special?.top && (
          <>
            <button type="button" className="cdj-special" onClick={() => select(special.envie)}>
              <span className="cdj-tag">{tr('Plat du jour', 'Today’s special')}</span>
              <b>{tr(...ENVIE_TEXT[special.envie.id].label)} {isSun ? tr('au soleil', 'in the sun') : tr('au frais', 'in the shade')}</b>
              <span className="where">{special.top.venue.name} · {travelLabel(special.top)}</span>
              <UntilPrice rec={special.top} mode={mode} />
            </button>
            <HourBand venue={special.top.venue} date={currentDate} mode={mode} />
            <div className="cdj-ticks" aria-hidden="true">
              <span>{tick(BAND_FROM)}</span><span>{tick(14)}</span><span>{tick(BAND_TO)}</span>
            </div>
          </>
        )}

        {others.map(({ envie, top, count, far }) => (
          <button key={envie.id} type="button" className="cdj-line" onClick={() => select(envie)}>
            <span className="cdj-th" style={{ backgroundImage: `url(${PHOTO[envie.id]})` }} aria-hidden="true" />
            <span className="cdj-nm">
              <b>{tr(...ENVIE_TEXT[envie.id].label)}</b>
              <i aria-hidden="true" />
              <em>
                {far
                  ? // Rien à compter (la nuit, par exemple) : le quartier seul, pas « Almada · ? ».
                    `${VenueService.getNeighborhood(top!.venue)}${count > 0 ? ` · ${count} ${nounOf(envie, count)}` : ''}`
                  : count > 0
                    ? `${count} ${nounOf(envie, count)}`
                    : tr('plus tard', 'later')}
              </em>
            </span>
            <UntilPrice rec={top!} mode={mode} />
          </button>
        ))}

        <button type="button" className="cdj-dessert" onClick={() => select(BELLE_LUMIERE)}>
          <span className="cdj-th" style={{ backgroundImage: `url(${PHOTO.best_light})` }} aria-hidden="true" />
          <span>
            <b>{tr('Le dessert : le coucher', 'Dessert: the sunset')}</b>
            <span>{dessert.where}</span>
          </span>
          <strong>{dessert.time}</strong>
        </button>
      </section>

      <p className="cdj-more">
        {tr(
          `${ENVIES.length + 1} envies · ${venueCount} lieux calculés à l'ombre des vrais bâtiments`,
          `${ENVIES.length + 1} moods · ${venueCount} places worked out from the shadows of real buildings`
        )}
      </p>
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
  const cyc = useCycleScreen(currentDate, mode);
  useLang();
  // L'envie arrive figée dans la langue du moment du choix : on relit ses mots
  // par son id pour suivre une bascule de langue faite entre-temps.
  const text = ENVIE_TEXT[category.id];
  const label = text ? tr(...text.label) : category.label;
  const description = text ? tr(...text.description) : category.description;
  const recs = useMemo(
    () => RecommendationService.getAnswerList(mode, userLocation, currentDate, category.categories, undefined, 20),
    [mode, userLocation, currentDate, category.categories]
  );
  const count = recs.filter((r) => inItNow(r, mode)).length;

  return (
    <div className="cdj h-full overflow-y-auto no-scrollbar pb-24 animate-slide-in-right motion-reduce:animate-none" style={{ ...lightVars, ...cyc.vars }} {...cyc.attrs}>
      <header className="cdj-hero" style={{ backgroundImage: PHOTO[category.id] ? `url(${PHOTO[category.id]})` : undefined, backgroundPosition: '50% 70%' }}>
        <div className="cdj-bar">
          <button type="button" className="cdj-st" onClick={onBack}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            {tr('La carte', 'Back')}
          </button>
          <span className="cdj-st cdj-st--gold">
            {count > 0
              ? `${count} ${isSun ? tr('au soleil', 'in the sun') : tr('au frais', 'in the shade')}`
              : isSun
                ? tr('soleil plus tard', 'sun later')
                : tr('ombre plus tard', 'shade later')}
          </span>
        </div>
        <h1>{label}</h1>
        <p className="sub">
          {description}, {isSun ? tr('du plus longtemps au soleil', 'longest in the sun first') : tr('du plus longtemps au frais', 'longest in the shade first')}.
        </p>
      </header>

      <div className="cdj-tickets">
        {recs.length === 0 && (
          <div className="cdj-ticket"><p>{tr("Aucun lieu ouvert de ce genre pour l'instant.", 'Nothing like this is open right now.')}</p></div>
        )}
        {recs.map((rec, idx) => {
          const saved = savedVenueIds.includes(rec.venue.id);
          return (
            <article key={rec.venue.id} className={`cdj-ticket${isSun ? '' : ' shade'}`} {...cyc.card(rec.sunPercentage >= IN_IT_THRESHOLD.SUN)}>
              <button type="button" onClick={() => onVenueSelect(rec.venue.id)}>
                <div className="h">
                  <span className="rk">{idx + 1}</span>
                  <div className="min-w-0">
                    <h3>{rec.venue.name}</h3>
                    <p>{VenueService.getNeighborhood(rec.venue)} · {categoryLabel(rec.venue.category).toLowerCase()} · {travelLabel(rec)}</p>
                  </div>
                  <UntilPrice rec={rec} mode={mode} />
                </div>
                <HourBand venue={rec.venue} date={currentDate} mode={mode} />
              </button>
              {idx === 0 && (
                <div className="cdj-cta">
                  <button type="button" onClick={() => onDirections(rec.venue.id)}>{tr("M'y emmener", 'Take me there')}</button>
                  <button type="button" className="g" aria-pressed={saved} onClick={() => onSave(rec.venue.id)}>
                    {saved ? tr('Gardé', 'Saved') : tr('Garder', 'Save')}
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
