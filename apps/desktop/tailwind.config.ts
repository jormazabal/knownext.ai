import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "rgb(var(--accent) / <alpha-value>)",
          dark: "rgb(var(--accent-hover) / <alpha-value>)",
          hover: "rgb(var(--accent-soft) / <alpha-value>)",
        },
        ink: {
          primary: "rgb(var(--app-text) / <alpha-value>)",
          secondary: "rgb(var(--app-muted) / <alpha-value>)",
        },
        line: "rgb(var(--app-border) / <alpha-value>)",
        panel: "rgb(var(--app-panel) / <alpha-value>)",
      },
      boxShadow: {
        menu: "var(--shadow-menu)",
        subtle: "var(--shadow-subtle)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
