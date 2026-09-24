import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Le « trait tremblé » : le soulignement du nom d'un lieu, à la main. Tiré du
// texte lui-même (même nom = même trait), pas au hasard à chaque rendu.
// ---------------------------------------------------------------------------

function seeded(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function squigglePath(text: string, width: number): string {
  const rnd = seeded(text);
  const steps = Math.max(4, Math.round(width / 18));
  let d = `M2.0 ${(4 + rnd() * 2).toFixed(1)}`;
  for (let i = 1; i <= steps; i++) {
    const x = 2 + ((width - 4) * i) / steps;
    const px = 2 + ((width - 4) * (i - 0.5)) / steps;
    const y = (3.5 + rnd() * 3).toFixed(1);
    d += ` Q${px.toFixed(1)} ${y} ${x.toFixed(1)} ${y}`;
  }
  return d;
}

export function Squiggle({ text, color, width }: { text: string; color: string; width: number }) {
  const d = useMemo(() => squigglePath(text, width), [text, width]);
  return (
    <svg width={width} height="10" viewBox={`0 0 ${width} 10`} className="block max-w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
