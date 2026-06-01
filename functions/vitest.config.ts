import { defineConfig } from 'vitest/config'

// Two test surfaces:
//   - default `pnpm test`  — fast, offline unit tests under src/**/*.test.ts
//   - `pnpm test:rules`    — Firestore rules tests in test/, requires emulator
//
// We exclude the rules tests from the default run so CI / `pnpm -r test` doesn't
// silently require a running emulator.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
})
