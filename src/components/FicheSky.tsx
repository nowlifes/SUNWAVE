import { useId, useMemo } from 'react';
import type { Venue } from '@/types';
import { IN_IT_THRESHOLD } from '@/services/RecommendationService';
import { SunService } from '@/services/SunService';
import { SunsetService } from '@/services/SunsetService';
import { VenueSunService } from '@/services/VenueSunService';
import { lisbonBuildings } from '@/data/lisbonBuildings';
import { lisbonMinutesOfDay, setLisbonTime } from '@/utils/lisbonTime';
import { haloLook } from '@/utils/halo';
import { lastRayMinute, sunGlyph } from '@/utils/ficheSky';
import { DAY, LIGHT, NIGHT } from '@/utils/palette';

// ---------------------------------------------------------------------------
// Le ciel de la fiche : strates du jour, le disque du soleil et son halo à
// sa vraie place, l'horizon du lieu (relevé jusqu'à 40 km quand on l'a), et
// le point où son dernier rayon disparaît. Au coucher, le halo passe braise
// et s'aplatit sur l'horizon, là où il disparaît.
// ---------------------------------------------------------------------------

const W = 390;
const H = 210;
const HORIZON = 188;
const PX_PER_DEG = 5;
const AZ_SPAN = 70;
const BANDS = [
  { y: 0, h: 80, fill: DAY.sky1 },
  { y: 80, h: 45, fill: DAY.sky2 },
  { y: 125, h: 40, fill: DAY.sky3 },
  { y: 165, h: HORIZON - 165, fill: DAY.sky4 },
];

const hhmm = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function FicheSky({ venue, date }: { venue: Venue; date: Date }) {
  const glowId = useId();
  const sky = useMemo(() => {
    const nowMin = lisbonMinutesOfDay(date);
    // Le dernier rayon vient de la même courbe que tous les chiffres de la
    // fiche (bâtiments + relief proche) : sinon le ciel contredirait « au
    // soleil jusqu'à 19:30 ». Le relevé d'horizon à 40 km ne donne que la
    // légende (« dans l'eau », « caché par le relief ») quand il concorde.
    const lastRayMin = lastRayMinute(VenueSunService.getSunExposureByQuarter(venue, lisbonBuildings, date), IN_IT_THRESHOLD.SUN);
    const lastLight = SunsetService.lastLight(venue, date);
    const agrees = lastLight !== null && lastRayMin !== null && Math.abs(lisbonMinutesOfDay(lastLight.time) - lastRayMin) <= 15;
    const now = SunService.getSunPosition(date, venue.latitude, venue.longitude);
    const last =
      lastRayMin === null
        ? null
        : SunService.getSunPosition(setLisbonTime(date, Math.floor(lastRayMin / 60), lastRayMin % 60), venue.latitude, venue.longitude);
    const azC = last?.azimuth ?? now.azimuth;
    const x = (az: number) => W / 2 + ((az - azC) / AZ_SPAN) * W;
    const y = (el: number) => Math.max(26, HORIZON - el * PX_PER_DEG);
    // Horizon relevé seulement vers l'ouest : ailleurs, on prolonge la valeur
    // connue la plus proche (pas de falaise au bord du relevé), ou 0°.
    const azs: number[] = [];
    for (let az = azC - AZ_SPAN / 2 - 2; az <= azC + AZ_SPAN / 2 + 2; az += 1) azs.push(az);
    const raw = azs.map((az) => SunsetService.horizonAt(venue, az)?.angle ?? null);
    const known = raw.map((v, i) => ({ v, i })).filter((k) => k.v !== null) as { v: number; i: number }[];
    const angles = raw.map((v, i) => {
      if (v !== null) return v;
      if (known.length === 0) return 0;
      return known.reduce((best, k) => (Math.abs(k.i - i) < Math.abs(best.i - i) ? k : best)).v;
    });
    const angleAt = (az: number) => angles[Math.max(0, Math.min(angles.length - 1, Math.round(az - azs[0])))];
    const line = azs.map((az, i) => `${x(az).toFixed(1)},${y(angles[i]).toFixed(1)}`);
    const caption = agrees ? (lastLight!.over === 'water' ? "dans l'eau" : 'caché par le relief') : 'dernier rayon';
    const glyph = sunGlyph({ nowMin, lastRayMin, elevation: now.elevation });
    const lastPt = last ? { x: x(last.azimuth), y: y(angleAt(last.azimuth)) } : null;
    // Au ras de l'horizon, la braise se pose sur la ligne, jamais dessous.
    const horizonY = y(angleAt(now.azimuth));
    const sunY = y(now.elevation);
    const sunPt = { x: x(now.azimuth), y: glyph.kind === 'setting' ? Math.min(sunY, horizonY - 3) : sunY };
    const onScreen = sunPt.x > -30 && sunPt.x < W + 30;
    return { line: line.join(' '), lastPt, glyph, sunPt, onScreen, lastRayMin, caption, look: haloLook(now.elevation) };
  }, [venue, date]);

  const { glyph, sunPt, lastPt, look } = sky;
  const at = glyph.kind === 'ember' && lastPt ? lastPt : sunPt;
  const r = 13;
  const glowR = 22 + 22 * look.glow;
  const warm = glyph.kind === 'disc' ? look.color : LIGHT.fire;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={sky.lastRayMin !== null ? `Dernier rayon à ${hhmm(sky.lastRayMin)}` : 'Le ciel du lieu'}>
      <defs>
        <radialGradient id={glowId}>
          <stop offset="0.3" stopColor={warm} stopOpacity="0.75" />
          <stop offset="1" stopColor={warm} stopOpacity="0" />
        </radialGradient>
      </defs>
      {BANDS.map((b) => (
        <rect key={b.y} x="0" y={b.y} width={W} height={b.h} fill={b.fill} />
      ))}
      <polygon points={`0,${H} ${sky.line} ${W},${H}`} fill={DAY.bg} />
      <polyline points={sky.line} fill="none" stroke={NIGHT.night} strokeWidth="1.8" strokeLinejoin="round" />

      {lastPt && glyph.kind !== 'none' && glyph.kind !== 'ember' && sky.onScreen && (
        <line x1={sunPt.x} y1={sunPt.y} x2={lastPt.x} y2={lastPt.y} stroke={NIGHT.night} strokeWidth="1.5" strokeDasharray="3 4" strokeLinecap="round" />
      )}

      {glyph.kind !== 'none' && sky.onScreen && (
        glyph.kind === 'disc' ? (
          <>
            <circle cx={at.x} cy={at.y} r={glowR} fill={`url(#${glowId})`} />
            <circle cx={at.x} cy={at.y} r={r} fill={LIGHT.fire} />
          </>
        ) : (
          // Braise : le halo rougit et s'aplatit sur l'horizon.
          <>
            <ellipse cx={at.x} cy={at.y} rx={glowR * 1.3} ry={glowR * glyph.flatten} fill={`url(#${glowId})`} />
            <ellipse cx={at.x} cy={at.y} rx={r * 1.25} ry={r * glyph.flatten} fill={LIGHT.fire} />
          </>
        )
      )}

      {lastPt && sky.lastRayMin !== null && (
        <>
          <circle cx={lastPt.x} cy={lastPt.y} r="5" fill={DAY.bg} stroke={LIGHT.fire} strokeWidth="2" />
          <text x={Math.min(W - 8, lastPt.x + 10)} y={lastPt.y - 11} textAnchor={lastPt.x + 10 > W - 110 ? 'end' : 'start'} fontSize="12.5" fontWeight="700" fill={NIGHT.night} className="font-mono">
            {hhmm(sky.lastRayMin)}
          </text>
          <text x={Math.min(W - 8, lastPt.x + 10)} y={lastPt.y - 11} dx={lastPt.x + 10 > W - 110 ? 0 : 44} textAnchor={lastPt.x + 10 > W - 110 ? 'end' : 'start'} dy={lastPt.x + 10 > W - 110 ? -15 : 0} fontSize="11.5" fontWeight="600" fill={NIGHT.night}>
            {sky.caption}
          </text>
        </>
      )}
    </svg>
  );
}
