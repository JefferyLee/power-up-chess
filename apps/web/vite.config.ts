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
      // No includeAssets / includeManifestIcons: the glob below already
      // picks up favicon.svg and icons/*.png, and listing them again
      // precached each icon twice.
      includeManifestIcons: false,
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
        // Big or optional things stay out of the SW precache and are
        // fetched on demand; the runtime caches below pick them up.
        globIgnores: [
          // 25 MB of TTS audio.
          '**/audio/**',
          '**/stories.bundle.json',
          // Hall door / host / hall art + the cosmetic piece sets
          // (hd, chibi, stone ≈ 2 MB; the default 'classic' set is SVG
          // and bundled).
          '**/sprites/**',
          // 3D assets (model textures are .png — keep them out of the
          // precache; the runtime models3d cache picks them up).
          '**/models3d/**',
          // Share-card image — only social crawlers fetch it.
          'og.png',
          // Phaser (Knight's Run) and three.js (3D board, Tower Defense)
          // — 1.3 MB and 0.9 MB chunks named by codeSplitting below.
          'assets/phaser-*.js',
          'assets/three-*.js',
        ],
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
            // Hall door / host / hall art + cosmetic piece-set PNGs.
            // Visited once, then static. Pattern is NOT end-anchored so
            // it still matches the ?v=N cache-buster query the doors
            // carry (see DOOR_ART_VERSION in RoomDoor.tsx).
            urlPattern: /\/sprites\/.*\.png(\?.*)?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puc-sprites-v1',
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Code that is too big to precache for everyone: Phaser and
            // three.js (see globIgnores). Content-hashed, so cache-first
            // is safe; a new build simply fetches a new URL.
            urlPattern: /\/assets\/(phaser|three)-[^/]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puc-chunks-v1',
              expiration: { maxEntries: 6, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Puzzle bank (data/puzzles/lichess.json, ~2.6 MB) — served
            // as a hashed asset and fetched on first use (puzzles/loader.ts).
            urlPattern: /\/assets\/lichess-[^/]+\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puc-puzzles-v1',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Pre-generated TTS mp3s + the Hall music bed, plus the
            // bundled mp3s under /assets/ (Forest music bed, gate sounds).
            // Cache-first so repeat plays are instant and survive
            // offline use. Range-aware so seek works. Pattern tolerates
            // a ?v= query (the Hall music uses one as a cache-buster).
            // Cache name bumped v1→v2 to flush a poisoned entry:
            // hall-hearth.mp3 was requested before the file existed and
            // the SPA rewrite cached index.html under the mp3 URL.
            urlPattern: /\/(audio|assets)\/[^/]+\.mp3(\?.*)?$/,
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
  build: {
    rolldownOptions: {
      output: {
        // Stable chunk names for the two big optional libraries so the
        // PWA config above can keep them out of the precache and
        // runtime-cache them by name. Dependencies stay out of the
        // group on purpose: with the default (recursive) capture, R3F
        // drags react/react-dom into the three chunk and the entry then
        // preloads 1.2 MB of three.js.
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'phaser', test: /[\\/]node_modules[\\/]phaser[\\/]/ },
            { name: 'three', test: /[\\/]node_modules[\\/](three|@react-three)[\\/]/ },
          ],
        },
      },
    },
  },
  resolve: {
    alias: {
      // Lets the web app import puzzle data that lives at the repo root,
      // e.g. `import seed from '@data/puzzles/seed.json'`. Phase 9's Lichess
      // pipeline emits into the same folder.
      '@data': resolve(repoRoot, 'data'),
      // Phase 3.1 — single-source shared definitions (see functions/src/shared/README.md).
      '@shared': resolve(repoRoot, 'functions/src/shared'),
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
