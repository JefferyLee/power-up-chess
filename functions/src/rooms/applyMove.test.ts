// Phase 0.2 (AUDIT_AND_PLAN) — unit tests for the server-authoritative
// move-validation core. Covers the five audit scenarios (legal accept,
// illegal reject, wrong turn, moveIndex race, timeout adjudication) plus
// clock increment and game-end detection.

import { describe, expect, it } from 'vitest'
import { Chess } from 'chess.js'
import { applyMove } from './applyMove'
import type { ParsedUci } from './parseUci'
import type { Move, RoomDoc } from './types'

const WHITE_UID = 'uid-white'
const BLACK_UID = 'uid-black'

function uciOf(from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n'): ParsedUci {
  return { from, to, ...(promotion ? { promotion } : {}) } as ParsedUci
}

/** Build a Move[] history by replaying UCI strings from the start position. */
function history(...ucis: string[]): Move[] {
  const chess = new Chess()
  return ucis.map((uci) => {
    const fenBefore = chess.fen()
    const m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), ...(uci.length === 5 ? { promotion: uci[4] as 'q' } : {}) })
    if (!m) throw new Error(`bad test history move: ${uci}`)
    return {
      san: m.san,
      uci,
      fenBefore,
      fenAfter: chess.fen(),
      byPlayerId: m.color === 'w' ? WHITE_UID : BLACK_UID,
      clientTs: 0,
      serverTs: 0,
    }
  })
}

function room(overrides: Partial<RoomDoc> = {}): RoomDoc {
  return {
    white: { playerId: WHITE_UID, displayName: 'Ada' },
    black: { playerId: BLACK_UID, displayName: 'Rival' },
    status: 'live',
    currentFen: new Chess().fen(),
    hostMode: 'lucy',
    theme: 'forest',
    moves: [],
    timeControl: null,
    whiteTimeMs: null,
    blackTimeMs: null,
    lastTickServerTs: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

const NOW = 1_000_000

describe('applyMove', () => {
  it('accepts a legal move and appends it', () => {
    const r = applyMove(room(), { moveIndex: 0, parsed: uciOf('e2', 'e4'), uid: WHITE_UID, now: NOW })
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.updated.moves).toHaveLength(1)
    expect(r.updated.moves[0]!.san).toBe('e4')
    expect(r.updated.currentFen).toBe(r.fenAfter)
    expect(r.updated.status).toBe('live')
    expect(r.updated.updatedAt).toBe(NOW)
  })

  it('rejects an illegal move', () => {
    // e2→e5 is not a legal pawn move from the start position.
    const r = applyMove(room(), { moveIndex: 0, parsed: uciOf('e2', 'e5'), uid: WHITE_UID, now: NOW })
    expect(r).toMatchObject({ kind: 'reject', code: 'illegal' })
  })

  it('rejects a move by the player whose turn it is NOT', () => {
    const r = applyMove(room(), { moveIndex: 0, parsed: uciOf('e7', 'e5'), uid: BLACK_UID, now: NOW })
    expect(r).toMatchObject({ kind: 'reject', code: 'not-your-turn' })
  })

  it('rejects an out-of-sync moveIndex (lost-update race)', () => {
    const moves = history('e2e4')
    const r = applyMove(room({ moves }), { moveIndex: 0, parsed: uciOf('e7', 'e5'), uid: BLACK_UID, now: NOW })
    expect(r).toMatchObject({ kind: 'reject', code: 'out-of-sync' })
  })

  it('rejects when the room is not live / has no black player', () => {
    expect(
      applyMove(room({ status: 'completed' }), { moveIndex: 0, parsed: uciOf('e2', 'e4'), uid: WHITE_UID, now: NOW }),
    ).toMatchObject({ kind: 'reject', code: 'not-live' })
    expect(
      applyMove(room({ black: null }), { moveIndex: 0, parsed: uciOf('e2', 'e4'), uid: WHITE_UID, now: NOW }),
    ).toMatchObject({ kind: 'reject', code: 'no-black' })
  })

  it('adjudicates timeout: mover flagged → completed room doc to COMMIT', () => {
    const r = applyMove(
      room({
        timeControl: { initialMs: 60_000, incrementMs: 0 },
        whiteTimeMs: 5_000,
        blackTimeMs: 60_000,
        lastTickServerTs: NOW - 10_000, // white has been thinking 10s with 5s left
      }),
      { moveIndex: 0, parsed: uciOf('e2', 'e4'), uid: WHITE_UID, now: NOW },
    )
    expect(r.kind).toBe('flagged')
    if (r.kind !== 'flagged') return
    // The returned doc is what the wrapper commits — the game must actually
    // end here (the pre-extraction code threw inside the transaction, which
    // rolled this write back and left the room live: that was a bug).
    expect(r.updated.status).toBe('completed')
    expect(r.updated.result).toBe('black')
    expect(r.updated.endReason).toBe('timeout')
    expect(r.updated.whiteTimeMs).toBe(0)
    expect(r.updated.lastTickServerTs).toBeNull()
  })

  it('applies the increment to the mover clock on a legal timed move', () => {
    const r = applyMove(
      room({
        timeControl: { initialMs: 60_000, incrementMs: 5_000 },
        whiteTimeMs: 30_000,
        blackTimeMs: 60_000,
        lastTickServerTs: NOW - 10_000, // 10s spent → 20s left + 5s increment
      }),
      { moveIndex: 0, parsed: uciOf('e2', 'e4'), uid: WHITE_UID, now: NOW },
    )
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.updated.whiteTimeMs).toBe(25_000)
    expect(r.updated.blackTimeMs).toBe(60_000)
    expect(r.updated.lastTickServerTs).toBe(NOW) // black's clock starts
  })

  it('detects checkmate and completes the game (fool’s mate)', () => {
    const moves = history('f2f3', 'e7e5', 'g2g4')
    const r = applyMove(room({ moves }), { moveIndex: 3, parsed: uciOf('d8', 'h4'), uid: BLACK_UID, now: NOW })
    expect(r.kind).toBe('ok')
    if (r.kind !== 'ok') return
    expect(r.updated.status).toBe('completed')
    expect(r.updated.result).toBe('black')
    expect(r.updated.endReason).toBe('checkmate')
    expect(r.updated.lastTickServerTs).toBeNull()
  })

  it('rejects corrupted stored history instead of crashing', () => {
    const bad: Move[] = [{ san: '??', uci: 'e2e5', fenBefore: '', fenAfter: '', byPlayerId: WHITE_UID, clientTs: 0, serverTs: 0 }]
    const r = applyMove(room({ moves: bad }), { moveIndex: 1, parsed: uciOf('e7', 'e5'), uid: BLACK_UID, now: NOW })
    expect(r).toMatchObject({ kind: 'reject', code: 'corrupt-history' })
  })
})
