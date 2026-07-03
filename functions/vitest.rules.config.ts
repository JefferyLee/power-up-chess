import { defineConfig } from 'vitest/config'

// Config for the Firestore security-rules tests only (test/**). These need a
// running emulator, so they're invoked via `pnpm test:rules` (which wraps
// firebase emulators:exec) — never by the default `pnpm test`.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
