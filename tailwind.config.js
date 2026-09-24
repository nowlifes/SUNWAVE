/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        sun: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        // Identité « Ciel vivant » : papier chaud, encre bleu nuit, braise.
        paper: '#F7F3EC',
        ink: '#0E2A47',
        mute: '#5B6B7F',
        line: '#E4E0D8',
        ember: '#B45309',
        // « Plein ouest » : l'heure du coucher, nuit océan et orange de braise.
        dusk: {
          deep: '#08143A',
          night: '#0B1A45',
          sky: '#0F2263',
          cobalt: '#1A3383',
          panel: '#16296A',
          line: '#24397A',
          edge: '#3A5099',
          dim: '#8FA3D6',
          sub: '#AFC0E8',
          mist: '#D6DEF5',
          shell: '#FFF6EC',
          fire: '#FF6A2B',
          glow: '#FFAA57',
        },
        shade: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
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
