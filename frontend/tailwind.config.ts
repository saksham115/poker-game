import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0a0e0a",
        foreground: "#f5f5f4",
        surface: "#12181a",
        border: "#1f2a2c",
        muted: "#334155",
        felt: {
          DEFAULT: "#0e5c2f",
          dark: "#0a4024",
          light: "#167a3e",
          rim: "#3d2817",
        },
        gold: {
          DEFAULT: "#d4af37",
          soft: "#f0d76b",
          dark: "#8a6a12",
        },
        chip: {
          white: "#f5f5f4",
          red: "#dc2626",
          blue: "#2563eb",
          green: "#16a34a",
          black: "#0f172a",
        },
        action: {
          fold: "#dc2626",
          call: "#16a34a",
          raise: "#f59e0b",
        },
      },
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Poppins", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        "felt-inner": "inset 0 0 120px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.4)",
        "gold-glow": "0 0 0 1px rgba(212,175,55,0.4), 0 8px 28px rgba(212,175,55,0.15)",
        "card": "0 2px 8px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.08)",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "deal-in": {
          "0%": { opacity: "0", transform: "translateY(-30px) rotate(-8deg) scale(0.8)" },
          "100%": { opacity: "1", transform: "translateY(0) rotate(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "deal-in": "deal-in 300ms cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
