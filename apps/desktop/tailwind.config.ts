import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: "#F37021",
          dark: "#D85A12",
          hover: "#FFF1E8",
        },
        ink: {
          primary: "#111827",
          secondary: "#6B7280",
        },
        line: "#E5E7EB",
        panel: "#FAFAFA",
      },
      boxShadow: {
        menu: "0 14px 40px rgba(17, 24, 39, 0.12)",
        subtle: "0 8px 24px rgba(17, 24, 39, 0.06)",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;

