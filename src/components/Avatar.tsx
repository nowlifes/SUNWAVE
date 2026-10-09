import type { VenueCategory } from '@/types';
import type { LiveVoice } from '@/services/LiveReportService';
import { IN_IT_THRESHOLD } from '@/services/RecommendationService';
import { voiceLight, type AvatarLight, type LensScene } from '@/utils/avatar';
import { tr } from '@/utils/lang';

// ---------------------------------------------------------------------------
// L'avatar : une silhouette illustrée à contre-jour, la même pour tout le
// monde. Le fond dit la lumière du lieu (orange au soleil, bleu à l'ombre) ;
// « cut » : le lieu est passé à l'ombre depuis la réponse, l'avatar est coupé
// en diagonale comme les cartes de la DA.
// ---------------------------------------------------------------------------

const SUN_SRC = '/avatar/silhouette-sun.png';
const SHADE_SRC = '/avatar/silhouette-shade.png';

/** La coupe des cartes, à 35° : le soleil en haut à gauche, l'ombre en bas à droite. */
const HI_CLIP = 'polygon(0 0, 100% 0, 100% 15%, 0 85%)';
const LO_CLIP = 'polygon(0 85%, 100% 15%, 100% 100%, 0 100%)';

export interface AvatarProps {
  /** Conservé pour compat avec le code stocké/envoyé au serveur ; plus utilisé pour dessiner. */
  code?: string | null;
  light: AvatarLight;
  /** Ancien : ce que montraient les verres. Ignoré, gardé pour compat d'appel. */
  scene?: LensScene;
  size: number;
  label?: string;
  className?: string;
}

export function Avatar({ light, size, label, className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={label ?? 'Avatar'}
      className={`relative inline-block shrink-0 overflow-hidden rounded-full border-[1.8px] border-ink ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {light === 'cut' ? (
        <>
          <img src={SUN_SRC} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: HI_CLIP }} />
          <img src={SHADE_SRC} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ clipPath: LO_CLIP }} />
        </>
      ) : (
        <img src={light === 'shade' ? SHADE_SRC : SUN_SRC} alt="" className="h-full w-full object-cover" />
      )}
    </span>
  );
}

/** La pile « confirmé par » : chaque voix dans la lumière du lieu à cette
 *  minute, coupée en deux si le lieu est passé à l'ombre depuis sa réponse. */
export function VoicePile({
  voices,
  sunByHour,
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
          size={size}
          label={v.pseudo ?? tr('Quelqu’un sur place', 'Someone on the spot')}
          className={k ? '-ml-2.5' : ''}
        />
      ))}
    </span>
  );
}
