import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // All colours reference CSS variables set by ConfigProvider.
      // Using arbitrary-value syntax ensures Tailwind emits `color: var(--x)`
      // directly, without wrapping in rgb() which would break hex variables.
      colors: {
        primary:          'var(--color-primary)',
        'primary-hover':  'var(--color-primary-hover)',
        'primary-light':  'var(--color-primary-light)',
        accent:           'var(--color-accent)',
        surface:          'var(--color-surface)',
        background:       'var(--color-background)',
        muted:            'var(--color-text-muted)',
        success:          'var(--color-success)',
        'success-light':  'var(--color-success-light)',
        error:            'var(--color-error)',
        'error-light':    'var(--color-error-light)',
        warning:          'var(--color-warning)',
        'warning-light':  'var(--color-warning-light)',
        // Alias for any old brand-* usage
        brand: {
          500: 'var(--color-primary)',
          600: 'var(--color-primary)',
          700: 'var(--color-primary-hover)',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
      borderRadius: {
        sm:  'var(--radius-sm)',
        md:  'var(--radius-md)',
        DEFAULT: 'var(--radius-md)',
        lg:  'var(--radius-lg)',
        xl:  'var(--radius-xl)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        md:   'var(--shadow-md)',
        lg:   'var(--shadow-lg)',
      },
    },
  },
  plugins: [],
}

export default config
