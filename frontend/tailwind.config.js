/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f6f7f9',
          soft: '#eef1f5',
        },
        line: '#e4e8ee',
        ink: {
          DEFAULT: '#14181f',
          soft: '#3d4654',
          mute: '#7a8494',
          faint: '#a8b0bd',
        },
        brand: {
          DEFAULT: 'rgb(var(--brand-rgb) / <alpha-value>)',
          dark: 'var(--brand-dark)',
          soft: 'var(--brand-soft)',
          mist: 'var(--brand-mist)',
        },
      },
      fontFamily: {
        display: ['"Outfit"', '"IBM Plex Sans Arabic"', 'Tahoma', 'sans-serif'],
        body: ['"IBM Plex Sans Arabic"', 'Tahoma', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(20,24,31,0.04), 0 8px 24px rgba(20,24,31,0.04)',
      },
    },
  },
  plugins: [],
};
