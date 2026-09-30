// Client side of "delete my account & data". Calls the server erase, then
// wipes everything this app stored locally (identity, chess history, puzzle
// attempts, progress flags, prefs, mini-game saves) so nothing personal is
// left on the device either.

import { callForgetMe } from '../firebase/callables'
import { clearIdentity } from './identity'
import { clearAllGames } from '../history/api'
import { listOurKeys } from '../storage/keys'

/** Remove all app-owned local data (localStorage + IndexedDB). Best-effort. */
export async function wipeLocalData(): Promise<void> {
  try { clearIdentity() } catch { /* ignore */ }
  try { await clearAllGames() } catch { /* ignore */ }

  // Every key this app writes is registered in storage/keys.ts — drop them all.
  for (const k of listOurKeys('local')) { try { localStorage.removeItem(k) } catch { /* ignore */ } }
  for (const k of listOurKeys('session')) { try { sessionStorage.removeItem(k) } catch { /* ignore */ } }

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
