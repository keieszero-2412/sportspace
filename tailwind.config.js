/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        sport: {
          bg: '#FFFDF7',
          text: '#31465A',
          surface: '#D9F0FF',
          primary: '#89B9E6',
          highlight: '#C7DFA3',
          darkBg: '#0C2D45',
          darkText: '#FFF8D2',
          darkSurface: '#3E5BA3',
          darkPrimary: '#84D175',
          darkHighlight: '#E6FBDA'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Be Vietnam Pro', 'system-ui', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
