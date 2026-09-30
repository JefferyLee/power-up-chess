// Template-only hosts — a parental privacy/offline switch. When ON, the app
// makes NO Gemini calls for the child's own play: post-game move commentary
// and the story recap use built-in templates, and the kid's explicit "ask a
// host" / "tell a story" actions are disabled. (The shared Great Hall host
// chatter is a separate server-side social feature and is unaffected.)

import { useSyncExternalStore } from 'react'
import { KEYS, readKey, writeKey } from '../storage/keys'

export function isTemplateOnly(): boolean {
  return readKey(KEYS.templateOnly) === '1'
}

export function setTemplateOnly(on: boolean): void {
  writeKey(KEYS.templateOnly, on ? '1' : '0')
  // Notify same-tab subscribers (the storage event only fires cross-tab).
  window.dispatchEvent(new Event('puc:template-only-changed'))
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('puc:template-only-changed', cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener('puc:template-only-changed', cb)
    window.removeEventListener('storage', cb)
  }
}

/** React hook — re-renders when the setting flips (this tab or another). */
export function useTemplateOnly(): boolean {
  return useSyncExternalStore(subscribe, isTemplateOnly, () => false)
}
