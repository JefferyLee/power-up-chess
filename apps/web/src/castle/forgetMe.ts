// Client side of "delete my account & data". Calls the server erase, then
// wipes everything this app stored locally (identity, chess history, puzzle
// attempts, progress flags, prefs, mini-game saves) so nothing personal is
// left on the device either.

import { callForgetMe } from '../firebase/callables'
import { clearIdentity } from './identity'
import { clearAllGames } from '../history/api'

/** Remove all app-owned local data (localStorage + IndexedDB). Best-effort. */
export async function wipeLocalData(): Promise<void> {
  try { clearIdentity() } catch { /* ignore */ }
  try { await clearAllGames() } catch { /* ignore */ }

  // Every key this app writes is namespaced "puc:" or "puc." — drop them all.
  try {
    const doomed: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && /^puc[:.]/i.test(k)) doomed.push(k)
    }
    doomed.forEach((k) => localStorage.removeItem(k))
  } catch { /* ignore */ }

  // Drop app-owned IndexedDB databases beyond the chess history already
  // cleared above (forest / knight's-run scores, etc.), where the browser
  // supports enumerating them.
  try {
    const idb = indexedDB as unknown as { databases?: () => Promise<Array<{ name?: string }>> }
    if (idb.databases) {
      const dbs = await idb.databases()
      for (const d of dbs) {
        if (d.name && /puc|forest|knight/i.test(d.name)) indexedDB.deleteDatabase(d.name)
      }
    }
  } catch { /* ignore */ }
}

/** Irreversibly erase the account server-side, then wipe local data. */
export async function forgetMeAndWipe(normalizedName: string): Promise<void> {
  await callForgetMe(normalizedName)
  await wipeLocalData()
}
