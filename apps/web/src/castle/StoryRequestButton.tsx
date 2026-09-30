// Sits under the host's greeting in the Hall — one click asks the
// current host to tell a story (with a comprehension question), bypassing
// the ambient timer. Per-uid rate-limited server-side (1/min + 5/day);
// the button just reflects the response.

import { useEffect, useState } from 'react'
import type { HostId } from '../hosts/hosts'
import { callHostTellStory } from '../firebase/callables'
import { useTemplateOnly } from '../hosts/templateOnly'
import './StoryRequestButton.css'

import { friendlyError } from '../errors/friendlyError'
type UiState =
  | { kind: 'idle' }
  | { kind: 'posting' }
  | { kind: 'cooldown'; retryAt: number; scope: 'minute' | 'day' }
  | { kind: 'just-posted'; expiresAt: number }
  | { kind: 'error'; text: string }

interface Props {
  hostId: HostId
  hostName: string
  /** True only when the caller is fully signed in (auth + identity). */
  enabled: boolean
}

export function StoryRequestButton({ hostId, hostName, enabled }: Props) {
  const templateOnly = useTemplateOnly()
  const [state, setState] = useState<UiState>({ kind: 'idle' })
  const [nowMs, setNowMs] = useState<number>(() => Date.now())

  // 1 Hz tick so the cooldown countdown re-renders.
  useEffect(() => {
    if (state.kind !== 'cooldown') return
    const id = window.setInterval(() => setNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [state.kind])

  // One-shot timer that flips back to idle when the cooldown / pill expires.
  useEffect(() => {
    if (state.kind !== 'cooldown' && state.kind !== 'just-posted') return
    const expiresAt = state.kind === 'cooldown' ? state.retryAt : state.expiresAt
    const remaining = Math.max(0, expiresAt - Date.now())
    const t = window.setTimeout(() => setState({ kind: 'idle' }), remaining)
    return () => window.clearTimeout(t)
  }, [state])

  // Template-only mode makes no AI story calls — hide the ask entirely.
  if (templateOnly) return null

  const handleClick = async () => {
    if (state.kind !== 'idle' || !enabled) return
    setState({ kind: 'posting' })
    try {
      const res = await callHostTellStory({ hostId })
      if (res.status === 'ok') {
        setState({ kind: 'just-posted', expiresAt: Date.now() + 6000 })
      } else if (res.status === 'rate-limited') {
        setState({
          kind: 'cooldown',
          retryAt: Date.now() + res.retryAfterMs,
          scope: res.scope,
        })
      } else {
        setState({ kind: 'error', text: 'No new stories right now.' })
      }
    } catch (err) {
      setState({
        kind: 'error',
        text: friendlyError(err, 'fetching a story'),
      })
    }
  }

  const label = renderLabel(state, hostName, nowMs)
  const disabled =
    !enabled || state.kind === 'posting' || state.kind === 'cooldown' || state.kind === 'just-posted'

  return (
    <button
      type="button"
      className={`puc-storybtn puc-storybtn--${hostId}${state.kind !== 'idle' ? ` puc-storybtn--${state.kind}` : ''}`}
      onClick={handleClick}
      disabled={disabled}
      title={!enabled ? 'Sign in to ask for a story' : `Ask ${hostName} for a story (uses 1 of your 5 daily story asks)`}
    >
      {label}
    </button>
  )
}

function renderLabel(state: UiState, hostName: string, nowMs: number): string {
  switch (state.kind) {
    case 'posting':
      return `✨ Asking ${hostName}…`
    case 'just-posted':
      return `🎙 ${hostName} is telling a story…`
    case 'cooldown': {
      const remaining = Math.max(0, state.retryAt - nowMs)
      if (state.scope === 'day') {
        const mins = Math.ceil(remaining / 60000)
        return `🌙 No more story asks today (${mins} min)`
      }
      const secs = Math.ceil(remaining / 1000)
      return `⏳ One sec — ${secs}s`
    }
    case 'error':
      return `⚠️ ${state.text}`
    case 'idle':
    default:
      return `✨ Ask ${hostName} for a story`
  }
}
