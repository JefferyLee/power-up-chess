import type { MapDef, Modifier } from '../sim/types'
import { CAMPAIGN } from './campaign'
import { hashString, mulberry32, pick } from './rng'

const ALL_MODIFIERS: readonly Modifier[] = ['fog', 'noQueens', 'maxTowers8', 'lowBudget', 'rush', 'shielded', 'noKing']

/** Pairs that never go together (on top of the map's own modifiers). */
const CONFLICTS: ReadonlyArray<readonly [Modifier, Modifier]> = [['lowBudget', 'rush']]

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** Today's daily challenge: a campaign map (rotating by local day), a
 *  seed hashed from the date key and 1–2 extra modifiers. */
export function dailyChallenge(date: Date): { map: MapDef; seed: number; modifiers: Modifier[]; dateKey: string } {
  const y = date.getFullYear()
  const m = date.getMonth()
  const d = date.getDate()
  const dateKey = `${y}-${pad2(m + 1)}-${pad2(d)}`
  const dayIndex = Math.floor(Date.UTC(y, m, d) / 86_400_000)
  const n = CAMPAIGN.length
  const map = pick(CAMPAIGN, ((dayIndex % n) + n) % n)
  const seed = hashString(dateKey)
  const rng = mulberry32(seed)
  const want = rng() < 0.5 ? 1 : 2
  const modifiers: Modifier[] = []
  let pool = ALL_MODIFIERS.filter((x) => !map.modifiers.includes(x))
  while (modifiers.length < want && pool.length > 0) {
    const taken = [...map.modifiers, ...modifiers]
    for (const [a, b] of CONFLICTS) {
      if (taken.includes(a)) pool = pool.filter((x) => x !== b)
      if (taken.includes(b)) pool = pool.filter((x) => x !== a)
    }
    if (pool.length === 0) break
    const chosen = pick(pool, Math.floor(rng() * pool.length))
    modifiers.push(chosen)
    pool = pool.filter((x) => x !== chosen)
  }
  return { map, seed, modifiers, dateKey }
}
