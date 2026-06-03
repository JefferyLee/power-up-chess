import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: SW silently swaps in the new build on next nav.
      // Acceptable for a kids app — no annoying "Update?" toast.
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icons/apple-touch-icon.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
      ],
      manifest: {
        name: 'Power Up Chess',
        short_name: 'Power Up',
        description:
          'A warm, safe home where kids learn chess by playing — puzzles, lessons, stories, side games.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#1a1530',
        background_color: '#0f1a10',
        lang: 'en',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['games', 'education', 'kids'],
      },
      workbox: {
        // Precache the Vite asset bundle so the shell is offline-ready.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // 25 MB of audio + the 96 KB stories bundle are large — fetch
        // on demand and let the runtime cache pick them up.
        globIgnores: ['**/audio/**', '**/stories.bundle.json'],
        // Lift the precache file-size cap so the biggest JS chunk fits.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        runtimeCaching: [
          {
            // Pre-generated TTS mp3s. Cache-first so repeat plays are
            // instant and survive offline use. Range-aware so seek works.
            urlPattern: /\/audio\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puc-audio-v1',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
          {
            // Story metadata. Stale-while-revalidate so updates roll
            // in on next visit without blocking first paint.
            urlPattern: /\/stories\.bundle\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'puc-stories-v1',
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Stockfish WASM — big, cache hard.
            urlPattern: /\/stockfish\/.*\.(js|wasm)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puc-stockfish-v1',
              expiration: { maxEntries: 5, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Google Fonts (Cinzel / Caveat / IM Fell English families).
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'puc-fonts-v1',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      // Lets the web app import puzzle data that lives at the repo root,
      // e.g. `import seed from '@data/puzzles/seed.json'`. Phase 9's Lichess
      // pipeline emits into the same folder.
      '@data': resolve(repoRoot, 'data'),
    },
  },
  server: {
    fs: {
      // The alias above resolves outside apps/web, so Vite's dev server needs
      // explicit permission to read from there.
      allow: [here, repoRoot],
    },
  },
})
