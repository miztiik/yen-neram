import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./public/index.html", "./src/**/*.{ts,html}"],
  theme: {
    extend: {
      colors: {
        "yn-bg": "#0f172a",
        "yn-tile": "#1e293b",
        "yn-border": "#334155",
        "yn-ink": "#e2e8f0",
        "yn-muted": "#94a3b8",
        "yn-accent": "#f472b6",
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
