// Local IDB persistence for Forest runs. Mirrors the chess history pattern
// in apps/web/src/history/. Used even for bypass guests so they can see
// their personal best across runs in the current tab.

import { getDb, type ForestRun } from '../../history/db'

export async function saveForestRun(run: ForestRun): Promise<void> {
  const db = await getDb()
  await db.put('forest_runs', run)
}

export async function loadBestRun(): Promise<ForestRun | null> {
  const db = await getDb()
  const all = await db.getAllFromIndex('forest_runs', 'by-score')
  if (all.length === 0) return null
  return all[all.length - 1] ?? null
}
