import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import tailwindcssAspectRatio from "@tailwindcss/aspect-ratio";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        display: ["Plus Jakarta Sans", "Inter", "sans-serif"],
        sans: ["Inter", "Plus Jakarta Sans", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "SFMono-Regular", "Menlo", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        hatch: {
          blue: "#1F5FFF",
          blueSecondary: "#0078FF",
          gradient: "var(--gradient-brand)",
          background: "#F8FAFF",
          card: "#FFFFFF",
          text: "#1C1C1E",
          muted: "#6B7280",
          success: "#00C853",
          warning: "#FFB300",
          danger: "#FF3B30",
          neutral: "#E5E7EB",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        brand: {
          blue: {
            300: "var(--brand-blue-300)",
            400: "var(--brand-blue-400)",
            500: "var(--brand-blue-500)",
            600: "var(--brand-blue-600)",
            700: "var(--brand-blue-700)",
          },
          green: {
            300: "var(--brand-green-300)",
            400: "var(--brand-green-400)",
            500: "var(--brand-green-500)",
            600: "var(--brand-green-600)",
            700: "var(--brand-green-700)",
          },
        },
        ink: {
          50: "var(--ink-50)",
          75: "var(--ink-75)",
          100: "var(--ink-100)",
          200: "var(--ink-200)",
          300: "var(--ink-300)",
          400: "var(--ink-400)",
          500: "var(--ink-500)",
          600: "var(--ink-600)",
          700: "var(--ink-700)",
          800: "var(--ink-800)",
          900: "var(--ink-900)",
        },
        status: {
          success: {
            foreground: "var(--status-success-foreground)",
            surface: "var(--status-success-surface)",
          },
          info: {
            foreground: "var(--status-info-foreground)",
            surface: "var(--status-info-surface)",
          },
          warning: {
            foreground: "var(--status-warning-foreground)",
            surface: "var(--status-warning-surface)",
          },
          error: {
            foreground: "var(--status-error-foreground)",
            surface: "var(--status-error-surface)",
          },
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
        pill: "var(--radius-full)",
      },
      backgroundImage: {
        "brand-gradient": "var(--gradient-brand)",
        "brand-gradient-soft": "var(--gradient-brand-soft)",
      },
      spacing: {
        "2xs": "var(--space-2xs)",
        xs: "var(--space-xs)",
        sm: "var(--space-sm)",
        md: "var(--space-md)",
        lg: "var(--space-lg)",
        xl: "var(--space-xl)",
        "2xl": "var(--space-2xl)",
        "3xl": "var(--space-3xl)",
        "4xl": "var(--space-4xl)",
        "5xl": "var(--space-5xl)",
        "6xl": "var(--space-6xl)",
      },
      boxShadow: {
        brand: "var(--shadow-sm)",
        "brand-md": "var(--shadow-md)",
        "brand-lg": "var(--shadow-lg)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssAspectRatio],
} satisfies Config;
