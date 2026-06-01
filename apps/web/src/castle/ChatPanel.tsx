// ChatPanel — the shared Hall chat. Subscribes to lobby/messages via
// onSnapshot, renders bubbles, posts via callPostChat.

import { useEffect, useRef, useState } from 'react'
import { callPostChat } from '../firebase/callables'
import { useLobbyMessages, type ChatMessage } from './useLobbyChat'
import './ChatPanel.css'

export function ChatPanel({ canChat }: { canChat: boolean }) {
  const messages = useLobbyMessages()
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Track whether user is at the bottom; if not, don't auto-scroll
  // (so reading old messages isn't yanked back).
  const stuckToBottomRef = useRef(true)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (stuckToBottomRef.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages])

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    stuckToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canChat || submitting) return
    const trimmed = text.trim()
    if (!trimmed) return
    if (trimmed.length > 200) {
      setError('Message too long — keep it under 200 characters.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await callPostChat({ text: trimmed })
      if (res.status === 'rate-limited') {
        const seconds = Math.max(1, Math.ceil(res.retryAfterMs / 1000))
        setError(`Slow down — try again in ${seconds}s.`)
      } else if (res.status === 'too-long') {
        setError('Message too long.')
      } else if (res.status === 'empty') {
        setError('Type something first.')
      } else {
        setText('')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="puc-chat">
      <div
        className="puc-chat__scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="puc-chat__empty">The Hall is quiet right now — say hi!</p>
        )}
        {messages.map((m) => <Bubble key={m.id} message={m} />)}
      </div>
      <form className="puc-chat__form" onSubmit={handleSubmit}>
        <input
          className="puc-chat__input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          autoComplete="off"
          placeholder={canChat ? 'Type a message… (use @Lucy or @Luca to call the host)' : 'Loading chat…'}
          disabled={!canChat || submitting}
        />
        <button
          type="submit"
          className="puc-chat__send"
          disabled={!canChat || submitting || text.trim().length === 0}
        >
          Send
        </button>
      </form>
      {error && <p className="puc-chat__error">{error}</p>}
    </div>
  )
}

function Bubble({ message }: { message: ChatMessage }) {
  const isHost = message.kind === 'host'
  const isSystem = message.kind === 'system'
  // Host stories are usually 2-5 sentences — split them into short
  // paragraphs so a 4-sentence anecdote doesn't render as one wall of text.
  const paragraphs = isHost ? splitForReading(message.text) : null
  return (
    <div className={`puc-chat__bubble puc-chat__bubble--${message.kind}`}>
      <span className="puc-chat__name">
        {message.isBypass ? '👻 ' : ''}
        {message.name}
        {isHost ? ' · host' : ''}
        {isSystem ? ' · system' : ''}
      </span>
      {paragraphs ? (
        paragraphs.map((p, i) => (
          <p key={i} className="puc-chat__text puc-chat__text--host">{p}</p>
        ))
      ) : (
        <span className="puc-chat__text">{message.text}</span>
      )}
    </div>
  )
}

/** Break the message into 1-2-sentence paragraphs. Respects existing
 *  newlines first; otherwise splits on sentence boundaries when the run
 *  is long enough to be worth breaking. */
function splitForReading(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return ['']
  // Author-supplied paragraph breaks win.
  if (/\n\s*\n/.test(trimmed)) {
    return trimmed.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0)
  }
  // For long bodies, group every 2 sentences. Keep short messages intact.
  if (trimmed.length < 140) return [trimmed]
  const sentences = trimmed.match(/[^.!?]+[.!?]+(?:["'”’])?\s*/g) ?? [trimmed]
  const out: string[] = []
  for (let i = 0; i < sentences.length; i += 2) {
    out.push((sentences[i] ?? '').concat(sentences[i + 1] ?? '').trim())
  }
  return out.filter((p) => p.length > 0)
}
