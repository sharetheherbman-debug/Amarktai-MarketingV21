import type { Config } from 'tailwindcss';

/**
 * Canonical EquiProfile Marketing palette.
 *
 * The primary navy/blue pair is grounded in the real EquiProfile logo artwork
 * rather than the rejected cream/teal/gold rescue theme. Customer pages should
 * prefer the CSS semantic tokens in globals.css; these named colours remain for
 * existing Tailwind utilities while legacy pages are replaced.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7fd',
          100: '#d9eefb',
          200: '#b8def5',
          300: '#86c8ed',
          400: '#4aa9df',
          500: '#167cc1',
          600: '#1069a7',
          700: '#0c5689',
          800: '#08436d',
          900: '#052b57',
          950: '#031a35',
        },
        accent: {
          50: '#f0f8ff',
          100: '#ddecff',
          200: '#c2dcff',
          300: '#97c4ff',
          400: '#65a6ff',
          500: '#3786e8',
          600: '#226aca',
          700: '#1d55a4',
          800: '#1d4783',
          900: '#1c3d6d',
          950: '#122746',
        },
        surface: {
          DEFAULT: '#ffffff',
          50: '#f5f8fc',
          100: '#ffffff',
          200: '#eef3f8',
          300: '#e4ebf2',
          400: '#d7e0ea',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
