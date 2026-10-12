// Production-build smoke: drives a `vite preview` (or any deployed origin)
// through the screens that only break in the PRODUCTION bundle — chunk
// graph, service worker, env inlining. The dev server cannot catch those
// (2026-09-30: manual chunk groups blanked the 3D scenes in prod only).
//
//   pnpm --filter @power-up-chess/web build && pnpm --filter @power-up-chess/web exec vite preview --port 4173 &
//   node e2e/preview-smoke.mjs http://localhost:4173
//
// Passes the castle gate by seeding a bypass identity in localStorage
// (see .claude/skills/run-power-up-chess/SKILL.md). Exit 1 on any failure.
import { chromium } from '@playwright/test'

const base = process.argv[2] ?? 'http://localhost:4173'
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message.slice(0, 160)))
// Against a deployed origin, an App Check failure or a rules denial is an
// outage even though every screen still renders (2026-10-11: the hall drew
// fine while every Firestore read was denied; the old checks passed).
const firebaseErrors = []
page.on('console', (m) => {
  const t = m.text().replace(/\s+/g, ' ')
  if (/@firebase\/app-check|appCheck\/|permission-denied|insufficient permissions/i.test(t)) firebaseErrors.push(t.slice(0, 160))
})
// reCAPTCHA Enterprise scores a headless browser (and any datacenter IP) below
// App Check's 0.5 threshold, so attestation is refused with a 403 even when
// real users are fine. An App Check *debug token* (Firebase console → App
// Check → Apps → web app → Manage debug tokens) lets this probe through:
//   APPCHECK_DEBUG_TOKEN=<token> node e2e/preview-smoke.mjs https://…
const debugToken = process.env.APPCHECK_DEBUG_TOKEN
await page.addInitScript((token) => {
  if (token) self.FIREBASE_APPCHECK_DEBUG_TOKEN = token
  localStorage.setItem('puc:castle-identity:v2', JSON.stringify({
    savedAt: Date.now(),
    identity: { displayName: 'Probe', normalizedName: 'probe', castlePoints: 0, isBypass: true, isFirstVisit: false },
  }))
}, debugToken)
let failed = 0
const step = async (name, fn) => {
  try { await fn(); console.log('OK  ', name) } catch (e) { failed++; console.log('FAIL', name, String(e.message).split('\n')[0].slice(0, 160)) }
}
const text = async () => (await page.locator('body').innerText()).replace(/\n+/g, ' ')

await step('siege menu renders', async () => {
  await page.goto(base + '/arcade/tower-defense', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  if (!/The Siege/.test(await text())) throw new Error('body: ' + (await text()).slice(0, 80))
})
await step('hall renders for a seeded identity', async () => {
  await page.goto(base + '/', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  if (!/Welcome back/.test(await text())) throw new Error((await text()).slice(0, 80))
})
await step('local chess opens and the 3D board mounts', async () => {
  await page.getByText('Local Chess', { exact: true }).last().click({ timeout: 8000 })
  await page.getByText('No clock', { exact: true }).click({ timeout: 8000 })
  await page.getByRole('button', { name: /^Open room/ }).click({ timeout: 8000 })
  await page.waitForTimeout(2000)
  await page.getByRole('button', { name: /3D/ }).first().click({ timeout: 8000 })
  await page.locator('canvas').first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(4000)
  const aria = await page.locator('[role="application"]').first().getAttribute('aria-label')
  if (!aria || !/chess board/.test(aria)) throw new Error('3D board aria-label missing: ' + aria)
})
await step('puzzle leaderboard loads (auth-gated read)', async () => {
  await page.goto(base + '/puzzles/leaderboard', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  if (!/Trophies/.test(await text())) throw new Error((await text()).slice(0, 80))
})
await step("knight's run (phaser chunk) mounts", async () => {
  await page.goto(base + '/knights-run', { waitUntil: 'domcontentloaded' })
  await page.locator('canvas').first().waitFor({ timeout: 30000 })
})
await browser.close()
if (errors.length) { failed++; console.log('page errors:\n' + errors.join('\n')) }
if (base.startsWith('https://') && firebaseErrors.length) {
  const lines = [...new Set(firebaseErrors)].slice(0, 8).join('\n')
  if (!debugToken && firebaseErrors.some((l) => /AppCheck: 403/.test(l))) {
    // Attestation refused for THIS client; says nothing about real users.
    console.log('WARN App Check refused this headless client (403 = low reCAPTCHA score); confirm from a real browser, or set APPCHECK_DEBUG_TOKEN:\n' + lines)
  } else { failed++; console.log('firebase errors (App Check / rules):\n' + lines) }
}
console.log(failed ? `${failed} failure(s)` : 'all good')
process.exit(failed ? 1 : 0)
