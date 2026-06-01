import { describe, expect, it } from 'vitest'
import { ChessGame } from './game'

describe('ChessGame', () => {
  describe('starting position', () => {
    it('white to move, no check', () => {
      const g = new ChessGame()
      const s = g.status()
      expect(s.kind).toBe('in_progress')
      if (s.kind === 'in_progress') {
        expect(s.turn).toBe('w')
        expect(s.inCheck).toBe(false)
      }
    })

    it('e2 has 2 legal destinations (e3, e4)', () => {
      const g = new ChessGame()
      expect(new Set(g.legalDestinationsFrom('e2'))).toEqual(new Set(['e3', 'e4']))
    })

    it('20 total legal moves', () => {
      const g = new ChessGame()
      expect(g.allLegalMoves()).toHaveLength(20)
    })
  })

  describe('legal moves', () => {
    it('e2-e4 succeeds and produces a SAN of "e4"', () => {
      const g = new ChessGame()
      const m = g.move({ from: 'e2', to: 'e4' })
      expect(m).not.toBeNull()
      expect(m!.san).toBe('e4')
      expect(m!.uci).toBe('e2e4')
      expect(g.turn()).toBe('b')
    })

    it('history records the move', () => {
      const g = new ChessGame()
      g.move({ from: 'e2', to: 'e4' })
      expect(g.history()).toHaveLength(1)
      expect(g.history()[0]?.san).toBe('e4')
    })

    it('undo reverses the last move', () => {
      const g = new ChessGame()
      g.move({ from: 'e2', to: 'e4' })
      g.undo()
      expect(g.turn()).toBe('w')
      expect(g.history()).toHaveLength(0)
      expect(new Set(g.legalDestinationsFrom('e2'))).toEqual(new Set(['e3', 'e4']))
    })
  })

  describe('illegal moves', () => {
    it('queen jump from start returns null', () => {
      const g = new ChessGame()
      expect(g.move({ from: 'd1', to: 'd8' })).toBeNull()
      expect(g.history()).toHaveLength(0)
    })

    it('moving a non-existent piece returns null', () => {
      const g = new ChessGame()
      expect(g.move({ from: 'e4', to: 'e5' })).toBeNull()
    })

    it('moving when it is not your turn returns null', () => {
      const g = new ChessGame()
      g.move({ from: 'e2', to: 'e4' })
      // white tries to move again
      expect(g.move({ from: 'd2', to: 'd4' })).toBeNull()
    })
  })

  describe('terminal states', () => {
    it('detects Fool\'s Mate as checkmate with black winning', () => {
      const g = new ChessGame()
      g.move({ from: 'f2', to: 'f3' })
      g.move({ from: 'e7', to: 'e5' })
      g.move({ from: 'g2', to: 'g4' })
      g.move({ from: 'd8', to: 'h4' })
      const s = g.status()
      expect(s.kind).toBe('checkmate')
      if (s.kind === 'checkmate') {
        expect(s.winner).toBe('b')
      }
    })

    it('detects stalemate from a known stalemate FEN', () => {
      // Classic stalemate: black king on a8, white queen on b6, white king on c7.
      // It is black to move; black has no legal moves and is not in check.
      const fen = 'k7/8/1QK5/8/8/8/8/8 b - - 0 1'
      const g = new ChessGame(fen)
      expect(g.status().kind).toBe('stalemate')
    })

    it('detects insufficient material (KvK)', () => {
      const fen = '8/8/8/4k3/8/8/8/4K3 w - - 0 1'
      const g = new ChessGame(fen)
      const s = g.status()
      expect(s.kind).toBe('draw')
      if (s.kind === 'draw') {
        expect(s.reason).toBe('insufficient_material')
      }
    })
  })

  describe('captures', () => {
    it('records captured piece type', () => {
      const g = new ChessGame()
      // 1. e4 d5 2. exd5
      g.move({ from: 'e2', to: 'e4' })
      g.move({ from: 'd7', to: 'd5' })
      const capture = g.move({ from: 'e4', to: 'd5' })
      expect(capture).not.toBeNull()
      expect(capture!.captured).toBe('p')
    })
  })

  describe('fenBefore / fenAfter', () => {
    it('records FEN bracketing the move', () => {
      const g = new ChessGame()
      const m = g.move({ from: 'e2', to: 'e4' })
      const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
      expect(m!.fenBefore).toBe(STARTING_FEN)
      expect(m!.fenAfter).not.toBe(STARTING_FEN)
      expect(m!.fenAfter).toBe(g.fen())
      // The pawn left e2 and now sits on e4.
      expect(m!.fenAfter).toContain('4P3') // rank 4 has a pawn on the e file
    })
  })
})
