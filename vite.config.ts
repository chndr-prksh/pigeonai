import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Relative base so the same build works on GitHub Pages project sites and on a custom domain.
export default defineConfig({
  base: './',
  plugins: [react()],
  server: { port: 5183 },
})
