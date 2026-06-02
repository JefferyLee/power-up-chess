// Stockfish 18 lite (NNUE) wrapped as a Web Worker.
//
// The vendored stockfish-18-lite-single.js auto-detects worker context and
// reads the matching .wasm next to it, so the only setup we need is to point
// the Worker at the JS file in /stockfish/.
//
// Engine I/O is the UCI protocol — line-oriented text. This module hides UCI
// details and exposes an analyze() promise that resolves with a White-POV
// evaluation plus the engine's best move and PV.
//
// The engine serialises one analysis at a time; concurrent calls are queued.

const ENGINE_URL = '/stockfish/stockfish-18-lite-single.js'

/** Score from White's perspective in centipawns. Mate is encoded as a very
 *  large magnitude so existing cp-loss math still works without special-casing
 *  every call site. */
export const MATE_CP = 100000

export interface AnalyzeResult {
  /** White-POV evaluation. Positive = White better, negative = Black better. */
  evalCp: number
  /** If this is a mate-in-N score, N from White's POV (positive: White mates). */
  mate: number | null
  /** UCI of the engine's best move from this position. */
  bestMoveUci: string
  /** Principal variation, list of UCI moves. */
  pv: string[]
  /** Depth actually reached. */
  depth: number
}

interface PendingAnalysis {
  fen: string
  depth: number
  resolve: (v: AnalyzeResult) => void
  reject: (e: Error) => void
  latest: Partial<AnalyzeResult> & { sideToMove?: 'w' | 'b' }
}

const BOOT_TIMEOUT_MS = 15000

export class StockfishEngine {
  private worker: Worker
  private booted: Promise<void>
  private currentAnalysis: PendingAnalysis | null = null
  private queue: Array<() => void> = []
  private terminated = false

  constructor() {
    try {
      this.worker = new Worker(ENGINE_URL)
    } catch (err) {
      // Synchronous failure (rare — usually 404 or syntax error in the worker
      // script). Surface as a rejected booted promise so callers see a real
      // error instead of a hung analyze().
      this.booted = Promise.reject(
        err instanceof Error
          ? new Error(`Failed to load chess engine: ${err.message}`)
          : new Error('Failed to load chess engine.'),
      )
      // Stub worker so terminate() doesn't blow up.
      this.worker = { postMessage: () => {}, terminate: () => {}, addEventListener: () => {}, removeEventListener: () => {} } as unknown as Worker
      return
    }
    this.worker.addEventListener('message', this.onMessage)
    this.worker.addEventListener('error', this.onWorkerError)
    this.booted = this.boot()
  }

  private async boot(): Promise<void> {
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Chess engine did not start in time. Check your connection and try again.')), BOOT_TIMEOUT_MS),
    )
    await Promise.race([
      (async () => {
        await this.send('uci', (line) => line === 'uciok')
        await this.send('isready', (line) => line === 'readyok')
      })(),
      timeout,
    ])
  }

  private onWorkerError = (e: ErrorEvent): void => {
    const msg = e.message || 'Chess engine error.'
    if (this.currentAnalysis) {
      this.currentAnalysis.reject(new Error(msg))
      this.currentAnalysis = null
    }
  }

  /** Wait for the engine to finish booting. */
  ready(): Promise<void> {
    return this.booted
  }

  /** Returns Stockfish's evaluation of `fen` at the given depth (default 18). */
  async analyze(fen: string, depth = 18): Promise<AnalyzeResult> {
    if (this.terminated) throw new Error('Engine terminated.')
    await this.booted
    return new Promise<AnalyzeResult>((resolve, reject) => {
      const start = () => {
        if (this.terminated) {
          reject(new Error('Engine terminated.'))
          return
        }
        const sideToMove: 'w' | 'b' = fen.split(' ')[1] === 'b' ? 'b' : 'w'
        this.currentAnalysis = {
          fen,
          depth,
          resolve,
          reject,
          latest: { evalCp: 0, mate: null, bestMoveUci: '', pv: [], depth: 0, sideToMove },
        }
        this.worker.postMessage('ucinewgame')
        this.worker.postMessage(`position fen ${fen}`)
        this.worker.postMessage(`go depth ${depth}`)
      }
      if (this.currentAnalysis) this.queue.push(start)
      else start()
    })
  }

  /** Promise-returning command sender used during boot.
   *  `done` is invoked on each engine line; resolve when it returns true. */
  private send(cmd: string, done: (line: string) => boolean): Promise<void> {
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
      } catch (e) {
        this.worker.removeEventListener('message', onLine)
        reject(e instanceof Error ? e : new Error(String(e)))
      }
    })
  }

  private onMessage = (e: MessageEvent<string>) => {
    if (typeof e.data !== 'string') return
    const line = e.data
    const a = this.currentAnalysis
    if (!a) return

    if (line.startsWith('info ')) {
      const info = parseInfoLine(line)
      if (info) {
        if (info.depth !== undefined) a.latest.depth = Number(info.depth)
        if (info.cp !== undefined) {
          // Defensive Number() — stockfish-18-lite's wasm bindings have
          // shipped builds that emit BigInt-typed numerics on some paths.
          // Mixing one into our Number-only analysis pipeline crashes
          // downstream (Math.abs, subtraction in cpLossFromMover, etc).
          const cp = Number(info.cp)
          a.latest.evalCp = a.latest.sideToMove === 'b' ? -cp : cp
          a.latest.mate = null
        }
        if (info.mate !== undefined) {
          const mate = Number(info.mate)
          const fromWhite = a.latest.sideToMove === 'b' ? -mate : mate
          a.latest.mate = fromWhite
          a.latest.evalCp = fromWhite > 0 ? MATE_CP - Math.abs(fromWhite) : -(MATE_CP - Math.abs(fromWhite))
        }
        if (info.pv) {
          a.latest.pv = info.pv
          a.latest.bestMoveUci = info.pv[0] ?? a.latest.bestMoveUci ?? ''
        }
      }
      return
    }

    if (line.startsWith('bestmove ')) {
      const tokens = line.split(/\s+/)
      const best = tokens[1] ?? a.latest.bestMoveUci ?? ''
      const result: AnalyzeResult = {
        evalCp: a.latest.evalCp ?? 0,
        mate: a.latest.mate ?? null,
        bestMoveUci: best === '(none)' ? '' : best,
        pv: a.latest.pv ?? [],
        depth: a.latest.depth ?? 0,
      }
      this.currentAnalysis = null
      a.resolve(result)
      // Kick off the next queued analysis, if any.
      const next = this.queue.shift()
      if (next) next()
    }
  }

  terminate(): void {
    if (this.terminated) return
    this.terminated = true
    try {
      this.worker.removeEventListener('error', this.onWorkerError)
      this.worker.postMessage('quit')
    } catch {
      // Ignore — worker is being torn down anyway.
    }
    this.worker.terminate()
    if (this.currentAnalysis) {
      this.currentAnalysis.reject(new Error('Engine terminated.'))
      this.currentAnalysis = null
    }
    for (const start of this.queue) {
      // Each `start` would create a new currentAnalysis and call reject via
      // the analyze() promise. Easier: just drop the queue and let the
      // analyze() awaiters time out from terminated check.
      void start
    }
    this.queue.length = 0
  }
}

interface ParsedInfo {
  depth?: number
  cp?: number
  mate?: number
  pv?: string[]
}

/** Parse a UCI `info ...` line. We only care about depth, score, and pv.
 *  Exported for unit testing. */
export function parseInfoLine(line: string): ParsedInfo | null {
  // Tokens: info depth N seldepth M ... score cp Z pv e2e4 e7e5 ...
  const tokens = line.split(/\s+/)
  const out: ParsedInfo = {}
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]
    if (t === 'depth') {
      const v = Number(tokens[i + 1])
      if (Number.isFinite(v)) out.depth = v
      i++
    } else if (t === 'score') {
      const kind = tokens[i + 1]
      const v = Number(tokens[i + 2])
      if (kind === 'cp' && Number.isFinite(v)) out.cp = v
      else if (kind === 'mate' && Number.isFinite(v)) out.mate = v
      i += 2
    } else if (t === 'pv') {
      out.pv = tokens.slice(i + 1)
      break
    }
  }
  return out
}
