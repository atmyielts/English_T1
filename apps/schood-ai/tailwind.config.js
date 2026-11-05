/** Schood AI uses the main platform's palette and type (apps/platform), plus a lime-to-sky AI accent. */
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#0f172a', line: '#1f2937' },
        cream: { DEFAULT: '#f6f1e8', soft: '#fbfaf7', deep: '#efe6d8' },
        lime: { DEFAULT: '#b6f24a', soft: '#d8f266' },
        sky: { ai: '#9ee7ff' },
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Manrope', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
