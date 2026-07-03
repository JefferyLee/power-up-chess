// Phase 3.6 — lightweight E2E smoke against the deployed dev site.
// Run:  pnpm e2e        (or `pnpm exec playwright test`)
// CI:   .github/workflows/e2e.yml (manual dispatch + weekly cron)
//
// Read-mostly by design: the specs assert the gate + privacy surfaces render
// and the wicket opens. The full sign-in happy path (enter → daily five →
// local game) is TODO — it needs a disposable test identity story so CI runs
// don't pollute production guests.

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'https://power-up-chess-dev.web.app',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  reporter: [['list']],
})
