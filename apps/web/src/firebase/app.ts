// Firebase app + service singletons.
//
// The Web SDK config values are intentionally bundled into the client — they
// route requests to our project, but security is enforced server-side by Auth,
// Firestore rules, and Cloud Functions.

import { getApp, getApps, initializeApp, type FirebaseOptions } from 'firebase/app'
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
