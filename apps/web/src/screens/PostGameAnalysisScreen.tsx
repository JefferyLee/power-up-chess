import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Board } from '../board/Board'
import { piecesFromFen } from '../chess/fen'
import { isBrilliant } from '../engine/brilliant'
import type { AnalyzedGame, AnalyzedMove } from '../engine/analyzeGame'
import { analyzeGame } from '../engine/analyzeGame'
import { StockfishEngine } from '../engine/stockfish'
import { HOSTS, type HostId } from '../hosts/hosts'
import { TemplatePicker, type TemplateKind } from '../hosts/templates'
import type { Classification } from '../engine/classify'
import type { Square } from '../chess/types'
import './PostGameAnalysisScreen.css'

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

  const selected: AnalyzedMove | null =
    selectedIdx !== null ? analysis.moves[selectedIdx] ?? null : null
  const fenToShow = selected ? selected.fenAfter : analysis.startingFen
  const pieces = piecesFromFen(fenToShow)

  const evalCp = selected ? selected.evalAfterCp : analysis.initialEvalCp

  const lastMove = selected
    ? { from: selected.uci.slice(0, 2) as Square, to: selected.uci.slice(2, 4) as Square }
    : null

  // Host comment for the selected move (template-driven in Phase 4; LLM in Phase 5).
  const hostComment = useMemo(() => {
    if (!selected) return `${host.name} is ready to review with you.`
    const isBrill = brilliantIdx.has(selected.index)
    const kind = templateKindFor(selected.classification, isBrill)
    if (kind) {
      return picker.pick(state.hostId, kind)
    }
    return ''
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.index, brilliantIdx, state.hostId])

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

      <div className="puc-review__main">
        <div className="puc-review__board-col">
          <Board
            pieces={pieces}
            turn={selected ? (selected.color === 'w' ? 'b' : 'w') : 'w'}
            legalDestinationsFrom={() => []}
            onMove={() => { /* read-only in review */ }}
            lastMove={lastMove}
            checkSquare={null}
            squareSize={SQUARE_SIZE}
          />
          <EvalBar evalCp={evalCp} />
          <div className="puc-review__host-panel">
            <p className="puc-review__host-name">{host.name} says</p>
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
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </div>
  )
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

