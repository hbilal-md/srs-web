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
        // Charcoal/ash gray theme with green accents
        dark: {
          bg: '#1e1e1e',        // Charcoal gray background
          card: '#2b2b2b',      // Lighter charcoal for cards
          accent: '#3a3a3a',    // Ash gray for accents
          text: '#e8e8e8',      // Light text
          muted: '#888',        // Muted text
        },
        // Accent green
        accent: {
          green: '#8AC926',     // Primary green accent
        },
        // Rating button colors
        rating: {
          again: '#e74c3c',     // Red for again
          hard: '#e67e22',      // Orange for hard
          good: '#8AC926',      // Green accent for good
          easy: '#3498db',      // Blue for easy
        },
      },
    },
  },
  plugins: [],
}
export default config
