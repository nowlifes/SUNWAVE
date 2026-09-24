// ---------------------------------------------------------------------------
// Palette « raccord », pour le SVG et les styles en ligne (les classes
// Tailwind portent les mêmes valeurs : tailwind.config.js). Un bleu nuit en
// paliers, le jour = ce bleu éclairci, et la lumière du soleil. Rien d'autre :
// « toi » est coquille, l'ombre est bleue.
// ---------------------------------------------------------------------------

export const NIGHT = {
  water: '#071233',
  deep: '#08143A',
  night: '#0B1A45',
  p1: '#122457',
  p2: '#1A2F69',
  p3: '#233B7C',
  edge: '#3A5099',
  dim: '#8FA3D6',
  sub: '#AFC0E8',
  shell: '#FFF6EC',
} as const;

export const DAY = {
  sky1: '#22398A',
  sky2: '#3A55A6',
  sky3: '#6F86C6',
  sky4: '#AEBDE3',
  bg: '#F3F6FC',
  bg2: '#E6ECF8',
  line: '#C5D1EC',
  sub: '#34487A',
} as const;

export const LIGHT = {
  fire: '#FF6A2B',
  glow: '#FFAA57',
  pale: '#FFD28A',
  /** Texte orange sur fond clair. */
  inkDay: '#A83400',
  /** Texte orange sur fond de nuit. */
  inkNight: '#FF8A4C',
} as const;
