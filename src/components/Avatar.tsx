import { useId } from 'react';
import type { VenueCategory } from '@/types';
import type { LiveVoice } from '@/services/LiveReportService';
import { IN_IT_THRESHOLD } from '@/services/RecommendationService';
import { HAIR_PATHS, HAT_FIT, HAT_PATHS, SHAPE_T } from './avatarShapes';
import { lensDetailed, lensScene, parseAvatar, voiceLight, type AvatarLight, type LensScene } from '@/utils/avatar';

// ---------------------------------------------------------------------------
// La silhouette à contre-jour. Tout est noir d'encre sauf deux choses : le fond,
// qui dit la lumière du lieu (disque orange au soleil, bleu piscine au frais),
// et les verres, qui montrent le lieu lui-même (la vue, la mer, les toits).
// En petit, les verres ne gardent qu'un éclat : le lieu n'y serait pas lisible.
// « cut » : le lieu est passé à l'ombre depuis la réponse, l'avatar est coupé
// en diagonale comme les cartes de la DA.
// Dessin sur 100 × 100 ; la tête est centrée en (50, 42).
// ---------------------------------------------------------------------------

const INK = '#0B1433';
const CREAM = '#FFF1D6';
const GOLD = '#FFD28A';

/** Les verres sont la signature : on les grossit d'un quart autour des yeux. */
const LENS_T = 'translate(50 43) scale(1.25) translate(-50 -43)';

/** La silhouette de la planche (tête, épaules, coiffure), dans l'ordre de HAIRS. */
function Hair({ i }: { i: number }) {
  return <path d={HAIR_PATHS[i] ?? HAIR_PATHS[3]} transform={SHAPE_T} />;
}

/** Dans l'ordre de HATS ; posé sur le volume de la coiffure (HAT_FIT). */
function Hat({ i, hair }: { i: number; hair: number }) {
  const d = HAT_PATHS[i - 1];
  if (!d) return null;
  const [dy, f] = HAT_FIT[hair] ?? [0, 1];
  return (
    <g transform={`translate(0 ${dy}) translate(50 30) scale(${f}) translate(-50 -30)`}>
      <path d={d} transform={SHAPE_T} />
    </g>
  );
}

/** Les verres, dans l'ordre de GLASSES : un seul chemin, qui sert de découpe. */
const LENSES = [
  'M47 43 A6 6 0 1 1 35 43 A6 6 0 1 1 47 43 Z M65 43 A6 6 0 1 1 53 43 A6 6 0 1 1 65 43 Z',
  'M31 37 L48 40 C48 46 45 49 41 49 C36 49 33 44 31 37 Z M69 37 L52 40 C52 46 55 49 59 49 C64 49 67 44 69 37 Z',
  'M31 39 C40 37 60 37 69 39 L68 45 C60 48 54 47 50 45 C46 47 40 48 32 45 Z',
  'M35 39 L48 39 C48 46 45 50 41 50 C37 50 35 46 35 39 Z M52 39 L65 39 C65 46 63 50 59 50 C55 50 52 46 52 39 Z',
  'M35 38 L47 38 Q48 38 48 39 L48 47 Q48 48 47 48 L35 48 Q34 48 34 47 L34 39 Q34 38 35 38 Z M53 38 L65 38 Q66 38 66 39 L66 47 Q66 48 65 48 L53 48 Q52 48 52 47 L52 39 Q52 38 53 38 Z',
  'M38 37.5 L44 37.5 L47.5 43 L44 48.5 L38 48.5 L34.5 43 Z M56 37.5 L62 37.5 L65.5 43 L62 48.5 L56 48.5 L52.5 43 Z',
];

function Sparkle({ x, y, r, fill = '#fff' }: { x: number; y: number; r: number; fill?: string }) {
  const k = r * 0.22;
  return <path d={`M${x} ${y - r} L${x + k} ${y - k} L${x + r} ${y} L${x + k} ${y + k} L${x} ${y + r} L${x - k} ${y + k} L${x - r} ${y} L${x - k} ${y - k} Z`} fill={fill} />;
}

/** Ce qu'on voit dans les verres (une seule image, traversant les deux verres). */
function LensView({ light, scene, detailed, uid }: { light: 'sun' | 'shade'; scene: LensScene; detailed: boolean; uid: string }) {
  if (light === 'shade') {
    return (
      <>
        <rect x="24" y="32" width="52" height="22" fill={`url(#${uid}-pool)`} />
        {detailed && (
          <path d="M28 40 Q34 37 40 41 T52 40 T64 41 T72 39 M28 46 Q35 43 42 47 T56 45 T72 47" stroke="#fff" strokeOpacity=".7" strokeWidth=".9" fill="none" />
        )}
        <Sparkle x={detailed ? 58 : 57} y={40} r={detailed ? 2.6 : 3.4} />
      </>
    );
  }
  if (!detailed) {
    return (
      <>
        <rect x="24" y="32" width="52" height="22" fill={`url(#${uid}-sky)`} />
        <Sparkle x={57} y={40} r={3.4} fill={CREAM} />
      </>
    );
  }
  return (
    <>
      <rect x="24" y="32" width="52" height="22" fill={`url(#${uid}-sky)`} />
      <circle cx="50" cy="44.5" r="3.2" fill={CREAM} />
      {scene === 'city' ? (
        <path d="M24 54 L24 46 L28 45 L28 46 L31 44 L34 46 L34 45 L38 42.5 L42 45 L42 47 L46 47 L46 45 L49 43 L52 45 L55 43.5 L58 46 L61 44 L65 46 L65 45 L69 43 L72 45 L76 46 L76 54 Z" fill="#A83400" />
      ) : (
        <>
          <rect x="24" y="46" width="52" height="8" fill="#16224F" />
          <path d="M44 47.2 L56 47.2 M46 49 L54 49 M47.5 50.7 L52.5 50.7" stroke={GOLD} strokeWidth=".7" />
          {scene === 'view' && (
            <g stroke="#A83400" fill="none">
              <path d="M24 45.2 L76 45.2" strokeWidth=".9" />
              <path d="M37 46 L37 36.5 M63 46 L63 36.5" strokeWidth="1.3" />
              <path d="M24 43 Q30.5 45 37 38.5 Q50 45.5 63 38.5 Q69.5 45 76 43" strokeWidth=".5" />
            </g>
          )}
          {scene === 'sea' && <path d="M29 48.5 q2 -1.2 4 0 t4 0 M60 48.5 q2 -1.2 4 0 t4 0" stroke="#fff" strokeWidth=".6" fill="none" />}
        </>
      )}
    </>
  );
}

/** Le fond et la silhouette pour une lumière donnée (utilisé deux fois pour « cut »). */
function Scene({ light, spec, scene, detailed, uid }: { light: 'sun' | 'shade'; spec: { hair: number; hat: number; glasses: number }; scene: LensScene; detailed: boolean; uid: string }) {
  const rim = light === 'sun' ? GOLD : '#CFEFFF';
  return (
    <>
      {light === 'sun' ? (
        <rect width="100" height="100" fill={`url(#${uid}-disc)`} />
      ) : (
        <>
          <rect width="100" height="100" fill={`url(#${uid}-water)`} />
          <path
            d="M4 22 Q14 16 24 23 T44 22 T64 24 T96 20 M2 40 Q12 34 22 41 T42 39 T62 42 T98 38 M4 60 Q16 54 26 61 T48 58 T70 62 T98 57 M2 80 Q14 74 24 81 T46 78 T70 82 T98 77"
            stroke="#fff"
            strokeOpacity=".28"
            strokeWidth="2.2"
            fill="none"
          />
          <g fill="#0F3F9E" fillOpacity=".35">
            <path d="M-4 8 C14 10 26 22 30 36 C20 26 8 22 -4 22 Z" />
            <path d="M104 50 C88 50 76 60 72 74 C82 66 94 64 104 66 Z" />
          </g>
          {detailed && (
            <>
              <Sparkle x={80} y={24} r={5} />
              <Sparkle x={18} y={62} r={3.5} />
            </>
          )}
        </>
      )}
      {/* La silhouette deux fois : d'abord épaissie à la couleur du contre-jour, puis pleine : il reste un liseré de lumière. */}
      <g fill={rim} stroke={rim} strokeWidth="3.4" strokeLinejoin="round">
        <use href={`#${uid}-sil`} />
      </g>
      <use href={`#${uid}-sil`} fill={INK} />
      {/* Le couvre-chef par-dessus, avec son propre liseré : sinon il se fond dans les cheveux. */}
      <g fill={rim} stroke={rim} strokeWidth="2.6" strokeLinejoin="round">
        <use href={`#${uid}-hat`} />
      </g>
      <use href={`#${uid}-hat`} fill={INK} />
      <g clipPath={`url(#${uid}-lens)`}>
        <LensView light={light} scene={scene} detailed={detailed} uid={uid} />
      </g>
      <g transform={LENS_T} stroke={light === 'sun' ? GOLD : '#CFEFFF'} fill="none">
        <path d={LENSES[spec.glasses] ?? LENSES[0]} strokeWidth=".9" />
        {spec.glasses !== 2 && <path d="M47.5 42 Q50 40.5 52.5 42" strokeWidth=".8" />}
      </g>
    </>
  );
}

export interface AvatarProps {
  /** Le code « b62 » ; nul ou faux : une silhouette neutre. */
  code: string | null | undefined;
  light: AvatarLight;
  /** Ce que montrent les verres en grand (utils/avatar → lensScene). */
  scene?: LensScene;
  size: number;
  label?: string;
  className?: string;
}

export function Avatar({ code, light, scene = 'view', size, label, className }: AvatarProps) {
  const uid = `av${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const spec = parseAvatar(code) ?? { hair: 3, hat: 0, glasses: 0 };
  const detailed = lensDetailed(size);

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={label ?? 'Avatar'}
      className={className}
      style={detailed ? { filter: `drop-shadow(3px 3px 0 ${INK})` } : undefined}
    >
      <defs>
        <radialGradient id={`${uid}-disc`} cx="50%" cy="40%" r="60%">
          <stop offset="0" stopColor="#FFD28A" />
          <stop offset=".45" stopColor="#FF8A2B" />
          <stop offset="1" stopColor="#FF5A1F" />
        </radialGradient>
        <linearGradient id={`${uid}-water`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#35B6FF" />
          <stop offset=".5" stopColor="#1E8BFF" />
          <stop offset="1" stopColor="#1558D6" />
        </linearGradient>
        <linearGradient id={`${uid}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF6A2B" />
          <stop offset=".75" stopColor="#FFD28A" />
        </linearGradient>
        <linearGradient id={`${uid}-pool`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7FD0FF" />
          <stop offset="1" stopColor="#1E8BFF" />
        </linearGradient>
        <g id={`${uid}-sil`}>
          <Hair i={spec.hair} />
        </g>
        <g id={`${uid}-hat`}>
          <Hat i={spec.hat} hair={spec.hair} />
        </g>
        <clipPath id={`${uid}-lens`}>
          <path d={LENSES[spec.glasses] ?? LENSES[0]} transform={LENS_T} />
        </clipPath>
        <clipPath id={`${uid}-round`}>
          <circle cx="50" cy="50" r="44" />
        </clipPath>
        {/* La coupe des cartes, à 35° : le soleil en haut à gauche, l'ombre en bas à droite. */}
        <clipPath id={`${uid}-hi`}>
          <polygon points="0,0 100,0 100,15 0,85" />
        </clipPath>
        <clipPath id={`${uid}-lo`}>
          <polygon points="0,85 100,15 100,100 0,100" />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="48" fill={CREAM} stroke={INK} strokeWidth="1.8" />
      <g clipPath={`url(#${uid}-round)`}>
        {light === 'cut' ? (
          <>
            <g clipPath={`url(#${uid}-hi)`}>
              <Scene light="sun" spec={spec} scene={scene} detailed={detailed} uid={uid} />
            </g>
            <g clipPath={`url(#${uid}-lo)`}>
              <Scene light="shade" spec={spec} scene={scene} detailed={detailed} uid={uid} />
            </g>
            <line x1="0" y1="85" x2="100" y2="15" stroke={CREAM} strokeWidth="1.6" />
          </>
        ) : (
          <Scene light={light} spec={spec} scene={scene} detailed={detailed} uid={uid} />
        )}
      </g>
      <circle cx="50" cy="50" r="44" fill="none" stroke={INK} strokeWidth="1.2" />
    </svg>
  );
}

/** La pile « confirmé par » : chaque voix dans la lumière du lieu à cette
 *  minute, coupée en deux si le lieu est passé à l'ombre depuis sa réponse. */
export function VoicePile({
  voices,
  sunByHour,
  category,
  size = 30,
  now = Date.now(),
}: {
  voices: LiveVoice[];
  sunByHour: number[];
  category: VenueCategory;
  size?: number;
  now?: number;
}) {
  return (
    <span className="flex shrink-0">
      {voices.map((v, k) => (
        <Avatar
          key={`${v.at}-${k}`}
          code={v.avatar}
          light={voiceLight(sunByHour, v.at, now, IN_IT_THRESHOLD.SUN)}
          scene={lensScene(category)}
          size={size}
          label={v.pseudo ?? 'Quelqu’un sur place'}
          className={k ? '-ml-2.5' : ''}
        />
      ))}
    </span>
  );
}
