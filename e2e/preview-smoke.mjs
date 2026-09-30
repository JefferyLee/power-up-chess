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
await page.addInitScript(() => {
  localStorage.setItem('puc:castle-identity:v2', JSON.stringify({
    savedAt: Date.now(),
    identity: { displayName: 'Probe', normalizedName: 'probe', castlePoints: 0, isBypass: true, isFirstVisit: false },
  }))
})
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
console.log(failed ? `${failed} failure(s)` : 'all good')
process.exit(failed ? 1 : 0)
