// useCaptureCeremony — everything that happens on the board when a
// move lands: the move / capture / check sound, the Capture Spark card
// and Tactic Bloom on the square, and the full-screen Power Up
// ceremony. Local, AI and Online all feed it applied moves; Online
// feeds a whole batch at once when the room snapshot catches up.

import { useCallback, useState, type ReactNode } from 'react'
import type { Color, MoveRecord, Square } from '../chess/types'
import type { HostId } from '../hosts/hosts'
import type { TemplatePicker } from '../hosts/templates'
import { CaptureSpark, type CaptureSparkData } from '../powerups/CaptureSpark'
import { DUEL_CEREMONY_DELAY_MS, PowerUpCeremony, type PowerUpData } from '../powerups/PowerUpCeremony'
import { pickPowerUpVariant } from '../powerups/powerUpVariant'
import { TacticBloom, type TacticBloomData } from '../powerups/TacticBloom'
import { PIECE_VALUE } from '../powerups/pieceValues'
import { useSound } from '../sound/useSound'

export interface AppliedMove {
  result: MoveRecord
  /** The mover was in check before this move. */
  wasInCheck: boolean
  /** This move gives check. */
  givesCheck: boolean
  /** Captures so far this game, this one included. In Both mode the
   *  two hosts take turns speaking the capture line. */
  capturesSoFar?: number
}

interface Options {
  hostId: HostId
  coHostId?: HostId
  picker: TemplatePicker
  view3d: boolean
  squareSize: number
  orientation?: Color
}

export interface CaptureCeremony {
  /** Render inside the board stage. */
  overlays: ReactNode
  onMoveApplied: (move: AppliedMove) => void
  onMovesApplied: (moves: AppliedMove[]) => void
  /** New game: drop anything still animating. */
  reset: () => void
}

let seq = 0
const nextId = () => ++seq

export function useCaptureCeremony({
  hostId, coHostId, picker, view3d, squareSize, orientation = 'w',
}: Options): CaptureCeremony {
  const sound = useSound()
  const [sparks, setSparks] = useState<CaptureSparkData[]>([])
  const [blooms, setBlooms] = useState<TacticBloomData[]>([])
  const [powerUps, setPowerUps] = useState<PowerUpData[]>([])

  const onMovesApplied = useCallback((moves: AppliedMove[]) => {
    const newSparks: CaptureSparkData[] = []
    const newBlooms: TacticBloomData[] = []
    const newPowerUps: PowerUpData[] = []
    let sawCapture = false
    let sawQuiet = false
    let sawCheck = false
    for (const { result, wasInCheck, givesCheck, capturesSoFar } of moves) {
      if (givesCheck) sawCheck = true
      if (!result.captured) {
        sawQuiet = true
        continue
      }
      sawCapture = true
      // En passant: the captured pawn sits on the destination file +
      // source rank, not on the move's destination square.
      const captureSquare: Square = result.flags.includes('e')
        ? (`${result.to[0]}${result.from[1]}` as Square)
        : result.to
      const speaker = coHostId && (capturesSoFar ?? 0) % 2 === 1 ? coHostId : hostId
      newSparks.push({
        id: nextId(),
        square: captureSquare,
        capturedPiece: result.captured,
        capturedColor: result.color === 'w' ? 'b' : 'w',
        text: picker.pick(speaker, 'capture', { capturedPiece: result.captured }),
      })
      // Power Up ceremony — random variant per capture.
      newPowerUps.push({ id: nextId(), variant: pickPowerUpVariant() })
      // Tactic Bloom: forcing capture of a piece worth ≥3 — either
      // delivers check or was made in response to one.
      if (PIECE_VALUE[result.captured] >= 3 && (wasInCheck || givesCheck)) {
        newBlooms.push({ id: nextId(), square: captureSquare })
      }
    }
    // One cue per batch. A check ringing under a capture sounds right.
    if (sawCapture) sound.play('capture')
    else if (sawQuiet) sound.play('move')
    if (sawCheck) sound.play('check')
    if (newSparks.length) setSparks((prev) => [...prev, ...newSparks])
    if (newBlooms.length) setBlooms((prev) => [...prev, ...newBlooms])
    if (newPowerUps.length) setPowerUps((prev) => [...prev, ...newPowerUps])
  }, [hostId, coHostId, picker, sound])

  const onMoveApplied = useCallback((move: AppliedMove) => onMovesApplied([move]), [onMovesApplied])

  const reset = useCallback(() => {
    setSparks([])
    setBlooms([])
    setPowerUps([])
  }, [])

  const onSparkDone = useCallback((id: number) => {
    setSparks((prev) => prev.filter((s) => s.id !== id))
  }, [])
  const onBloomDone = useCallback((id: number) => {
    setBlooms((prev) => prev.filter((b) => b.id !== id))
  }, [])
  const onPowerUpDone = useCallback((id: number) => {
    setPowerUps((prev) => prev.filter((p) => p.id !== id))
  }, [])

  // Square-anchored overlays are positioned in 2D pixel space — skip
  // them in 3D view. The full-screen Power Up ceremony plays in both,
  // but on the 3D board it waits for the capture duel's pop.
  const overlays = (
    <>
      {!view3d && sparks.map((s) => (
        <CaptureSpark key={s.id} data={s} squareSize={squareSize} orientation={orientation} onDone={onSparkDone} />
      ))}
      {!view3d && blooms.map((b) => (
        <TacticBloom key={b.id} data={b} squareSize={squareSize} orientation={orientation} onDone={onBloomDone} />
      ))}
      {powerUps.map((p) => (
        <PowerUpCeremony key={p.id} data={p} delayMs={view3d ? DUEL_CEREMONY_DELAY_MS : 0} onDone={onPowerUpDone} />
      ))}
    </>
  )

  return { overlays, onMoveApplied, onMovesApplied, reset }
}
