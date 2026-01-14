/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}", "../shared/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "color-mix(in srgb, var(--surface) calc(var(--card-opacity) * 100%), transparent)",
        surface2: "color-mix(in srgb, var(--surface-2) calc(var(--card-opacity) * 100%), transparent)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        faint: "var(--faint)",
        accent: "var(--accent)"
      }
    }
  },
  plugins: []
};
