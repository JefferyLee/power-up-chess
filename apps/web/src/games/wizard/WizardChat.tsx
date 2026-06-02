// In-duel chat panel. Sits in the right column of WizardRoomScreen.
//
// Each text message costs the sender 1 castle point — deducted server-side
// inside the same transaction that writes the message, so we can never
// charge without posting (or vice versa). The cost is surfaced inline in
// the input area so kids see the trade-off before clicking Send.

import { useEffect, useRef, useState } from 'react'
import { callPostWizardMessage } from '../../firebase/callables'
import { useWizardChatMessages, type WizardChatMessage } from './useWizardChat'
import './WizardChat.css'

const TEXT_COST = 1
const MAX_CHARS = 240

interface Props {
  roomId: string
  /** True when the viewer is one of the two players (not a spectator). */
  canPost: boolean
  /** True for bypass guests / anyone without a castlePoints balance. */
  isBypass: boolean
  /** Caller's current castle-points balance — used to disable Send when broke. */
  callerPoints: number
  /** Caller's own color, to render their bubbles on the right. */
  yourColor: 'w' | 'b' | null
  /** Notified after a successful send so the caller can update their points UI. */
  onPosted: (newPoints: number) => void
}

export function WizardChat({ roomId, canPost, isBypass, callerPoints, yourColor, onPosted }: Props) {
  const messages = useWizardChatMessages(roomId)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stuckToBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (stuckToBottomRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    stuckToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const broke = callerPoints < TEXT_COST
  const disabled = !canPost || isBypass || broke || submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (disabled) return
    const trimmed = text.trim()
    if (!trimmed) return
    if (trimmed.length > MAX_CHARS) {
      setError(`Keep it under ${MAX_CHARS} characters.`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await callPostWizardMessage({ roomId, text: trimmed })
      onPosted(res.castlePoints)
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^FirebaseError: /, '') : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const placeholder = isBypass
    ? 'Bypass guests can\'t chat in duels (no points to spend).'
    : !canPost
      ? 'Spectators can read but not chat.'
      : broke
        ? `Need ${TEXT_COST} castle point to send a message.`
        : `Type a message… (costs ${TEXT_COST} castle point)`

  return (
    <div className="puc-wdchat">
      <div className="puc-wdchat__header">
        <span className="puc-wdchat__title">Duel chat</span>
        <span className="puc-wdchat__cost">1 pt · text</span>
      </div>
      <div
        className="puc-wdchat__scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="puc-wdchat__empty">Quiet so far. (Each message costs {TEXT_COST} castle point.)</p>
        )}
        {messages.map((m) => <Bubble key={m.id} message={m} mineColor={yourColor} />)}
      </div>
      <form className="puc-wdchat__form" onSubmit={handleSubmit}>
        <input
          className="puc-wdchat__input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_CHARS}
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
        />
        <button
          type="submit"
          className="puc-wdchat__send"
          disabled={disabled || text.trim().length === 0}
        >
          Send
        </button>
      </form>
      {error && <p className="puc-wdchat__error">{error}</p>}
    </div>
  )
}

function Bubble({ message, mineColor }: { message: WizardChatMessage; mineColor: 'w' | 'b' | null }) {
  const mine = mineColor !== null && message.color === mineColor
  return (
    <div className={`puc-wdchat__bubble puc-wdchat__bubble--${message.color}${mine ? ' puc-wdchat__bubble--mine' : ''}`}>
      <span className="puc-wdchat__name">{message.displayName}</span>
      <span className="puc-wdchat__text">{message.text}</span>
    </div>
  )
}
