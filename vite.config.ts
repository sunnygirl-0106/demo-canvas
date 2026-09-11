import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative URLs support both local preview and GitHub Pages project paths.
  base: './',
  plugins: [react()],
  server: { port: 5273, open: false },
})
