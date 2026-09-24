import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Stable vendor chunks: cached across deploys, so repeat opens only
        // re-fetch the (small, frequently-changing) app chunk.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          data: ['@supabase/supabase-js', 'zod', 'zod-to-json-schema'],
        },
      },
    },
  },
})
