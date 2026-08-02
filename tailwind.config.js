/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        raised: 'var(--surface-raised)',
        line: 'var(--border)',
        ink: 'var(--text)',
        'ink-2': 'var(--text-2)',
        violet: 'var(--violet)',
        cyan: 'var(--cyan)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
      },
      borderRadius: { DEFAULT: 'var(--radius)', sm: 'var(--radius-sm)', pill: 'var(--radius-pill)' },
      fontFamily: { sans: 'var(--font)' },
    },
  },
  plugins: [],
}
