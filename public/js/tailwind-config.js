// Shared Tailwind CDN config (Smallhours design). Load right after the Tailwind CDN script.
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#b9ddfe',
          300: '#7cc0fd',
          400: '#369efb',
          500: '#0c82eb',
          600: '#0265ca',
        }
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        display: ['"Fredoka"', 'cursive', 'sans-serif']
      }
    }
  }
};
