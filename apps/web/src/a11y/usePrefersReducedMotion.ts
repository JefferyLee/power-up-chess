// prefers-reduced-motion, readable from React (hook) and from plain
// code such as the Phaser scenes (function). Decorative motion — torch
// flicker, pulsing highlights, camera dollies — checks this and holds
// still; gameplay motion (pieces moving, enemies walking) never does.

import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(QUERY)
}

export function prefersReducedMotion(): boolean {
  return mediaQuery()?.matches ?? false
}

function subscribe(onChange: () => void): () => void {
  const m = mediaQuery()
  if (!m) return () => {}
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}

const serverSnapshot = () => false

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, prefersReducedMotion, serverSnapshot)
}
