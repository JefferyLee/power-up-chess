// Swiss-style pairing for the Weekly Tournament.
//
// Greedy implementation tuned for small fields (1–10 kids): sort by
// score desc, walk top to bottom, pair each with the next unpaired
// opponent they haven't played. Odd participant gets a bye if they
// haven't taken one; otherwise we allow a rematch rather than block
// the round.
//
// Colour balance: alternate by seed position (top-seed gets white in
// even rounds, black in odd). Good enough at this scale.

import {
  BYE_OPPONENT,
  type Pairing,
  type TournamentParticipant,
  type TournamentRound,
} from './types'

export function computeScores(
  participants: TournamentParticipant[],
  rounds: TournamentRound[],
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const p of participants) scores.set(p.normalizedName, 0)
  for (const r of rounds) {
    for (const p of r.pairings) {
      switch (p.result) {
        case 'white-wins':
          scores.set(p.white, (scores.get(p.white) ?? 0) + 1)
          break
        case 'black-wins':
          scores.set(p.black, (scores.get(p.black) ?? 0) + 1)
          break
        case 'draw':
          scores.set(p.white, (scores.get(p.white) ?? 0) + 0.5)
          scores.set(p.black, (scores.get(p.black) ?? 0) + 0.5)
          break
        case 'bye-white':
          scores.set(p.white, (scores.get(p.white) ?? 0) + 1)
          break
      }
    }
  }
  return scores
}

function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`
}

export function alreadyPaired(
  rounds: TournamentRound[],
  a: string,
  b: string,
): boolean {
  const key = pairKey(a, b)
  for (const r of rounds) {
    for (const p of r.pairings) {
      if (p.black === BYE_OPPONENT) continue
      if (pairKey(p.white, p.black) === key) return true
    }
  }
  return false
}

export function byesUsed(rounds: TournamentRound[], name: string): number {
  let count = 0
  for (const r of rounds) {
    for (const p of r.pairings) {
      if (p.black === BYE_OPPONENT && p.white === name) count++
    }
  }
  return count
}

/** True when every participant has already played every other one — the
 *  Swiss/round-robin is exhausted and starting another round would
 *  force rematches. */
export function isPairingExhausted(
  participants: TournamentParticipant[],
  rounds: TournamentRound[],
): boolean {
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      if (!alreadyPaired(rounds, participants[i]!.normalizedName, participants[j]!.normalizedName)) {
        return false
      }
    }
  }
  return true
}

export function pairNextRound(
  participants: TournamentParticipant[],
  rounds: TournamentRound[],
): Pairing[] {
  if (participants.length < 2) return []
  const scores = computeScores(participants, rounds)
  // Sort by score desc, then by registration order (stable tiebreak).
  const sorted = [...participants].sort((a, b) => {
    const sa = scores.get(a.normalizedName) ?? 0
    const sb = scores.get(b.normalizedName) ?? 0
    if (sb !== sa) return sb - sa
    return a.registeredAt - b.registeredAt
  })

  const pairs: Pairing[] = []
  const used = new Set<string>()
  const roundIndex = rounds.length // 0-based — drives colour assignment

  for (let i = 0; i < sorted.length; i++) {
    const me = sorted[i]!
    if (used.has(me.normalizedName)) continue

    // Find best opponent: next unpaired-yet kid, prefer one we
    // haven't played; fall back to a rematch if no fresh option.
    let opponent: TournamentParticipant | null = null
    for (let j = i + 1; j < sorted.length; j++) {
      const cand = sorted[j]!
      if (used.has(cand.normalizedName)) continue
      if (alreadyPaired(rounds, me.normalizedName, cand.normalizedName)) continue
      opponent = cand
      break
    }
    if (!opponent) {
      // No fresh opponent. Try a bye first (if I haven't had one).
      if (byesUsed(rounds, me.normalizedName) === 0) {
        pairs.push({
          index: pairs.length,
          white: me.normalizedName,
          black: BYE_OPPONENT,
          result: 'bye-white',
        })
        used.add(me.normalizedName)
        continue
      }
      // Otherwise allow a rematch — better one extra-game than
      // dropping the kid for the round.
      for (let j = i + 1; j < sorted.length; j++) {
        const cand = sorted[j]!
        if (used.has(cand.normalizedName)) continue
        opponent = cand
        break
      }
    }
    if (!opponent) continue

    // Colour balance — top seed gets white in even rounds, swap in odd.
    const meWhite = (roundIndex + i) % 2 === 0
    pairs.push({
      index: pairs.length,
      white: meWhite ? me.normalizedName : opponent.normalizedName,
      black: meWhite ? opponent.normalizedName : me.normalizedName,
    })
    used.add(me.normalizedName)
    used.add(opponent.normalizedName)
  }

  return pairs
}
