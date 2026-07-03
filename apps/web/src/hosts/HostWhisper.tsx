// In-game host presence (Phase 2.6) — template-only, zero LLM cost.
// A short host line appears for notable NON-capture moments (check,
// castling, promotion); captures already have their own spark. Throttled
// so the host chimes in occasionally, never every move.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { HOSTS, type HostId } from './hosts'
import { TemplatePicker } from './templates'
import './HostWhisper.css'

const THROTTLE_MS = 20_000
const SHOW_MS = 6_000

export interface WhisperEvent {
  san: string
  captured: boolean
  promotion: boolean
  givesCheck: boolean
}

export function useHostWhisper(hostId: HostId) {
  const picker = useMemo(() => new TemplatePicker(), [])
  const [line, setLine] = useState<string | null>(null)
  const lastAt = useRef(0)
  const timer = useRef<number | null>(null)

  const observe = useCallback((ev: WhisperEvent) => {
    if (ev.captured) return // captures already spark + speak
    const kind = ev.promotion ? 'promote' : ev.san.startsWith('O-O') ? 'castle' : ev.givesCheck ? 'check' : null
    if (!kind) return
    const now = Date.now()
    if (now - lastAt.current < THROTTLE_MS) return
    lastAt.current = now
    setLine(picker.pick(hostId, kind))
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setLine(null), SHOW_MS)
  }, [hostId, picker])

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  return { line, observe }
}

export function HostWhisper({ hostId, line }: { hostId: HostId; line: string | null }) {
  if (!line) return null
  return (
    <div className="puc-whisper" role="status">
      <span className="puc-whisper__name">{HOSTS[hostId].name}:</span> {line}
    </div>
  )
}
