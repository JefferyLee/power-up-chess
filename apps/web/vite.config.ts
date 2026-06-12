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
        // 25 MB of audio + the 96 KB stories bundle + the 14 Hall
        // door PNGs (~110 KB each) are kept out of the SW precache.
        // Fetch on demand and let the runtime cache pick them up.
        globIgnores: [
          '**/audio/**',
          '**/stories.bundle.json',
          '**/sprites/doors/**',
          '**/sprites/hosts/**',
          '**/sprites/hall/**',
          // 3D assets (model textures are .png — keep them out of the
          // precache; the runtime models3d cache picks them up).
          '**/models3d/**',
        ],
        // Lift the precache file-size cap so the biggest JS chunk fits.
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Make new deploys take effect on next visit instead of waiting
        // for every tab to close. Without these, iPhone Safari can keep
        // serving the previous shell indefinitely from the old SW.
        // skipWaiting: new SW activates the moment install finishes.
        // clientsClaim: that SW immediately controls open pages too.
        // cleanupOutdatedCaches: prune precache entries from prior builds.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Hall door art (full-door PNGs). Visited once when the
            // kid opens the Hall, then static. Pattern is NOT end-
            // anchored so it still matches the ?v=N cache-buster query
            // the doors carry (see DOOR_ART_VERSION in RoomDoor.tsx).
            urlPattern: /\/sprites\/(doors|hosts|hall)\/.*\.png(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puc-doors-v2',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Pre-generated TTS mp3s + the Hall music bed. Cache-first
            // so repeat plays are instant and survive offline use.
            // Range-aware so seek works. Pattern tolerates a ?v= query
            // (the Hall music uses one as a cache-buster). Cache name
            // bumped v1→v2 to flush a poisoned entry: hall-hearth.mp3
            // was requested before the file existed and the SPA rewrite
            // cached index.html under the mp3 URL.
            urlPattern: /\/audio\/.*\.mp3(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puc-audio-v2',
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
            // 3D assets: piece models (GLTF + bin, ~2.5 MB) plus the
            // environment HDR + wood texture under /models3d/env/.
            // Fetched only when a kid flips to 3D view; cache-first so
            // later flips are instant and survive offline.
            urlPattern: /\/models3d\/.*\.(gltf|bin|hdr|jpg|png)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puc-models3d-v1',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
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
