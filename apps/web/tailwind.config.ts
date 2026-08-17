import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef6fb',
          100: '#d9ecf6',
          200: '#b8dbea',
          300: '#87c3db',
          400: '#4a9eca',
          500: '#2e6da4',
          600: '#275e8d',
          700: '#214d74',
          800: '#1a3a5c',
          900: '#1a2e3e',
          950: '#101f2b',
        },
        accent: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#c5a55a',
          600: '#ad8d45',
          700: '#8b7038',
          800: '#6d592f',
          900: '#584928',
          950: '#332816',
        },
        surface: {
          DEFAULT: '#ffffff',
          50: '#f8f6f3',
          100: '#ffffff',
          200: '#f0ece6',
          300: '#e8e3db',
          400: '#e0dbd3',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-in-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 15px rgba(46, 109, 164, 0.2)' },
          '50%': { boxShadow: '0 0 30px rgba(46, 109, 164, 0.35)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
