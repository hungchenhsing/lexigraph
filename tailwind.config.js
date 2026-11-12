/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // LingQ-style word-state palette (refined later per design doc §8)
        state: {
          unknown: "#fde68a", // amber-200 — 生詞（預設底色）
          seen: "#fcd34d",    // amber-300
          learning: "#fbbf24",// amber-400
          familiar: "#f59e0b",// amber-500
          mastered: "transparent", // 已掌握不加底色
          known: "transparent",
        },
      },
      fontFamily: {
        reader: ['"Noto Serif"', "Georgia", "Cambria", "serif"],
        ui: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
