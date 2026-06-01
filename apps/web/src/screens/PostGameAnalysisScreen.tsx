import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Board } from '../board/Board'
import { piecesFromFen } from '../chess/fen'
import { isBrilliant } from '../engine/brilliant'
import type { AnalyzedGame, AnalyzedMove } from '../engine/analyzeGame'
import { analyzeGame } from '../engine/analyzeGame'
import { StockfishEngine } from '../engine/stockfish'
import { callGameRecap, callHostCommentary } from '../firebase/callables'
import { HOSTS, type HostId } from '../hosts/hosts'
import { TemplatePicker, type TemplateKind } from '../hosts/templates'
import type { Classification } from '../engine/classify'
import type { Square } from '../chess/types'
import './PostGameAnalysisScreen.css'

const COMMENTARY_TIMEOUT_MS = 3000

export interface ReviewState {
  pgn: string
  hostId: HostId
  whiteName: string
  blackName: string
}

type Phase =
  | { kind: 'analyzing'; done: number; total: number }
  | { kind: 'ready'; analysis: AnalyzedGame; brilliantIdx: Set<number> }
  | { kind: 'error'; error: string }

const SQUARE_SIZE = 56

export function PostGameAnalysisScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as ReviewState | null

  const [phase, setPhase] = useState<Phase>({ kind: 'analyzing', done: 0, total: 1 })
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!state || !state.pgn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhase({ kind: 'error', error: 'No game to review.' })
      return
    }
    const engine = new StockfishEngine()
    const ctrl = new AbortController()
    ;(async () => {
      try {
        const analysis = await analyzeGame(state.pgn, engine, {
          depth: 14,
          signal: ctrl.signal,
          onProgress: (done, total) => setPhase({ kind: 'analyzing', done, total }),
        })
        const brilliantIdx = new Set<number>()
        for (const m of analysis.moves) {
          if (m.isBrilliantCandidate && isBrilliant(m).brilliant) {
            brilliantIdx.add(m.index)
          }
        }
        setPhase({ kind: 'ready', analysis, brilliantIdx })
        setSelectedIdx(analysis.moves.length > 0 ? analysis.moves.length - 1 : null)
      } catch (e) {
        if (ctrl.signal.aborted) return
        setPhase({ kind: 'error', error: e instanceof Error ? e.message : String(e) })
      }
    })()
    return () => {
      ctrl.abort()
      engine.terminate()
    }
  }, [state])

  if (!state) {
    return (
      <FullPageMessage text="No game to review." action={{ label: 'Back to menu', onClick: () => navigate('/') }} />
    )
  }

  if (phase.kind === 'analyzing') {
    const pct = Math.round((phase.done / Math.max(phase.total, 1)) * 100)
    return (
      <div className="puc-review puc-review--centered">
        <div className="puc-review__progress">
          <h2>Reviewing your game…</h2>
          <p>The engine is checking every move. This takes about a minute.</p>
          <div className="puc-review__bar" aria-label={`${pct} percent`}>
            <div className="puc-review__bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <p className="puc-review__progress-num">{phase.done} / {phase.total}</p>
          <button type="button" className="puc-review__btn" onClick={() => navigate(-1)}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  if (phase.kind === 'error') {
    return <FullPageMessage text={phase.error} action={{ label: 'Back to menu', onClick: () => navigate('/') }} />
  }

  return (
    <ReviewView
      analysis={phase.analysis}
      brilliantIdx={phase.brilliantIdx}
      state={state}
      selectedIdx={selectedIdx}
      setSelectedIdx={setSelectedIdx}
      onBack={() => navigate(-1)}
    />
  )
}

function ReviewView({
  analysis,
  brilliantIdx,
  state,
  selectedIdx,
  setSelectedIdx,
  onBack,
}: {
  analysis: AnalyzedGame
  brilliantIdx: Set<number>
  state: ReviewState
  selectedIdx: number | null
  setSelectedIdx: (i: number) => void
  onBack: () => void
}) {
  const host = HOSTS[state.hostId]
  const picker = useMemo(() => new TemplatePicker(), [])

  // Move Replay Theater state. When set, the board temporarily shows the
  // move's "before" position with an arrow, then auto-advances to "after"
  // before clearing. selectedIdx underneath is preserved.
  const [replay, setReplay] = useState<
    { moveIndex: number; phase: 'before' | 'after' } | null
  >(null)
  useEffect(() => {
    if (!replay) return
    const next: 'before' | 'after' | null = replay.phase === 'before' ? 'after' : null
    const delay = replay.phase === 'before' ? 900 : 1100
    const id = window.setTimeout(() => {
      setReplay(next === null ? null : { moveIndex: replay.moveIndex, phase: next })
    }, delay)
    return () => window.clearTimeout(id)
  }, [replay])

  const selected: AnalyzedMove | null =
    selectedIdx !== null ? analysis.moves[selectedIdx] ?? null : null

  // What the board renders: usually the selected move's fenAfter, but the
  // replay phase can override.
  const replayMove = replay ? analysis.moves[replay.moveIndex] ?? null : null
  const fenToShow = replayMove
    ? (replay!.phase === 'before' ? replayMove.fenBefore : replayMove.fenAfter)
    : selected
      ? selected.fenAfter
      : analysis.startingFen
  const pieces = piecesFromFen(fenToShow)

  const evalCp = selected ? selected.evalAfterCp : analysis.initialEvalCp

  const lastMove = replayMove && replay!.phase === 'after'
    ? { from: replayMove.uci.slice(0, 2) as Square, to: replayMove.uci.slice(2, 4) as Square }
    : selected
      ? { from: selected.uci.slice(0, 2) as Square, to: selected.uci.slice(2, 4) as Square }
      : null

  const replayArrows = replayMove && replay!.phase === 'before'
    ? [{
        from: replayMove.uci.slice(0, 2) as Square,
        to: replayMove.uci.slice(2, 4) as Square,
      }]
    : undefined

  // Template fallback for any move's host comment.
  const templateFor = useMemo(() => {
    return (m: AnalyzedMove): string => {
      const isBrill = brilliantIdx.has(m.index)
      const kind = templateKindFor(m.classification, isBrill)
      if (!kind) return ''
      return picker.pick(state.hostId, kind)
    }
  }, [brilliantIdx, picker, state.hostId])

  // LLM commentary cache, keyed by move index. Each entry is the resolved
  // string (LLM or template fallback) plus the source so we can show subtle
  // dev-time provenance.
  const [commentaryByIdx, setCommentaryByIdx] = useState<
    Map<number, { text: string; source: 'llm' | 'cache' | 'template' }>
  >(new Map())

  // Fetch LLM commentary for the selected move (notable moves only), with a
  // 3s timeout. On timeout / error, fall back to a template line so the panel
  // never sits empty.
  useEffect(() => {
    if (!selected) return
    if (commentaryByIdx.has(selected.index)) return
    const isBrill = brilliantIdx.has(selected.index)
    const notable =
      isBrill ||
      selected.classification === 'mistake' ||
      selected.classification === 'blunder'
    if (!notable) return

    let cancelled = false
    const fillFallback = () => {
      if (cancelled) return
      setCommentaryByIdx((prev) => {
        if (prev.has(selected.index)) return prev
        const next = new Map(prev)
        next.set(selected.index, { text: templateFor(selected), source: 'template' })
        return next
      })
    }

    const timer = setTimeout(fillFallback, COMMENTARY_TIMEOUT_MS)

    callHostCommentary({
      host: state.hostId,
      classification: isBrill ? 'brilliant' : selected.classification,
      fenBefore: selected.fenBefore,
      fenAfter: selected.fenAfter,
      moveSan: selected.san,
      moveUci: selected.uci,
      evalBeforeCp: selected.evalBeforeCp,
      evalAfterCp: selected.evalAfterCp,
      bestMoveSan: selected.bestMoveSan,
      playerName: selected.color === 'w' ? state.whiteName : state.blackName,
      isAdaSpecialMode: isAdaName(selected.color === 'w' ? state.whiteName : state.blackName),
    })
      .then((res) => {
        if (cancelled) return
        clearTimeout(timer)
        setCommentaryByIdx((prev) => {
          // If the timeout already filled a template, replace it with the LLM
          // result — the LLM line is what we wanted in the first place.
          const next = new Map(prev)
          next.set(selected.index, { text: res.text, source: res.source })
          return next
        })
      })
      .catch(() => {
        clearTimeout(timer)
        fillFallback()
      })

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [selected, brilliantIdx, state.hostId, state.whiteName, state.blackName, templateFor, commentaryByIdx])

  // Resolve the displayed comment for the currently-selected move.
  const hostComment = useMemo(() => {
    if (!selected) return `${host.name} is ready to review with you.`
    const cached = commentaryByIdx.get(selected.index)
    if (cached) return cached.text
    // Not in cache and not yet fetched/scheduled (i.e. not a notable move):
    // fall back to the template line synchronously.
    return templateFor(selected)
  }, [selected, commentaryByIdx, host.name, templateFor])

  const commentSource = selected ? commentaryByIdx.get(selected.index)?.source : undefined

  // Story Review — fired once when analysis is ready.
  const [recap, setRecap] = useState<
    { status: 'loading' } | { status: 'ready'; text: string; source: 'llm' | 'cache' } | { status: 'error' } | null
  >(null)

  useEffect(() => {
    if (recap) return
    if (analysis.moves.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRecap({ status: 'ready', text: `${host.name} has nothing to recap — no moves were played.`, source: 'cache' })
      return
    }
    setRecap({ status: 'loading' })

    const summary = countClassifications(analysis, brilliantIdx)
    const result: 'white' | 'black' | 'draw' = deriveResult(analysis)
    const myName = state.whiteName // The local player drives the recap — we use the white name as the audience.
    callGameRecap({
      host: state.hostId,
      pgn: state.pgn,
      summary,
      result,
      whiteName: state.whiteName,
      blackName: state.blackName,
      playerName: myName,
      isAdaSpecialMode: isAdaName(myName),
    })
      .then((res) => setRecap({ status: 'ready', text: res.text, source: res.source }))
      .catch(() => setRecap({ status: 'error' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="puc-review">
      <header className="puc-review__header">
        <button type="button" className="puc-review__back" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div>
          <h1 className="puc-review__title">Game Review</h1>
          <p className="puc-review__sub">{state.whiteName} vs {state.blackName} — with {host.name}</p>
        </div>
      </header>

      <section className="puc-review__recap" aria-labelledby="puc-recap-heading">
        <h2 id="puc-recap-heading" className="puc-review__recap-title">{host.name}'s story</h2>
        {recap?.status === 'loading' && (
          <p className="puc-review__recap-loading">{host.name} is writing your story…</p>
        )}
        {recap?.status === 'ready' && (
          <p className="puc-review__recap-text">{recap.text}</p>
        )}
        {recap?.status === 'error' && (
          <p className="puc-review__recap-loading">
            {host.name} couldn't write a recap this time. The move-by-move review is still below.
          </p>
        )}
      </section>

      <div className="puc-review__main">
        <div className="puc-review__board-col">
          <Board
            pieces={pieces}
            turn={selected ? (selected.color === 'w' ? 'b' : 'w') : 'w'}
            legalDestinationsFrom={() => []}
            onMove={() => { /* read-only in review */ }}
            lastMove={lastMove}
            checkSquare={null}
            arrows={replayArrows}
            squareSize={SQUARE_SIZE}
          />
          <EvalBar evalCp={evalCp} />
          <div className="puc-review__host-panel">
            <p className="puc-review__host-name">
              {host.name} says
              {commentSource === 'template' && <span className="puc-review__source-pill"> · quick</span>}
            </p>
            <p className="puc-review__host-text">{hostComment}</p>
            {selected && (
              <p className="puc-review__detail">
                Engine eval: {formatEval(selected.evalAfterCp)}
                {selected.bestMoveSan && selected.classification !== 'best' && (
                  <> · Best move was <b>{selected.bestMoveSan}</b></>
                )}
                {selected.cpLoss > 0 && <> · CP loss {selected.cpLoss}</>}
              </p>
            )}
          </div>
        </div>

        <div className="puc-review__moves-col">
          <h2 className="puc-review__moves-title">Moves</h2>
          <ol className="puc-review__moves">
            {analysis.moves.map((m) => {
              const isBrill = brilliantIdx.has(m.index)
              const replayWorthy = isReplayWorthy(m, analysis.moves)
              return (
                <li
                  key={m.index}
                  className={`puc-review__move ${selectedIdx === m.index ? 'puc-review__move--selected' : ''}`}
                >
                  <button type="button" onClick={() => setSelectedIdx(m.index)} className="puc-review__move-btn">
                    <span className="puc-review__move-n">{Math.floor(m.index / 2) + 1}{m.color === 'w' ? '.' : '…'}</span>
                    <span className="puc-review__move-san">{m.san}</span>
                    <ClassificationBadge classification={m.classification} brilliant={isBrill} />
                  </button>
                  {replayWorthy && (
                    <button
                      type="button"
                      className="puc-review__replay-btn"
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedIdx(m.index)
                        setReplay({ moveIndex: m.index, phase: 'before' })
                      }}
                      aria-label={`Replay move ${m.san}`}
                      title="Replay this move"
                    >
                      ▶
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
}

/** Pick the moves the Replay Theater should offer a ▶ button for:
 *  every capture (san contains 'x'), every check / mate, and the last three
 *  plies of any game that ended in checkmate. */
function isReplayWorthy(move: AnalyzedMove, moves: ReadonlyArray<AnalyzedMove>): boolean {
  if (move.san.includes('x')) return true
  if (move.san.endsWith('#')) return true
  const last = moves[moves.length - 1]
  if (last?.san.endsWith('#') && move.index >= moves.length - 3) return true
  return false
}

function templateKindFor(c: Classification, brilliant: boolean): TemplateKind | null {
  if (brilliant) return 'brilliant'
  if (c === 'blunder') return 'blunder'
  if (c === 'mistake' || c === 'inaccuracy') return 'mistake'
  return 'ordinary'
}

function EvalBar({ evalCp }: { evalCp: number }) {
  // Normalize cp to [-1, 1] via tanh-ish curve. ±400 cp ≈ ±0.76.
  const normalised = Math.tanh(evalCp / 400)
  // Map -1..+1 to 0..100 (white share of the bar).
  const whitePct = Math.round((normalised + 1) * 50)
  return (
    <div className="puc-eval-bar" aria-label={`Evaluation ${formatEval(evalCp)}`}>
      <div className="puc-eval-bar__white" style={{ width: `${whitePct}%` }} />
      <span className="puc-eval-bar__label">{formatEval(evalCp)}</span>
    </div>
  )
}

function formatEval(cp: number): string {
  const MATE = 100000
  if (Math.abs(cp) >= MATE - 200) {
    const mate = MATE - Math.abs(cp)
    return `${cp >= 0 ? '+' : '-'}M${mate}`
  }
  const pawns = cp / 100
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`
}

function ClassificationBadge({
  classification,
  brilliant,
}: {
  classification: Classification
  brilliant: boolean
}) {
  if (brilliant) {
    return <span className="puc-badge puc-badge--brilliant">Brilliant</span>
  }
  if (classification === 'best') return <span className="puc-badge puc-badge--best">Best</span>
  if (classification === 'excellent') return <span className="puc-badge puc-badge--excellent">Excellent</span>
  if (classification === 'good') return null // no badge for ordinary good moves
  if (classification === 'inaccuracy') return <span className="puc-badge puc-badge--inaccuracy">?!</span>
  if (classification === 'mistake') return <span className="puc-badge puc-badge--mistake">?</span>
  if (classification === 'blunder') return <span className="puc-badge puc-badge--blunder">??</span>
  return null
}

function FullPageMessage({
  text,
  action,
}: {
  text: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="puc-review puc-review--centered">
      <p className="puc-review__msg">{text}</p>
      {action && (
        <button type="button" className="puc-review__btn" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}

function isAdaName(name: string): boolean {
  return name.trim().toLowerCase() === 'ada'
}

function countClassifications(
  analysis: AnalyzedGame,
  brilliantIdx: Set<number>,
): {
  best?: number
  excellent?: number
  good?: number
  inaccuracy?: number
  mistake?: number
  blunder?: number
  brilliant?: number
} {
  const counts: Record<string, number> = {}
  for (const m of analysis.moves) {
    if (brilliantIdx.has(m.index)) counts.brilliant = (counts.brilliant ?? 0) + 1
    counts[m.classification] = (counts[m.classification] ?? 0) + 1
  }
  return counts
}

function deriveResult(analysis: AnalyzedGame): 'white' | 'black' | 'draw' {
  // Pick the final position's eval as a coarse proxy when the PGN doesn't
  // include a result header. Mate-end games will have a large magnitude eval;
  // otherwise call it a draw.
  const last = analysis.moves[analysis.moves.length - 1]
  if (!last) return 'draw'
  if (last.evalAfterCp > 5000) return 'white'
  if (last.evalAfterCp < -5000) return 'black'
  return 'draw'
}

