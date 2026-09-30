#!/usr/bin/env node
// grant-admin — put the `admin: true` custom claim on one or more Firebase
// Auth uids. Cloud Functions (castle/requireAdmin.ts) and the feedback
// Firestore rule check `request.auth.token.admin == true`; nothing else
// makes a caller an admin any more.
//
//   node tools/admin/grant-admin.mjs <uid> [<uid> ...]
//   node tools/admin/grant-admin.mjs --revoke <uid> [<uid> ...]
//
// Credentials: application-default credentials for the Firebase project in
// .firebaserc — run `gcloud auth application-default login` once with the
// Google account that owns the project (or point GOOGLE_APPLICATION_CREDENTIALS
// at a service-account key). Override the project with FIREBASE_PROJECT=...
//
// Finding the uid: Anonymous Auth mints one uid per browser profile / device,
// so grant every uid you moderate from. Firebase console → Firestore →
// `guests/jeff` → the `uids` array lists each uid that has signed in with
// jeff's magic word; the Authentication tab shows the same ids with their
// creation dates. The running app must refresh its ID token before the claim
// shows up (sign out and back in, or wait for the hourly refresh).
//
// Reuses firebase-admin from functions/ — run `pnpm install` there first.

import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'

const require = createRequire(new URL('../../functions/package.json', import.meta.url))
const { initializeApp, applicationDefault } = require('firebase-admin/app')
const { getAuth } = require('firebase-admin/auth')

const args = process.argv.slice(2)
const revoke = args.includes('--revoke')
// --guest <name> resolves every uid on guests/<name> (one per device), so
// Jeff can grant himself without copying uids out of the console.
const guestIdx = args.indexOf('--guest')
const guestName = guestIdx >= 0 ? args[guestIdx + 1] : null
const uids = args.filter((a, i) => a !== '--revoke' && a !== '--guest' && i !== guestIdx + 1)
if (uids.length === 0 && !guestName) {
  console.error('usage: node tools/admin/grant-admin.mjs [--revoke] (<uid> [<uid> ...] | --guest <name>)')
  process.exit(2)
}

const firebaserc = JSON.parse(
  readFileSync(new URL('../../.firebaserc', import.meta.url), 'utf8'),
)
const projectId = process.env.FIREBASE_PROJECT ?? firebaserc.projects.default

// User ADC (gcloud auth application-default login) can call Identity
// Toolkit only with a quota project; without this the Auth call 403s.
process.env.GOOGLE_CLOUD_QUOTA_PROJECT ??= projectId
initializeApp({ credential: applicationDefault(), projectId })
const auth = getAuth()

if (guestName) {
  const { getFirestore } = require('firebase-admin/firestore')
  const snap = await getFirestore().doc(`guests/${guestName.trim().toLowerCase()}`).get()
  if (!snap.exists) {
    console.error(`no guest doc for "${guestName}"`)
    process.exit(1)
  }
  uids.push(...(snap.data().uids ?? []))
  console.log(`guest ${guestName}: ${uids.length} uid(s)`)
}

for (const uid of uids) {
  const user = await auth.getUser(uid) // throws auth/user-not-found on a typo
  const claims = { ...(user.customClaims ?? {}) }
  if (revoke) delete claims.admin
  else claims.admin = true
  await auth.setCustomUserClaims(uid, claims)
  console.log(`${revoke ? 'revoked' : 'granted'} admin on ${uid} (${projectId}); claims now:`, claims)
}
