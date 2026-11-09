/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        nkb: {
          navy: {
            950: '#070C18',
            900: '#0F172A',
            800: '#1E293B',
            700: '#334155',
            600: '#475569',
          },
          gold: {
            600: '#B45309',
            500: '#D97706',
            400: '#F59E0B',
            300: '#FCD34D',
            100: '#FEF3C7',
            50: '#FFFBEB',
          }
        }
      }
    },
  },
  plugins: [],
}
