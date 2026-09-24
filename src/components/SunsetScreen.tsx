import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GeoPoint, SunMode, Venue } from '@/types';
import { SunsetService, type LastLight, type SunsetMoment } from '@/services/SunsetService';
import { SunService } from '@/services/SunService';
import { VenueService } from '@/services/VenueService';
import { VenueSunService } from '@/services/VenueSunService';
import { RecommendationService } from '@/services/RecommendationService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { formatLisbonTime, lisbonMinutesOfDay } from '@/utils/lisbonTime';
import { categoryLabel, formatGap, travelLabel } from '@/utils/copy';
import { inviteUrl, shareInvite, sunsetInviteText } from '@/utils/share';

// ---------------------------------------------------------------------------
// « Plein ouest » — l'heure qui précède le coucher, quand un lieu à portée de
// pied voit le soleil toucher l'eau. L'écran passe à la nuit océan : ciel en
// strates nettes, bande de lumière posée SUR l'horizon, et le soleil qui y
// descend jusqu'à la minute calculée par SunsetService (relief + bâtiments +
// DSM jusqu'à 40 km), pas jusqu'à l'heure officielle.
// ---------------------------------------------------------------------------

interface SunsetScreenProps {
  moment: SunsetMoment;
  now: Date;
  userLocation: GeoPoint;
  place: string;
  mode: SunMode;
  onModeChange: (mode: SunMode) => void;
  onDirections: (venueId: string) => void;
  onVenueSelect: (venueId: string) => void;
}

/** Les strates du ciel, du zénith à l'horizon (y en px du viewBox 390×460). */
const SKY_BANDS = [
  { y: 0, h: 84, fill: '#0F2263' },
  { y: 84, h: 70, fill: '#1A3383' },
  { y: 154, h: 60, fill: '#2F4C9E' },
  { y: 214, h: 50, fill: '#C9606A' },
  { y: 264, h: 46, fill: '#EE8150' },
  { y: 310, h: 40, fill: '#FFAA57' },
  { y: 350, h: 34, fill: '#FFD28A' },
];
const HORIZON_Y = 384;
const RIBBON_X0 = 24;
const RIBBON_STEP = 22.8;
const RIBBON_FIRST_HOUR = 6;
const RIBBON_HOURS = 15; // 06 → 20
/** Px par minute de descente : une heure avant, le soleil est ~150 px haut. */
const DESCENT_PX_PER_MIN = 2.4;

const timeX = (d: Date) => RIBBON_X0 + ((lisbonMinutesOfDay(d) - RIBBON_FIRST_HOUR * 60) / 60) * RIBBON_STEP;
const minutesBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 60000);

export function SunsetScreen({
  moment,
  now,
  userLocation,
  place,
  mode,
  onModeChange,
  onDirections,
  onVenueSelect,
}: SunsetScreenProps) {
  const [pickIndex, setPickIndex] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'failed'>('idle');

  // Une nouvelle sélection (autre minute, autre position) invalide le curseur.
  useEffect(() => setPickIndex(0), [moment]);
  useEffect(() => {
    if (shareState === 'idle') return;
    const t = setTimeout(() => setShareState('idle'), 2500);
    return () => clearTimeout(t);
  }, [shareState]);

  const pick = moment.picks[pickIndex] ?? moment.picks[0];
  const { venue } = pick.light;
  const lastLight = pick.light.time;
  const minutesToOfficial = minutesBetween(now, moment.officialSunset);

  const handleShare = useCallback(async () => {
    const result = await shareInvite(
      sunsetInviteText(venue.name, formatLisbonTime(lastLight)),
      inviteUrl(window.location.origin, venue.id)
    );
    if (result === 'copied' || result === 'failed') setShareState(result);
  }, [venue, lastLight]);

  return (
    <div className="absolute inset-0 overflow-y-auto bg-dusk-night pb-28 text-dusk-shell">
      {/* --- le ciel en strates, la bande posée sur l'horizon ---------------- */}
      <header className="relative pt-[env(safe-area-inset-top)]">
        <DuskSky venue={venue} now={now} lastLight={lastLight} />
        <div className="absolute inset-x-6 top-[calc(env(safe-area-inset-top)+44px)] flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-dusk-mist">{place}</p>
            <h1 className="mt-0.5 font-display text-[3.3rem] font-extrabold min-[380px]:text-[4.25rem] leading-[0.95] tracking-[-0.02em] tabular-nums [font-stretch:80%]">
              {formatLisbonTime(now)}
            </h1>
            <p className="mt-2 text-[14px] leading-snug">
              {minutesToOfficial > 0 ? (
                <>
                  Le soleil se couche dans{' '}
                  <span className="whitespace-nowrap font-semibold">{formatGap(minutesToOfficial)}</span>.
                </>
              ) : (
                <>Le soleil est à l'horizon.</>
              )}
            </p>
          </div>
          <DuskModeSwitch mode={mode} onModeChange={onModeChange} />
        </div>
      </header>

      {/* --- la réponse ---------------------------------------------------- */}
      <section className="-mt-1 px-6">
        <div className="-mr-2.5 flex items-start justify-between gap-3">
          <h2 className="font-display text-[1.95rem] font-bold leading-[1.04] tracking-[-0.015em] [font-stretch:85%] [text-wrap:balance]">
            Va voir le soleil <span className="text-dusk-fire">plonger</span> dans l'eau.
          </h2>
          <button
            onClick={handleShare}
            aria-label="Inviter quelqu'un"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-dusk-mist active:scale-90 transition-transform"
          >
            <ShareIcon />
          </button>
        </div>

        <button onClick={() => setSheetOpen(true)} className="mt-4 block text-left active:opacity-70 transition-opacity">
          <span className="block font-display text-[1.35rem] font-semibold leading-tight">{venue.name}</span>
          <span className="mt-0.5 block text-[13px] text-dusk-sub">
            {categoryLabel(venue.category)}, {VenueService.getNeighborhood(venue)}
          </span>
        </button>

        <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-dusk-line pt-3.5">
          <Stat value={formatLisbonTime(lastLight)} label="il disparaît dans l'eau" accent />
          <Stat value={`${pick.walkMin} min`} label="à pied" />
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="order-2 text-[12px] leading-snug text-dusk-sub">océan à l'horizon</dt>
            <dd className="order-1 h-[22px]">
              <WavesIcon />
            </dd>
          </div>
        </dl>

        {shareState !== 'idle' && (
          <p role="status" className="mt-3.5 text-center text-[12.5px] font-semibold">
            {shareState === 'copied' ? 'Invitation copiée — colle-la dans ta conversation.' : 'Copie impossible sur cet appareil.'}
          </p>
        )}

        <div className="mt-5 flex gap-2.5">
          <button
            onClick={() => onDirections(venue.id)}
            className="min-h-[52px] flex-1 rounded-full bg-dusk-fire text-[16px] font-bold text-dusk-night active:scale-[0.98] transition-transform"
          >
            J'y vais
          </button>
          {moment.picks.length > 1 && (
            <button
              onClick={() => setPickIndex((i) => (i + 1) % moment.picks.length)}
              className="min-h-[52px] rounded-full border border-dusk-edge px-5 text-[15px] font-semibold active:scale-[0.98] transition-transform"
            >
              Autre spot
            </button>
          )}
        </div>

        <button
          onClick={() => setSheetOpen(true)}
          className="mt-3 min-h-11 w-full text-center text-[13.5px] font-semibold text-dusk-glow active:opacity-70"
        >
          Voir le coucher minute par minute
        </button>
      </section>

      {sheetOpen && (
        <SunsetSheet
          light={pick.light}
          walkMin={pick.walkMin}
          officialSunset={moment.officialSunset}
          elsewhere={moment.elsewhere}
          now={now}
          userLocation={userLocation}
          onClose={() => setSheetOpen(false)}
          onDirections={() => onDirections(venue.id)}
          onVenueSelect={onVenueSelect}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DuskSky({ venue, now, lastLight }: { venue: Venue; now: Date; lastLight: Date }) {
  const hourly = useMemo(() => VenueSunService.getSunExposureByHour(venue, lisbonBuildings, now), [venue, now]);
  const lastHour = Math.floor(lisbonMinutesOfDay(lastLight) / 60);

  const sunX = timeX(now);
  const sunY = Math.max(190, HORIZON_Y - minutesBetween(now, lastLight) * DESCENT_PX_PER_MIN);
  const touchX = timeX(lastLight);

  return (
    <svg viewBox="0 0 390 460" className="block h-auto w-full" aria-hidden="true">
      <defs>
        <clipPath id="dusk-above">
          <rect x="0" y="0" width="390" height={HORIZON_Y} />
        </clipPath>
      </defs>
      {SKY_BANDS.map((b) => (
        <rect key={b.y} x="0" y={b.y} width="390" height={b.h} fill={b.fill} />
      ))}
      <rect x="0" y={HORIZON_Y} width="390" height={460 - HORIZON_Y} fill="#0B1A45" />

      {/* la course restante, jusqu'à la minute où il touche l'eau */}
      <path
        d={`M${sunX} ${sunY} L${touchX} ${HORIZON_Y - 6}`}
        stroke="#0B1A45"
        strokeWidth="2"
        strokeDasharray="3 4"
        strokeLinecap="round"
      />
      <g clipPath="url(#dusk-above)">
        <circle cx={sunX} cy={sunY} r="34" fill="#FFF1CF" fillOpacity="0.22" />
        <circle cx={sunX} cy={sunY} r="22" fill="#FFF1CF" />
      </g>

      {/* la bande de lumière du lieu, heure par heure, posée sur l'horizon */}
      {Array.from({ length: RIBBON_HOURS }, (_, i) => {
        const hour = RIBBON_FIRST_HOUR + i;
        const x = RIBBON_X0 + i * RIBBON_STEP;
        const fill = hour > lastHour ? '#1B2C66' : hour === lastHour ? '#FF6A2B' : '#FFB35C';
        const opacity = hour >= lastHour ? 1 : Math.max(0.15, (hourly[hour] ?? 0) / 100);
        return <rect key={hour} x={x} y={HORIZON_Y - 7} width={RIBBON_STEP - 2} height="14" fill={fill} fillOpacity={opacity} />;
      })}
      <rect x={sunX - 1.25} y={HORIZON_Y - 16} width="2.5" height="32" fill="#FFF6EC" />
      <circle cx={touchX} cy={HORIZON_Y} r="5" fill="none" stroke="#FFF6EC" strokeWidth="2" />

      {/* le reflet sous le point de contact */}
      {[70, 50, 30, 16].map((w, i) => (
        <rect
          key={w}
          x={touchX - w / 2}
          y={HORIZON_Y + 20 + i * 11}
          width={w}
          height={3 - i * 0.3}
          fill="#FFAA57"
          fillOpacity={1 - i * 0.23}
        />
      ))}
      {[6, 12, 15].map((h) => (
        <text key={h} x={RIBBON_X0 + (h - RIBBON_FIRST_HOUR) * RIBBON_STEP} y={HORIZON_Y + 28} fontSize="11" fill="#8FA3D6" className="font-mono">
          {String(h).padStart(2, '0')}
        </text>
      ))}
      <text x={touchX - 12} y={HORIZON_Y - 14} textAnchor="end" fontSize="12" fill="#0B1A45" fontWeight="500">
        touche l'eau à <tspan className="font-mono" fontWeight="600">{formatLisbonTime(lastLight)}</tspan>
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------------

function SunsetSheet({
  light,
  walkMin,
  officialSunset,
  elsewhere,
  now,
  userLocation,
  onClose,
  onDirections,
  onVenueSelect,
}: {
  light: LastLight;
  walkMin: number;
  officialSunset: Date;
  elsewhere: LastLight[];
  now: Date;
  userLocation: GeoPoint;
  onClose: () => void;
  onDirections: () => void;
  onVenueSelect: (venueId: string) => void;
}) {
  const { venue } = light;
  const left = minutesBetween(now, light.time);

  // La saison, calculée pour CE lieu : en juin le coucher passe au nord-ouest.
  const season = useMemo(() => {
    const year = now.getFullYear();
    const june = SunsetService.lastLight(venue, new Date(Date.UTC(year, 5, 21, 12)));
    const march = SunsetService.lastLight(venue, new Date(Date.UTC(year, 2, 20, 12)));
    return {
      juneHidden: june !== null && june.over !== 'water',
      marchWater: march?.over === 'water',
    };
  }, [venue, now]);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end bg-dusk-deep/70" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Coucher à ${venue.name}`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] overflow-y-auto rounded-t-[28px] bg-dusk-night px-6 pb-[calc(env(safe-area-inset-bottom)+28px)] pt-2.5 text-dusk-shell"
      >
        <div className="flex justify-center">
          <span className="h-[5px] w-10 rounded-full bg-dusk-edge" />
        </div>

        <div className="mt-3.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[2.1rem] font-bold leading-[1.02] tracking-[-0.015em] [font-stretch:85%]">
              {venue.name}
            </h2>
            <p className="mt-1.5 text-[13.5px] text-dusk-sub">
              {categoryLabel(venue.category)}, {VenueService.getNeighborhood(venue)} · {walkMin} min à pied
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-dusk-panel active:scale-90 transition-transform"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="mt-6">
          <p className="text-[14px] font-medium text-dusk-mist">Il touche l'eau dans</p>
          <p className="mt-0.5 font-display text-[4.5rem] font-extrabold leading-[0.95] tracking-[-0.025em] text-dusk-fire [font-stretch:78%]">
            {formatGap(Math.max(0, left))}
          </p>
          <p className="mt-2 text-[14px] leading-snug text-dusk-mist">
            À <span className="font-mono font-semibold text-dusk-shell">{formatLisbonTime(light.time)}</span> ce soir.
            Coucher officiel à <span className="font-mono font-semibold text-dusk-shell">{formatLisbonTime(officialSunset)}</span>.
          </p>
        </div>

        <div className="mt-6">
          <HorizonProfile venue={venue} now={now} lastLight={light.time} />
          <p className="mt-3 text-[14px] leading-relaxed text-dusk-mist">
            <span className="font-semibold text-dusk-shell">Rien entre toi et l'horizon.</span>
            {light.minutesAfterOfficial > 0 &&
              ` ${light.minutesAfterOfficial} min de plus que le coucher officiel.`}
            {season.juneHidden &&
              (season.marchWater
                ? ' En juin, il passera derrière les collines : ce spot marche de septembre à mars.'
                : ' En juin, il passera derrière les collines.')}
          </p>
        </div>

        <LastMinutes now={now} lastLight={light.time} />

        {elsewhere.length > 0 && (
          <div className="mt-6 border-t border-dusk-line pt-4">
            <p className="text-[15px] font-semibold">Ailleurs ce soir</p>
            <ul className="mt-2">
              {elsewhere.map((other) => (
                <ElsewhereRow
                  key={other.venue.id}
                  light={other}
                  userLocation={userLocation}
                  now={now}
                  onSelect={() => onVenueSelect(other.venue.id)}
                />
              ))}
            </ul>
          </div>
        )}

        <div className="mt-6 flex gap-2.5">
          <button
            onClick={onDirections}
            className="min-h-[52px] flex-1 rounded-full bg-dusk-fire text-[16px] font-bold text-dusk-night active:scale-[0.98] transition-transform"
          >
            J'y vais
          </button>
          <button
            onClick={() => onVenueSelect(venue.id)}
            className="min-h-[52px] rounded-full border border-dusk-edge px-5 text-[15px] font-semibold active:scale-[0.98] transition-transform"
          >
            La fiche
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Le profil d'horizon, tracé depuis les données : x = azimut autour du point
 * où le soleil touche, y = élévation. Sous la ligne, l'eau et la terre telles
 * que les a classées le script ; au-dessus, la course du soleil jusqu'au
 * contact. Rien de dessiné à la main.
 */
function HorizonProfile({ venue, now, lastLight }: { venue: Venue; now: Date; lastLight: Date }) {
  const W = 342;
  const H = 236;
  const TOP = 24;
  const PLOT_H = 186;

  const data = useMemo(() => {
    const at = (d: Date) => SunService.getSunPosition(d, venue.latitude, venue.longitude);
    const touch = at(lastLight);
    const start = at(now);
    const azMin = Math.min(start.azimuth, touch.azimuth) - 8;
    const azMax = Math.max(start.azimuth, touch.azimuth) + 16;
    // Élévation apparente : le script cache le soleil à horizon − 0,833°.
    const path: { az: number; el: number }[] = [];
    for (let t = now.getTime(); t <= lastLight.getTime(); t += 10 * 60000) {
      const p = at(new Date(t));
      path.push({ az: p.azimuth, el: p.elevation + 0.833 });
    }
    path.push({ az: touch.azimuth, el: touch.elevation + 0.833 });
    const horizon: { az: number; angle: number; water: boolean }[] = [];
    for (let az = azMin; az <= azMax; az += 0.5) {
      const h = SunsetService.horizonAt(venue, az);
      if (h) horizon.push({ az, angle: h.angle, water: h.kind === 'water' });
    }
    const elMax = Math.max(2, path[0]?.el ?? 2) + 0.6;
    const elMin = Math.min(-0.6, ...horizon.map((h) => h.angle)) - 0.4;
    return { path, horizon, azMin, azMax, elMin, elMax };
  }, [venue, now, lastLight]);

  const x = (az: number) => ((az - data.azMin) / (data.azMax - data.azMin)) * W;
  const y = (el: number) => TOP + ((data.elMax - el) / (data.elMax - data.elMin)) * PLOT_H;

  const skyLine = data.horizon.map((h) => `${x(h.az).toFixed(1)},${y(h.angle).toFixed(1)}`).join(' ');
  const skyLineReversed = [...data.horizon]
    .reverse()
    .map((h) => `${x(h.az).toFixed(1)},${y(h.angle).toFixed(1)}`)
    .join(' ');
  const land = segments(data.horizon, (h) => !h.water);
  const touch = data.path[data.path.length - 1];
  const first = data.path[0];
  const touchTime = formatLisbonTime(lastLight);
  const leftWater = data.horizon[0]?.water;
  const rightWater = data.horizon[data.horizon.length - 1]?.water;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-auto w-full"
      role="img"
      aria-label={`Profil d'horizon : le soleil descend et touche l'eau à ${touchTime}`}
    >
      <defs>
        <clipPath id="profile-sky">
          <polygon points={`0,0 ${W},0 ${skyLineReversed}`} />
        </clipPath>
      </defs>
      {[
        { y: 0, h: 50, fill: '#1A3383' },
        { y: 50, h: 45, fill: '#2F4C9E' },
        { y: 95, h: 35, fill: '#C9606A' },
        { y: 130, h: 25, fill: '#EE8150' },
        { y: 155, h: 81, fill: '#FFD28A' },
      ].map((b) => (
        <rect key={b.y} x="0" y={b.y} width={W} height={b.h} fill={b.fill} />
      ))}
      {/* sous l'horizon : l'eau, puis la terre par-dessus */}
      <polygon points={`0,${H} ${skyLine} ${W},${H}`} fill="#10245E" />
      {land.map((seg, i) => (
        <g key={i}>
          <polygon
            points={`${x(seg[0].az)},${H} ${seg.map((h) => `${x(h.az)},${y(h.angle)}`).join(' ')} ${x(seg[seg.length - 1].az)},${H}`}
            fill="#08143A"
          />
          <polyline
            points={seg.map((h) => `${x(h.az)},${y(h.angle)}`).join(' ')}
            fill="none"
            stroke="#FFF6EC"
            strokeOpacity="0.5"
            strokeWidth="1.5"
          />
        </g>
      ))}
      <polyline
        points={segments(data.horizon, (h) => h.water)
          .map((seg) => seg.map((h) => `${x(h.az)},${y(h.angle)}`).join(' '))
          .join(' ')}
        fill="none"
        stroke="#FFF6EC"
        strokeWidth="1.5"
      />

      {/* la course du soleil, jusqu'au contact */}
      <polyline
        points={data.path.map((p) => `${x(p.az)},${y(p.el)}`).join(' ')}
        fill="none"
        stroke="#FFF6EC"
        strokeWidth="1.5"
        strokeDasharray="3 5"
        strokeLinecap="round"
      />
      {data.path.slice(1, -1).map((p, i) => (
        <circle key={i} cx={x(p.az)} cy={y(p.el)} r="9" fill="#FFF1CF" fillOpacity={0.3 + (i / data.path.length) * 0.3} />
      ))}
      {first && <circle cx={x(first.az)} cy={y(first.el)} r="12" fill="#FFF1CF" />}
      <g clipPath="url(#profile-sky)">
        <circle cx={x(touch.az)} cy={y(touch.el)} r="11" fill="#FF6A2B" />
      </g>
      {first && (
        <text x={x(first.az)} y={y(first.el) - 18} textAnchor="middle" fontSize="11.5" fontWeight="600" fill="#FFF6EC">
          maintenant
        </text>
      )}
      <text x={x(touch.az)} y={H - 8} textAnchor="middle" fontSize="12" fontWeight="600" fill="#FF6A2B" className="font-mono">
        {touchTime}
      </text>
      <text x="10" y={H - 26} fontSize="11" fill="#8FA3D6">
        {leftWater ? 'océan' : 'terre'}
      </text>
      <text x={W - 10} y={H - 26} textAnchor="end" fontSize="11" fill="#8FA3D6">
        {rightWater ? 'océan' : 'collines'}
      </text>
    </svg>
  );
}

/** Les suites contiguës qui vérifient `keep`. */
function segments<T>(items: T[], keep: (t: T) => boolean): T[][] {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const it of items) {
    if (keep(it)) cur.push(it);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out.filter((s) => s.length > 1);
}

// ---------------------------------------------------------------------------

/** Les dernières minutes en cases de 5 : ce qu'il reste, et quand ça s'arrête. */
function LastMinutes({ now, lastLight }: { now: Date; lastLight: Date }) {
  const CELLS = 15;
  const STEP = 5 * 60000;
  const W = 342;
  const cw = W / CELLS;
  // La dernière case allumée tombe à 2/3 de la bande, quelle que soit l'heure.
  const endIdx = 12;
  const t0 = lastLight.getTime() - endIdx * STEP;
  const nowIdx = (now.getTime() - t0) / STEP;
  const cells = Array.from({ length: CELLS }, (_, i) => t0 + i * STEP);
  const labelAt = (i: number) => formatLisbonTime(new Date(cells[i]));

  return (
    <div className="mt-6">
      <p className="text-[15px] font-semibold">Les dernières minutes</p>
      <svg viewBox={`0 0 ${W} 58`} className="mt-2.5 block h-auto w-full" aria-hidden="true">
        {cells.map((t, i) => {
          const lit = i < endIdx;
          const warmth = i / endIdx;
          return (
            <rect
              key={t}
              x={i * cw}
              y="8"
              width={cw - 2}
              height="28"
              fill={lit ? (warmth > 0.75 ? '#FF6A2B' : '#FFB35C') : '#1B2C66'}
              fillOpacity={lit ? 0.7 + warmth * 0.3 : 1}
            />
          );
        })}
        {nowIdx >= 0 && nowIdx <= CELLS && (
          <>
            <rect x={nowIdx * cw - 1.25} y="0" width="2.5" height="44" fill="#FFF6EC" />
            <text x={Math.min(W - 30, Math.max(30, nowIdx * cw))} y="55" textAnchor="middle" fontSize="11" fontWeight="600" fill="#FFF6EC">
              maintenant
            </text>
          </>
        )}
        <rect x={endIdx * cw - 1} y="0" width="1.5" height="44" fill="#FF6A2B" />
        <text x={endIdx * cw} y="55" textAnchor="middle" fontSize="11" fontWeight="600" fill="#FF6A2B" className="font-mono">
          {formatLisbonTime(lastLight)}
        </text>
        {nowIdx > 3 && (
          <text x="0" y="55" fontSize="11" fill="#8FA3D6" className="font-mono">
            {labelAt(0)}
          </text>
        )}
      </svg>
    </div>
  );
}

function ElsewhereRow({
  light,
  userLocation,
  now,
  onSelect,
}: {
  light: LastLight;
  userLocation: GeoPoint;
  now: Date;
  onSelect: () => void;
}) {
  const rec = useMemo(
    () => RecommendationService.getRecommendationFor(light.venue, 'SUN', userLocation, now),
    [light.venue, userLocation, now]
  );
  return (
    <li>
      <button onClick={onSelect} className="flex min-h-14 w-full items-center gap-3.5 py-2 text-left active:opacity-70 transition-opacity">
        <svg width="72" height="42" viewBox="0 0 72 42" className="shrink-0" aria-hidden="true">
          <rect x="0" y="0" width="72" height="16" fill="#2F4C9E" />
          <rect x="0" y="16" width="72" height="12" fill="#EE8150" />
          <rect x="0" y="28" width="72" height="14" fill="#10245E" />
          <path d="M0 28 L72 28" stroke="#FFF6EC" strokeWidth="1.5" />
          <clipPath id={`e-${light.venue.id}`}>
            <rect x="0" y="0" width="72" height="28" />
          </clipPath>
          <circle cx="40" cy="28" r="7" fill="#FF6A2B" clipPath={`url(#e-${light.venue.id})`} />
        </svg>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold">{light.venue.name}</span>
          <span className="block text-[13px] text-dusk-sub">
            dans l'eau à <span className="font-mono text-dusk-fire">{formatLisbonTime(light.time)}</span> · {travelLabel(rec)}
          </span>
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------

function Stat({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="order-2 text-[12px] leading-snug text-dusk-sub">{label}</dt>
      <dd className={`order-1 font-mono text-[22px] font-semibold leading-none ${accent ? 'text-dusk-fire' : ''}`}>{value}</dd>
    </div>
  );
}

function DuskModeSwitch({ mode, onModeChange }: { mode: SunMode; onModeChange: (mode: SunMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Chercher" className="flex shrink-0 rounded-full border border-dusk-edge bg-[#0A1B55] p-1">
      {(['SUN', 'SHADE'] as const).map((m) => (
        <button
          key={m}
          role="radio"
          aria-checked={mode === m}
          onClick={() => onModeChange(m)}
          className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
            mode === m ? 'bg-dusk-fire text-dusk-night' : 'text-dusk-shell'
          }`}
        >
          {m === 'SUN' ? 'Soleil' : 'Ombre'}
        </button>
      ))}
    </div>
  );
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FFF6EC" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function WavesIcon() {
  return (
    <svg width="34" height="22" viewBox="0 0 34 22" fill="none" stroke="#FFF6EC" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M2 8c4 0 4-4 8-4s4 4 8 4 4-4 8-4 4 4 6 4" />
      <path d="M2 17c4 0 4-4 8-4s4 4 8 4 4-4 8-4 4 4 6 4" />
    </svg>
  );
}
