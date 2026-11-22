import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base './' keeps every asset relative, so the same dist works at a domain
// root, on GitHub Pages under /evening-qt/, or in any sub-folder.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    cssMinify: false,
  },
})
