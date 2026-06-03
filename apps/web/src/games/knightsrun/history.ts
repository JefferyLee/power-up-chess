// Knight's Run — local IDB persistence. Mirrors the forest pattern.
// Used for everyone (bypass + magic-word guests) so personal-best survives
// page reloads in the current browser.

import { getDb, type KnightsRun } from '../../history/db'

export async function saveKnightsRun(run: KnightsRun): Promise<void> {
  const db = await getDb()
  await db.put('knights_runs', run)
}

/** Highest-score run on file. null if the kid has never finished a run. */
export async function loadBestRun(): Promise<KnightsRun | null> {
  const db = await getDb()
  const all = await db.getAllFromIndex('knights_runs', 'by-score')
  if (all.length === 0) return null
  return all[all.length - 1] ?? null
}
