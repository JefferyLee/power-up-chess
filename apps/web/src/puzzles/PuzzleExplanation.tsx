// Host-voiced "why that move works", shown after a kid solves a puzzle.
//
// Content priority: (1) the puzzle's authored explanation (your gate-approved
// text) if present; (2) an on-demand host explanation from explainPuzzle;
// (3) a motif template — used on timeout, error, template-only mode, or when
// the solution can't be read. Always resolves to *something* warm.

import { useEffect, useState } from 'react'
import { Chess } from 'chess.js'
import { HOSTS, type HostId } from '../hosts/hosts'
import { HostPortrait } from '../castle/HostPortrait'
import { callExplainPuzzle } from '../firebase/callables'
import { isTemplateOnly } from '../hosts/templateOnly'
import { motifExplanation } from './motifExplain'
import './PuzzleExplanation.css'

const TIMEOUT_MS = 3000

/** Narrow shape satisfied by both ServerPuzzle and the client Puzzle type. */
interface ExplainablePuzzle {
  id: string
  fen: string
  /** Solution as UCI moves (e.g. "e2e4"). */
  solution: string[]
  motifs: string[]
  explanation?: string
}

/** Convert the solution's UCI moves to SAN for a readable explanation. */
function solutionSan(fen: string, uciMoves: string[]): string[] {
  try {
    const c = new Chess(fen)
    const out: string[] = []
    for (const uci of uciMoves.slice(0, 6)) {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined })
      if (!m) break
      out.push(m.san)
    }
    return out
  } catch {
    return []
  }
}

export function PuzzleExplanation({ puzzle, hostId }: { puzzle: ExplainablePuzzle; hostId: HostId }) {
  const authored = puzzle.explanation?.trim() ?? ''
  const [text, setText] = useState<string>(authored)

  useEffect(() => {
    if (authored) { setText(authored); return }
    const fallback = motifExplanation(puzzle.motifs)
    const san = solutionSan(puzzle.fen, puzzle.solution)
    // Nothing to explain, or template-only mode → skip the LLM entirely.
    if (san.length === 0 || isTemplateOnly()) { setText(fallback); return }

    let done = false
    setText('') // brief "thinking" state until the line arrives
    const finish = (t: string) => { if (!done) { done = true; setText(t || fallback) } }
    const timer = window.setTimeout(() => finish(fallback), TIMEOUT_MS)
    callExplainPuzzle({ host: hostId, fen: puzzle.fen, solutionSan: san, motifs: puzzle.motifs })
      .then((res) => { window.clearTimeout(timer); finish(res.text) })
      .catch(() => { window.clearTimeout(timer); finish(fallback) })
    return () => { done = true; window.clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [puzzle.id, hostId])

  const host = HOSTS[hostId]
  return (
    <div className="puc-pexplain">
      <div className="puc-pexplain__fig"><HostPortrait hostId={hostId} variant="chip" mood="cheering" /></div>
      <div className="puc-pexplain__body">
        <span className="puc-pexplain__name">{host.name}</span>
        <p className={'puc-pexplain__text' + (text ? '' : ' puc-pexplain__text--wait')}>
          {text || `${host.name} is thinking…`}
        </p>
      </div>
    </div>
  )
}
