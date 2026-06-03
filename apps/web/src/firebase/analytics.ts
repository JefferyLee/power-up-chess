// Firebase Analytics — kid-safe behaviour telemetry for Jeff (the dev).
//
// What gets tracked: screen views, game start/end, puzzle attempts, opening /
// endgame clears, where host commentary came from (cache / llm / template),
// story plays. Anything that helps answer "where is Ada spending time, where
// is she stuck, where does she rage-quit."
//
// What does NOT get tracked: displayName, FENs / chess positions, message
// text, anything that identifies a specific child or leaks game state. Auth
// uid is hashed before logging so the GA4 property never sees a raw uid.
//
// Privacy: Google Signals + ad personalization are turned off (allow_ad_personalization_signals
// = false, allow_google_signals = false) because the app is for under-13s and
// we don't want Google's ad graph touching this. measurementId comes from the
// env so dev/prod can be split if needed; if it's absent (CI, tests, local
// without analytics), every track() call is a silent no-op.

import { getApp } from 'firebase/app'
import {
  type Analytics,
  getAnalytics,
  isSupported,
  logEvent,
  setAnalyticsCollectionEnabled,
} from 'firebase/analytics'

const MEASUREMENT_ID = import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ''
const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === '1'

type AnalyticsState = { kind: 'pending' } | { kind: 'ready'; instance: Analytics } | { kind: 'off' }

let state: AnalyticsState = { kind: 'pending' }

async function ensureAnalytics(): Promise<Analytics | null> {
  if (state.kind === 'ready') return state.instance
  if (state.kind === 'off') return null
  state = { kind: 'off' }
  if (!MEASUREMENT_ID || USE_EMULATORS) return null
  if (typeof window === 'undefined') return null
  const supported = await isSupported().catch(() => false)
  if (!supported) return null
  try {
    const instance = getAnalytics(getApp())
    // Disable ad personalization — required for COPPA-style kid apps. We
    // also explicitly set allow_google_signals off via gtag below.
    setAnalyticsCollectionEnabled(instance, true)
    try {
      const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
      if (typeof gtag === 'function') {
        gtag('set', 'allow_google_signals', false)
        gtag('set', 'allow_ad_personalization_signals', false)
      }
    } catch {
      // gtag not yet defined in some race — non-fatal.
    }
    state = { kind: 'ready', instance }
    return instance
  } catch {
    return null
  }
}

/** Hash a uid down to a stable 8-char tag so the GA4 property never sees the
 *  raw auth uid. Not a security boundary — just a politeness layer. */
function hashUid(uid: string): string {
  let h = 5381
  for (let i = 0; i < uid.length; i++) {
    h = ((h * 33) ^ uid.charCodeAt(i)) >>> 0
  }
  return h.toString(36).slice(0, 8)
}

/** Param map allowed on track(). Strings, numbers, and booleans only; nothing
 *  that could leak a name, position, or message text. */
export type TrackParams = Record<string, string | number | boolean | null | undefined>

/** Fire-and-forget. Safe to call before analytics has booted; will silently
 *  drop if measurement id is missing or analytics is unsupported. */
export function track(eventName: string, params?: TrackParams): void {
  void ensureAnalytics().then((a) => {
    if (!a) return
    try {
      const cleaned: Record<string, string | number | boolean> = {}
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v === null || v === undefined) continue
          if (typeof v === 'string' && v.length > 100) cleaned[k] = v.slice(0, 100)
          else cleaned[k] = v
        }
      }
      logEvent(a, eventName, cleaned)
    } catch {
      // Never let analytics throw into the calling code path.
    }
  })
}

export function trackScreen(name: string): void {
  track('screen_view', { screen_name: name })
}

export function trackWithUid(eventName: string, uid: string | null | undefined, params?: TrackParams): void {
  const extra: TrackParams = uid ? { ...params, uid_hash: hashUid(uid) } : { ...params }
  track(eventName, extra)
}
