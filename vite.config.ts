import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Tauri expects a fixed dev-server port and serves the built files itself.
export default defineConfig({
  // The website uses real paths (/pricing, /present/…), so assets load from
  // the site root. The desktop app loads relative to its bundle. VITE_BASE
  // overrides it for hosting in a sub-folder (e.g. /presenter/).
  base: process.env.VITE_BASE ?? (process.env.TAURI_ENV_PLATFORM ? './' : '/'),
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
})
