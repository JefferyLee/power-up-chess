// Service worker registration (PWA — P2.L).
//
// Skipped in dev (vite-plugin-pwa exposes a dev SW only when its
// `devOptions.enabled` flag is set; we keep prod-only to avoid the
// usual "stale SW serving stale code" headaches during iteration).
//
// Uses the virtual module `virtual:pwa-register` injected by
// vite-plugin-pwa at build time, with `registerType: 'autoUpdate'`
// so the new build silently swaps in on next navigation.

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === 'undefined') return
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return
  try {
    const mod = await import('virtual:pwa-register')
    mod.registerSW({ immediate: true })
  } catch (err) {
    // Plugin not available (e.g. unusual build) — fail silently;
    // the app still works, just not installable.
    console.warn('[pwa] registerSW unavailable:', err)
  }
}
