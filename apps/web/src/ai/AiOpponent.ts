// AiOpponent: a Stockfish-backed move picker for Practice mode.
//
// Distinct from engine/stockfish.ts (which is the analysis engine used in
// PostGameAnalysisScreen) — that one returns full eval + pv at deep depth.
// This one just plays moves, with a configurable skill level so the
// opponent can be made gentle enough for Ada.

import type { AiSettings } from './difficulty'

const ENGINE_URL = '/stockfish/stockfish-18-lite-single.js'
const BOOT_TIMEOUT_MS = 15000

interface PendingMove {
  resolve: (uci: string) => void
  reject: (err: Error) => void
}

export class AiOpponent {
  private worker: Worker
  private booted: Promise<void>
  private current: PendingMove | null = null
  private terminated = false

  constructor() {
    try {
      this.worker = new Worker(ENGINE_URL)
    } catch (err) {
      this.booted = Promise.reject(
        err instanceof Error
          ? new Error(`Failed to load chess engine: ${err.message}`)
          : new Error('Failed to load chess engine.'),
      )
      this.worker = { postMessage: () => {}, terminate: () => {}, addEventListener: () => {}, removeEventListener: () => {} } as unknown as Worker
      return
    }
    this.worker.addEventListener('message', this.onMessage)
    this.worker.addEventListener('error', this.onError)
    this.booted = this.boot()
  }

  ready(): Promise<void> {
    return this.booted
  }

  /** Compute a move for the side to move in `fen`, honouring `settings`. */
  async pickMove(fen: string, settings: AiSettings): Promise<string> {
    if (this.terminated) throw new Error('Engine terminated.')
    await this.booted
    if (this.current) {
      throw new Error('AiOpponent is already computing a move.')
    }
    return new Promise<string>((resolve, reject) => {
      this.current = { resolve, reject }
      try {
        this.worker.postMessage(`setoption name Skill Level value ${clampInt(settings.skillLevel, 0, 20)}`)
        this.worker.postMessage('ucinewgame')
        this.worker.postMessage(`position fen ${fen}`)
        this.worker.postMessage(`go depth ${clampInt(settings.depth, 1, 30)} movetime ${clampInt(settings.movetimeMs, 50, 10_000)}`)
      } catch (err) {
        this.current = null
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  terminate(): void {
    if (this.terminated) return
    this.terminated = true
    try {
      this.worker.removeEventListener('message', this.onMessage)
      this.worker.removeEventListener('error', this.onError)
      this.worker.postMessage('quit')
    } catch {
      // worker is going away, ignore
    }
    this.worker.terminate()
    if (this.current) {
      this.current.reject(new Error('Engine terminated.'))
      this.current = null
    }
  }

  private async boot(): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Chess engine did not start in time.')), BOOT_TIMEOUT_MS),
    )
    await Promise.race([
      (async () => {
        await this.handshake('uci', (l) => l === 'uciok')
        await this.handshake('isready', (l) => l === 'readyok')
      })(),
      timeout,
    ])
  }

  private handshake(cmd: string, done: (line: string) => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const onLine = (e: MessageEvent<string>) => {
        if (typeof e.data !== 'string') return
        if (done(e.data)) {
          this.worker.removeEventListener('message', onLine)
          resolve()
        }
      }
      this.worker.addEventListener('message', onLine)
      try {
        this.worker.postMessage(cmd)
      } catch (err) {
        this.worker.removeEventListener('message', onLine)
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    })
  }

  private onMessage = (e: MessageEvent<string>): void => {
    if (typeof e.data !== 'string') return
    if (!this.current) return
    if (e.data.startsWith('bestmove ')) {
      const tokens = e.data.split(/\s+/)
      const uci = tokens[1] ?? ''
      const pending = this.current
      this.current = null
      if (!uci || uci === '(none)') {
        pending.reject(new Error('No legal move from engine.'))
      } else {
        pending.resolve(uci)
      }
    }
  }

  private onError = (e: ErrorEvent): void => {
    if (this.current) {
      this.current.reject(new Error(e.message || 'Engine error.'))
      this.current = null
    }
  }
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)))
}
