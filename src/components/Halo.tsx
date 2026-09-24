import { useId } from 'react';
import { LIGHT } from '@/utils/palette';
import { haloParts, type HaloSpec } from '@/utils/haloMarkup';

// ---------------------------------------------------------------------------
// Le système d'icônes halo, en React. Trois états, une seule grammaire :
// « Ça brille : soleil. Éteint : ombre. Rond vide : toi ; s'il bat, c'est là
// où tu vas. » Même dessin que haloSvg (utils/haloMarkup.ts) pour la carte.
// ---------------------------------------------------------------------------

export function HaloIcon({ size = 24, className = '', ...spec }: HaloSpec & { size?: number; className?: string }) {
  const id = useId();
  const { glow, core } = haloParts(spec);
  const svg = (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="block overflow-visible">
      {glow && (
        <>
          <defs>
            <radialGradient id={id}>
              <stop offset="0.35" stopColor={glow.color} stopOpacity={glow.opacity} />
              <stop offset="1" stopColor={glow.color} stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="12" cy="12" r={glow.r} fill={`url(#${id})`} />
        </>
      )}
      <circle cx="12" cy="12" r={core.r} fill={core.fill} stroke={core.stroke ?? undefined} strokeWidth={core.stroke ? core.width : undefined} />
    </svg>
  );
  if (spec.kind !== 'dest') return <span className={`inline-block shrink-0 ${className}`}>{svg}</span>;
  const d = Math.round((size * 19) / 24);
  return (
    <span className={`relative inline-block shrink-0 ${className}`}>
      {svg}
      <span
        aria-hidden="true"
        className="halo-pulse absolute left-1/2 top-1/2 rounded-full"
        style={{ width: d, height: d, marginLeft: -d / 2, marginTop: -d / 2, border: `1.5px solid ${LIGHT.fire}` }}
      />
    </span>
  );
}
