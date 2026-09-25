/** @type {import('tailwindcss').Config} */
// Palette « raccord » : un seul bleu nuit en paliers, de l'eau à la coquille ;
// le jour est le même bleu éclairci ; la seule autre couleur est la lumière
// du soleil (braise → or → pâle). Aucun accent secondaire. Les mêmes valeurs,
// pour le SVG et les styles en ligne, sont dans src/utils/palette.ts.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Nuit : de l'eau à la coquille.
        dusk: {
          water: '#071233',
          deep: '#08143A',
          night: '#0B1A45',
          panel: '#122457',
          cobalt: '#1A2F69',
          line: '#233B7C',
          edge: '#3A5099',
          dim: '#8FA3D6',
          sub: '#AFC0E8',
          mist: '#D6DEF5',
          shell: '#FFF6EC',
          // Strates du ciel (Plein ouest), même bleu.
          sky: '#0F2263',
          // Lumière : réservée au soleil, aux heures de soleil et à un seul
          // bouton principal par écran de nuit.
          fire: '#FF6A2B',
          glow: '#FFAA57',
          pale: '#FFD28A',
          ember: '#FF8A4C',
        },
        // Jour : le même bleu, éclairci.
        day: {
          sky1: '#22398A',
          sky2: '#3A55A6',
          sky3: '#6F86C6',
          sky4: '#AEBDE3',
          DEFAULT: '#F3F6FC',
          2: '#E6ECF8',
          line: '#C5D1EC',
          sub: '#34487A',
          // Braise en encre : texte orange sur fond clair (gros texte).
          ember: '#A83400',
        },
        // Encre du jour = la nuit.
        ink: '#0B1A45',
        // Direction « Contre-jour » : la carte crème, éclairée par le soleil.
        cream: '#FFF1D6',
      },
      fontFamily: {
        sans: ['"Schibsted Grotesk"', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['"Funnel Display"', '"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        '2.5xl': '1.25rem',
        '3xl': '1.75rem',
      },
    },
  },
  plugins: [],
};
