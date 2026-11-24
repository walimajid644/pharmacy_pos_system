/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class', '[data-theme="dark"]'],
  content: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        banner: {
          success: {
            bg: 'var(--banner-success-bg)',
            border: 'var(--banner-success-border)',
          },
          warning: {
            bg: 'var(--banner-warning-bg)',
            border: 'var(--banner-warning-border)',
          },
          danger: {
            bg: 'var(--banner-danger-bg)',
            border: 'var(--banner-danger-border)',
          },
          info: {
            bg: 'var(--banner-info-bg)',
            border: 'var(--banner-info-border)',
          },
        },

        border: {
          DEFAULT: 'var(--border)',
          strong: 'var(--border-strong)',
        },
        brand: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [
            step,
            `var(--brand-${step})`,
          ]),
        ),
        input: 'var(--border)',
        ring: 'var(--border-focus)',
        background: 'var(--surface-page)',
        foreground: 'var(--text-primary)',
        primary: {
          DEFAULT: 'var(--color-primary-600)',
          foreground: 'var(--text-inverse)',
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          400: 'var(--color-primary-400)',
          600: 'var(--color-primary-600)',
          800: 'var(--color-primary-800)',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary-600)',
          foreground: 'var(--text-inverse)',
          50: 'var(--color-secondary-50)',
          400: 'var(--color-secondary-400)',
          600: 'var(--color-secondary-600)',
          800: 'var(--color-secondary-800)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'var(--surface-card)',
          foreground: 'var(--text-primary)',
        },
        success: {
          500: 'var(--color-success)',
          50: 'var(--color-success-50)',
          600: 'var(--color-success-600)',
          DEFAULT: 'var(--color-success)',
          bg: 'var(--color-success-bg)',
          text: 'var(--color-success-text)',
        },
        warning: {
          500: 'var(--color-warning)',
          50: 'var(--color-warning-50)',
          600: 'var(--color-warning-600)',
          DEFAULT: 'var(--color-warning)',
          bg: 'var(--color-warning-bg)',
          text: 'var(--color-warning-text)',
        },
        danger: {
          500: 'var(--color-danger)',
          50: 'var(--color-danger-50)',
          600: 'var(--color-danger-600)',
          DEFAULT: 'var(--color-danger)',
          bg: 'var(--color-danger-bg)',
          text: 'var(--color-danger-text)',
        },
        info: {
          500: 'var(--color-info)',
          50: 'var(--color-info-50)',
          600: 'var(--color-info-600)',
          DEFAULT: 'var(--color-info)',
          bg: 'var(--color-info-bg)',
          text: 'var(--color-info-text)',
        },
        surface: {
          page: 'var(--surface-page)',
          card: 'var(--surface-card)',
        },
      },
      borderRadius: {
        lg: 'var(--radius-lg)',
        md: 'var(--radius-md)',
        sm: 'var(--radius-sm)',
      },
      textColor: {
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        muted: 'var(--text-muted)',
      },
    },
  },
  plugins: [],
};
