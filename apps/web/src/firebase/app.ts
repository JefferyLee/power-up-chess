// Firebase app + service singletons.
//
// The Web SDK config values are intentionally bundled into the client — they
// route requests to our project, but security is enforced server-side by Auth,
// Firestore rules, and Cloud Functions.

import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, type Functions } from 'firebase/functions'

function requiredEnv(key: string): string {
  const v = import.meta.env[key]
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`Missing ${key} in environment (see apps/web/.env.example).`)
  }
  return v
}

const firebaseConfig: FirebaseOptions = {
  apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requiredEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requiredEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requiredEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requiredEnv('VITE_FIREBASE_APP_ID'),
}

const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'us-central1'
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1'

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)

// App Check — activates only when a reCAPTCHA Enterprise site key is
// configured (VITE_APPCHECK_SITE_KEY: a score-based key created in this GCP
// project and registered under Firebase console → App Check → the web app).
// Firestore enforces App Check, so the provider here must match the one the
// app is registered with: 2026-09-30 → 10-11 the app was registered with
// Enterprise while the client exchanged classic v3 tokens ("App not
// registered") and every Firestore read was denied.
//
// Initialised synchronously, before the first Firestore/Auth call: with the
// earlier lazy `import('firebase/app-check')`, listeners that subscribed
// during the first paint went out without a token and were denied once.
const APPCHECK_SITE_KEY = import.meta.env.VITE_APPCHECK_SITE_KEY as string | undefined
if (APPCHECK_SITE_KEY) {
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(APPCHECK_SITE_KEY),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)
export const functions: Functions = getFunctions(app, FUNCTIONS_REGION)

// Wire emulators once, on first import. Vite HMR can re-run this module, so
// guard with a flag on globalThis.
declare global {
  var __PUC_EMULATORS_WIRED__: boolean | undefined
}

if (USE_EMULATORS && !globalThis.__PUC_EMULATORS_WIRED__) {
  globalThis.__PUC_EMULATORS_WIRED__ = true
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)

  console.info('[firebase] Connected to local emulators on 9099/8080/5001')
}
