import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#f4f6fb',
        foreground: '#111827',
        card: '#ffffff',
        muted: '#e5e7eb',
        accent: '#1d4ed8',
        border: '#d1d5db',
      },
      boxShadow: {
        card: '0 12px 24px -16px rgba(15, 23, 42, 0.4)',
      },
    },
  },
  plugins: [],
} satisfies Config;
