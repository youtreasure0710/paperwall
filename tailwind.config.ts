import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-app)',
        foreground: 'var(--text-primary)',
        card: 'var(--bg-surface)',
        muted: 'var(--bg-surface-secondary)',
        accent: 'var(--accent-default)',
        border: 'var(--border-default)',
        'pw-bg-app': 'var(--bg-app)',
        'pw-bg-sidebar': 'var(--bg-sidebar)',
        'pw-bg-surface': 'var(--bg-surface)',
        'pw-bg-surface-secondary': 'var(--bg-surface-secondary)',
        'pw-bg-hover': 'var(--bg-hover)',
        'pw-border': 'var(--border-default)',
        'pw-border-strong': 'var(--border-strong)',
        'pw-text-primary': 'var(--text-primary)',
        'pw-text-secondary': 'var(--text-secondary)',
        'pw-text-tertiary': 'var(--text-tertiary)',
        'pw-accent': 'var(--accent-default)',
        'pw-accent-soft': 'var(--accent-soft)',
        'pw-accent-hover': 'var(--accent-hover)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-md)',
        overlay: 'var(--shadow-overlay)',
      },
      spacing: {
        2: 'var(--space-2)',
        3: 'var(--space-3)',
        4: 'var(--space-4)',
        6: 'var(--space-6)',
        8: 'var(--space-8)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        base: 'var(--motion-base)',
        slow: 'var(--motion-slow)',
      },
    },
  },
  plugins: [],
} satisfies Config;
