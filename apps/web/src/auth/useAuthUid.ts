// useAuthUid: signs in anonymously on first call and exposes the stable uid.
//
// Anonymous Auth is the MVP0 identity model. The same browser keeps the same
// uid across reloads (Firebase persists the credential in IndexedDB), which is
// what we need for "this is the same player rejoining their room".

import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import { useEffect, useState } from 'react'
import { auth } from '../firebase/app'

export type AuthState =
  | { status: 'loading'; uid: null }
  | { status: 'ready'; uid: string }
  | { status: 'error'; uid: null; error: Error }

export function useAuthUid(): AuthState {
  const [state, setState] = useState<AuthState>({ status: 'loading', uid: null })

  useEffect(() => {
    let cancelled = false
    const unsubscribe = onAuthStateChanged(
      auth,
      (user) => {
        if (cancelled) return
        if (user) {
          setState({ status: 'ready', uid: user.uid })
        } else {
          // No user — kick off anonymous sign-in. onAuthStateChanged will
          // re-fire with the new user once it succeeds.
          signInAnonymously(auth).catch((err: unknown) => {
            if (cancelled) return
            const error = err instanceof Error ? err : new Error(String(err))
            setState({ status: 'error', uid: null, error })
          })
        }
      },
      (err) => {
        if (cancelled) return
        setState({ status: 'error', uid: null, error: err })
      },
    )
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  return state
}
