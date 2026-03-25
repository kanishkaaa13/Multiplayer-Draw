/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Outfit", "system-ui", "sans-serif"],
      },
      colors: {
        ink: {
          950: "#070A12",
          900: "#0B1020",
          800: "#121829",
          700: "#1B2436",
        },
        accent: {
          DEFAULT: "#7C3AED",
          dim: "#5B21B6",
        },
      },
      boxShadow: {
        glow: "0 0 40px rgba(124, 58, 237, 0.25)",
      },
    },
  },
  plugins: [],
};
