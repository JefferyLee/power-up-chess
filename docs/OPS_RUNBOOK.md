# Ops runbook — Power Up Chess

Owner: Jeff. Operator: the **Powerupcastle OP** bot (Toxi alias `castle-op`),
handed over 2026-10-12. Engineering: Claude (Toxi alias `ada`, Jeff's Claude Code session
on the Mac "Ada"). Scripts live in `tools/ops/`.

Mission: keep <https://app.powerupcastle.app> working for Ada and her friends;
notice an outage within 10 minutes, fix or roll back fast, tell Jeff.

## System map (what can break)

- **Hosting** — Firebase Hosting site `power-up-chess-dev`; the custom domain
  `app.powerupcastle.app` is proxied by Cloudflare. `sw.js`, `index.html`,
  `registerSW.js`, `workbox-*.js` carry `no-cache` headers (`firebase.json`)
  so the PWA picks up a new build on the next navigation.
- **Web app** — React + Vite PWA. The Firebase config and the App Check site
  key are baked in at build time from the GitHub repository variables
  (`VITE_*`, see `docs/DEPLOY.md`).
- **Functions** — Firebase Functions v2, Node 22, `us-central1` (Cloud Run
  underneath), ~90 callables, public invoker; every callable shares the
  `APP_CHECK_ENFORCE` switch (`0` today = monitor).
- **Firestore** — default-deny rules, all writes go through functions.
  **App Check is ENFORCED** on Firestore: the web app is registered with the
  reCAPTCHA **Enterprise** provider; the key (`6LeH6eot…`, display name
  "puc") lives in GCP project `power-up-chess-dev` with the domains
  `app.powerupcastle.app`, `power-up-chess-dev.web.app`,
  `power-up-chess-dev.firebaseapp.com`, `localhost`.
- **Auth** — Anonymous Auth plus a name + magic-word layer (not real auth).
- **Delivery** — push to `main` → CI (`checks`, `rules-test`,
  `preview-smoke`) → Deploy (rules + indexes, functions, hosting), ≈4 min
  after CI is green. Manual: `gh workflow run deploy.yml -f targets=hosting`
  (`functions`, `rules`, `all`).
- **LLM** — Gemini called from functions with a template fallback; an LLM
  failure is never an outage.

## Cadence

| every | run | act on |
| --- | --- | --- |
| 10 min | `tools/ops/healthcheck.sh` | any `FAIL` → Triage |
| 60 min, and after every Deploy run | `tools/ops/healthcheck.sh --browser` | any `FAIL` → Triage |
| 60 min | `tools/ops/status.sh` | failed CI / Deploy, new function errors |
| daily | one digest to Jeff (only if something happened; weekly heartbeat otherwise) | |

## Triage, in order

1. Re-run the failing check once more (Cloudflare and cold starts can flake
   a single run).
2. Classify it with the failure catalog below.
3. Did a Deploy just land (`status.sh`)? Then the fastest fix is usually a
   revert of that commit — see Fix policy.
4. If users are affected, notify Jeff **before** a long investigation.
5. Fix, run `healthcheck.sh --browser` on both origins, then send RESOLVED.

## Failure catalog (all from real incidents)

| symptom | cause | fix |
| --- | --- | --- |
| Pages render but data is empty; console shows `permission-denied` or `@firebase/app-check … 400` | App Check: provider/key mismatch, key from another project, domain missing on the key, or enforcement flipped | Check Firebase console → App Check → Apps: the web app must be registered with reCAPTCHA Enterprise and the site key must equal the `VITE_APPCHECK_SITE_KEY` repo variable; the key must be in `power-up-chess-dev` with the three domains. Fixing it is Jeff's / Claude's call. **Never turn enforcement off yourself** (that mismatch cost 11 days, 2026-09-30 → 10-11). |
| `healthcheck.sh --browser` prints `WARN App Check refused this headless client` (`AppCheck: 403`, 1-day throttle) while the curl checks pass | reCAPTCHA Enterprise scored the headless browser / datacenter IP below App Check's 0.5 threshold; real users are usually fine | Not an outage by itself: confirm from a real browser (Claude can, from Jeff's Chrome). For a trustworthy probe Jeff registers an **App Check debug token** (Firebase console → App Check → Apps → web app → ⋮ Manage debug tokens) and the operator exports `APPCHECK_DEBUG_TOKEN` before running the probe. A `400` from App Check is different: that is a misconfiguration → OUTAGE. |
| Every page throws `Missing VITE_FIREBASE_API_KEY` | bundle built without the repo variables | `gh variable list` must show the `VITE_*` set; re-run Deploy for hosting |
| 3D scenes blank only in production, `a is not a constructor` | manual chunk groups in `apps/web/vite.config.ts` | revert that change |
| Deploy fails in the functions step with an npm error (`edgesOut`) | `functions/pnpm-lock.yaml` drifted from `functions/package.json` | `pnpm functions:lockfile`, commit, push |
| A callable answers Cloud Run `403 … request was not authenticated` instead of its own `401` JSON (`healthcheck.sh` checks this) | the `allUsers` invoker is missing (failed first create) | `firebase functions:delete <name>` then `gh workflow run deploy.yml -f targets=functions`; needs Firebase CLI access → ask Jeff / Claude |
| Users keep seeing the old build after a deploy | `sw.js` / `index.html` no longer `no-cache` or Cloudflare caches them (`cf-cache-status: HIT`) | headers live in `firebase.json`; Cloudflare purge is Jeff's |
| Deploy fails with "permission denied enabling <api>" or an IAM 403 | API not enabled for the deploy service account / IAM propagation | enable the API in the GCP console (ask Jeff), or re-run after 2 min |
| Leaderboards stale for more than a day | the scheduled refresh functions (siege / puzzles) are erroring | `status.sh` logs → send to Claude |
| Logs say `hostCommentary: LLM failed, template fallback` | Gemini quota or outage | not an outage; mention in the daily digest if it persists |
| `index.html` 5xx or DNS failure on both origins | Firebase Hosting / Cloudflare incident | <https://status.firebase.google.com>, <https://www.cloudflarestatus.com>; notify Jeff; nothing to change in the repo |

## Fix policy — what the operator may do alone

Allowed without asking (tell Jeff in the same message as the incident):

- Re-run a failed workflow: `gh run rerun <id>`; trigger a deploy:
  `gh workflow run deploy.yml -f targets=<hosting|functions|rules|all>`.
- Roll back a bad deploy: `git revert <sha> && git push origin main`. CI and
  the production-preview smoke gate the revert; Deploy follows. Only commits
  from the last 48 h, one at a time.
- Regenerate `functions/pnpm-lock.yaml` (`pnpm functions:lockfile`).
- Update this runbook.

Ask Jeff first and wait for a yes: anything in the Firebase or GCP console
(App Check, rules, IAM, API keys, secrets, variables), any Firestore data
change or deletion, dependency upgrades, Cloudflare settings, any code change
that is not a revert.

Never: disable App Check enforcement, loosen `firestore.rules`, print or
send secrets (`functions/.env`, service-account keys, magic-word hashes),
touch user data, run `tools/admin/*`.

Code changes beyond a revert: send the diagnosis and the failing output to
Claude (`ada`); Claude writes the fix. Child-safety rules in `CLAUDE.md`
apply to any copy that ships.

## Notify (Toxi)

- Jeff: alias `jeff-iphone`. Claude: alias `ada`.
- Format: `[PUC OPS] OUTAGE|WARN|INFO|RESOLVED — what users see — cause if
  known — what was done / next step — command output tail`.
- OUTAGE (cannot enter the castle, cannot play, data empty): message Jeff
  immediately, then every 30 min until RESOLVED.
- WARN (one check flaky, LLM fallback, a deploy failed but the site is up):
  same day, batched.
- INFO: the daily digest. No acknowledgement-only messages between bots.

## Access the operator needs (Jeff provisions)

- GitHub: the repo `JefferyLee/power-up-chess` is public, so cloning and
  `healthcheck.sh` work today. Reverts and re-runs need a collaborator with
  **Write** plus `gh auth login` on the VM.
- GCP, read-only: a service account such as
  `ops-bot@power-up-chess-dev.iam.gserviceaccount.com` with
  `roles/logging.viewer`, `roles/monitoring.viewer`,
  `roles/cloudfunctions.viewer`; its JSON key on the VM, then
  `gcloud auth activate-service-account --key-file <file>`. Nothing that can
  write.
- VM tooling: git, Node 22, pnpm 10 (`corepack enable`), `pnpm install` in
  the repo, `pnpm exec playwright install --with-deps chromium`, `gh`,
  `gcloud`, `curl`.
- Toxi contacts: `jeff-iphone`, `ada`.
- App Check debug token for the probe VM (see the catalog row on `AppCheck: 403`); keep it on the VM only, never in the repo or in chat.

## Handover checklist

- [ ] castle-op: VM tooling in place, `tools/ops/healthcheck.sh` green
- [ ] castle-op: `tools/ops/healthcheck.sh --browser` green on both origins
- [ ] castle-op can reach `jeff-iphone` on Toxi (Jeff adds the contact if not)
- [ ] Jeff: GitHub Write for castle-op, read-only GCP service account
- [ ] first daily digest received
