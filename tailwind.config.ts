import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // SpaceX-inspired monochrome palette
        base: {
          black: "#000000",
          900: "#050608",
          800: "#0a0d12",
          700: "#11151c",
          600: "#1a2029",
          500: "#2a323d",
        },
        accent: {
          DEFAULT: "#5f7183", // muted steel — restrained, not vivid
          bright: "#9fb0c6", // soft cool grey for highlights
          glow: "#2b3a4d",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-inter)",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      letterSpacing: {
        widest: "0.25em",
      },
    },
  },
  plugins: [],
};

export default config;
