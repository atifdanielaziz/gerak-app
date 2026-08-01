import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Isolated so a Supabase SDK version bump doesn't invalidate the
        // app-code chunk's cache (and vice versa) — the two change on
        // independent schedules, but were previously bundled together into
        // the eager entry chunk, forcing every deploy to re-download both.
        manualChunks(id) {
          if (id.includes('@supabase/supabase-js')) return 'supabase';
        },
      },
    },
    // maplibre-gl and pdf-lib push their own (already lazy-loaded, see
    // src/components/MapboxRideMap.tsx and src/lib/watermark.ts) chunks past
    // the default 500kb warning — both only download when a user actually
    // opens the ride map or generates a receipt, never on initial load, so
    // the warning was a false positive rather than something to split further.
    chunkSizeWarningLimit: 1100,
  },
})
