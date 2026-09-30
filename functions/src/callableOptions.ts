// Shared onCall() options for client-facing callables.
//
// APP_CHECK is the single switch for Firebase App Check enforcement.
// Enforcement is OFF (monitor mode: tokens are checked and counted in
// the console, never required) unless the Functions env has
// APP_CHECK_ENFORCE=1 — set it in functions/.env next to IP_HASH_SECRET
// and redeploy.
//
// Do not flip it on until the domain allowlist is fixed. Enforcement on
// 2026-07-03 (reverted in cf50b86) 401'd 100% of traffic from
// app.powerupcastle.app because the reCAPTCHA v3 key behind
// VITE_APPCHECK_SITE_KEY only allowed the *.web.app origin. Checklist:
//   1. Google Cloud console → Security → reCAPTCHA → that v3 key →
//      Domains: add app.powerupcastle.app and power-up-chess-dev.web.app.
//   2. Firebase console → App Check → Apps: the web app is registered
//      with the same key; → Metrics (Cloud Functions): "verified"
//      requests arrive from app.powerupcastle.app, "missing" drops to ~0.
//   3. Then APP_CHECK_ENFORCE=1 + deploy. Same page shows 401s if it
//      goes wrong — unset the flag and redeploy to fall back.
//
// This file stays out of src/shared/ on purpose: shared/ is aliased into
// the web build and must not touch process.env.

export const APP_CHECK = { enforceAppCheck: process.env.APP_CHECK_ENFORCE === '1' }
