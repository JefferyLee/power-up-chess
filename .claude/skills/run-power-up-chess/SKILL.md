---
name: run-power-up-chess
description: Run, launch, build, or screenshot the Power Up Chess web app locally. Use when asked to start the app, smoke-test it, see what a route looks like, verify a UI change, or take a screenshot.
---

# Run Power Up Chess

The deployable unit is `apps/web` — a React + Vite single-page app that
talks to the live Firebase backend at `power-up-chess-dev`. Everything
else in the repo (`functions/`, `tools/*`) is server-side or offline
tooling.

The agent path is a Node driver: it starts the dev server (or reuses
one already on `:5173`), waits for the HTML shell + entry bundle to
respond, takes a headless-Chrome screenshot, and cleans the server up.

> All paths below are relative to the repo root.

## Prerequisites

- macOS with Google Chrome at the standard path (`/Applications/Google Chrome.app/...`). On other platforms, edit the `CHROME` constant in `driver.mjs`.
- Node 22 everywhere (`engines: { node: "22" }` in `package.json`; `functions/` deploys on the `nodejs22` runtime per `firebase.json`).
- `pnpm` 10 (`packageManager` pin). `corepack enable && corepack prepare pnpm@10.32.0` works if missing.

## Setup (once)

```bash
pnpm install
```

Installs the whole workspace (`apps/web`, `functions/`, `tools/*`). The
web app on its own pulls ~600 MB into `node_modules`.

## Run (agent path — driver)

The committed driver lives at
`.claude/skills/run-power-up-chess/driver.mjs`. It's idempotent; if
something is already serving on `:5173` it reuses that server, otherwise
it spawns `pnpm dev` in `apps/web` and stops it on exit.

```bash
# Desktop-width screenshot of the castle gate (the default route).
node .claude/skills/run-power-up-chess/driver.mjs

# A specific route (won't get past the castle gate without a magic word;
# the driver doesn't drive forms — see "Beyond a screenshot" below).
node .claude/skills/run-power-up-chess/driver.mjs --route /history

# Phone-width run to verify responsive layout (useResponsiveSquareSize, etc).
node .claude/skills/run-power-up-chess/driver.mjs --width 414 --height 800

# Leave the dev server running after the shot (handy for `pnpm dev` workflows).
node .claude/skills/run-power-up-chess/driver.mjs --keep
```

The driver prints the absolute screenshot path on stdout (default:
`last-screenshot.png` next to the driver). Status / vite output goes to
stderr. Non-zero exit on any failure (Chrome missing, server didn't
come up in 30 s, screenshot < 1 KB).

After it runs, view the result with the `Read` tool on the path it
printed.

## Run (human path)

```bash
cd apps/web && pnpm dev
# → Vite is up at http://localhost:5173, hot-reload, etc.
```

For a quick deployed-bundle check: `pnpm build && pnpm preview`. The
dev server is the right thing for screenshots and iteration; the
production build is the right thing to verify a route-split bundle.

## Beyond a screenshot (driving the UI)

The driver only takes pictures — Chrome headless without a CDP harness
can't click buttons or type into forms. If you need a form submission
(magic-word castle gate, puzzle solve, wizard duel cast) you have two
options:

1. **Use the deployed dev site instead** — `https://power-up-chess-dev.web.app`
   has the latest deployed bundle and the real Firestore backend.
   `firebase deploy --only hosting` from the repo root pushes the current
   build. Then drive it manually in a desktop Chrome.
2. **Drive it with Playwright** — `@playwright/test` is installed at
   the repo root (`pnpm e2e` runs `playwright test`; no config or specs
   are committed, so probes are ad-hoc scripts run with `node`). If the
   browser binary is missing, `npx playwright install chromium` once.

   The castle gate reads its identity from localStorage, so a probe can
   skip the name + magic-word form by seeding a bypass identity before
   the app boots. This is how the Siege and Wizard's Duel probes were
   driven:

   ```js
   import { chromium } from '@playwright/test'

   const browser = await chromium.launch()
   const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
   await page.addInitScript(() => {
     window.localStorage.setItem('puc:castle-identity:v2', JSON.stringify({
       savedAt: Date.now(),
       identity: {
         displayName: 'Probe',
         normalizedName: 'probe',
         castlePoints: 0,
         isBypass: true,
         isFirstVisit: false,
       },
     }))
   })
   await page.goto('http://localhost:5173/arcade/tower-defense')
   await page.screenshot({ path: 'probe.png' })
   await browser.close()
   ```

   Bypass identities earn no castle points and write nothing to
   Firestore. Point-gated doors (Online / AI Practice at 200, Wizard at
   1000) check `castlePoints`, so raise it in the seed to probe those.

## Test

```bash
pnpm test                                    # vitest across the workspace
pnpm --filter @power-up-chess/web test       # just the web tests (fast)
```

Notably `apps/web/src/puzzles/loader.test.ts` runs `puzzle integrity`
across every puzzle in `data/puzzles/lichess.json` — a good signal that
the puzzle bundle is well-formed.

## Build + deploy

```bash
pnpm --filter @power-up-chess/web build      # tsc -b && vite build → apps/web/dist
firebase deploy --only hosting               # pushes apps/web/dist
firebase deploy --only "functions:foo,functions:bar"   # named functions only
firebase deploy --only firestore:rules       # security rules
```

Naming specific functions matters — `firebase deploy --only functions`
deploys all of them and is slow.

## Gotchas

- **The dev server talks to the LIVE backend** (`power-up-chess-dev`
  Firestore + Cloud Functions). There is no `.env.local` swap to the
  emulators — running `pnpm dev` against a fresh machine just works
  IF the device has internet. Castle points, wizard duels, chat — all
  hit prod. Mind what you write.
- **First load is moderate.** The entry bundle is ~380 KB gzipped JS
  + ~44 KB gzipped CSS (1.3 MB / 276 KB raw); route chunks lazy-load
  on top. Stockfish is a separate ~7 MB runtime `.wasm` under
  `public/stockfish/`, fetched on demand for post-game analysis and
  kept out of the shell precache. Vite's first request can take 4-6 s
  while it transforms 175+ modules. The driver waits up to 30 s for
  `/` to return 200.
- **Headless Chrome flips off the Google fonts** (`PHONE_REGISTRATION_ERROR`
  noise in stderr is unrelated GCM chatter, ignore it). Screenshots
  use system fallbacks for Cinzel / IM Fell English — fine for layout
  verification, off for pixel-perfect typography review.
- **Castle gate is the first paint.** Any deeper route (`/r/:id`,
  `/wizard/:id`, `/history`, `/puzzles`) requires the visitor to enter
  a name + magic word first, which the driver can't do. To screenshot
  past it, seed the bypass identity with Playwright (see "Beyond a
  screenshot" above) or drive the deployed site.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Chrome not found at /Applications/...` | Edit the `CHROME` constant in `driver.mjs` — point at Chromium / Edge / your system browser, or install Chrome. |
| `Server did not respond at http://localhost:5173 within 30000ms` | `pnpm install` hasn't been run, OR another process is on `:5173` returning 5xx. `lsof -i :5173` to find it. |
| `Screenshot suspiciously small: <bytes>` | Chrome rendered a blank — check `/tmp/vite.log` (driver's stderr) for a Vite transform error. Usually a syntax error in something you just edited. |
| `pnpm dev` warns about engine | The whole workspace, `functions/` included, is pinned to Node 22 — switch to Node 22 (`nvm use 22`). |
