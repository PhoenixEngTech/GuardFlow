/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        tactical: {
          bg: '#0B0F19',      // Deep space charcoal background
          panel: '#161F30',   // Sleek console inner panels
          border: '#24324D',  // Subtle UI dividing borders
          accent: '#3B82F6',  // Crisp digital telemetry blue
        }
      }
    },
  },
  plugins: [],
}
