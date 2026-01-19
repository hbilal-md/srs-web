import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Dark theme colors matching the existing review UI
        dark: {
          bg: '#1a1a2e',
          card: '#16213e',
          accent: '#0f3460',
          text: '#e8e8e8',
          muted: '#888',
        },
        // Rating button colors
        rating: {
          again: '#e74c3c',
          hard: '#e67e22',
          good: '#27ae60',
          easy: '#3498db',
        },
      },
    },
  },
  plugins: [],
}
export default config
