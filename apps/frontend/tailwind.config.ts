import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,html}"],
  theme: {
    extend: {
      colors: {
        // Warm-vibrant chrome palette (Jony pass 2026-06-07, vibrancy bump).
        // Mirrors the CSS vars in src/styles/index.css; keep the two in sync.
        "yn-bg": "#fdba74",
        "yn-tile": "#fff7ed",
        "yn-border": "#fb923c",
        "yn-ink": "#7c2d12",
        "yn-muted": "#9a3412",
        "yn-accent": "#ea580c",
      },
      gridTemplateColumns: {
        portal: "repeat(3, minmax(0, 1fr))",
        "portal-portrait": "repeat(2, minmax(0, 1fr))",
      },
    },
  },
  plugins: [],
};

export default config;
