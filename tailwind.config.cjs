/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef7f6',
          100: '#d6ecea',
          200: '#a9d7d3',
          300: '#74bcb6',
          400: '#469c96',
          500: '#2f817c',
          600: '#256964',
          700: '#205552',
          800: '#1c4442',
          900: '#123433',
        },
      },
    },
  },
  plugins: [],
};
