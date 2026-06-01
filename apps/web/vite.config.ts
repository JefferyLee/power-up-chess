import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
