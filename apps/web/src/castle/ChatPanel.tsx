// ChatPanel — the shared Hall chat. Subscribes to lobby/messages via
// onSnapshot, renders bubbles, posts via callPostChat.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callHostStoryAnswer, callPostChat } from '../firebase/callables'
import { parseChat } from './chatCommands'
import { useClearedAt, setClearedAtNow } from './clearedAt'
import { useCastle } from './useCastle'
import { useLobbyMessages, type ChatMessage, type ChatMessageAction, type QuizState } from './useLobbyChat'
import { NameLink } from '../invitations/NameLink'
import { TeamBadge } from '../teams/TeamBadge'
import './ChatPanel.css'

export function ChatPanel({ canChat }: { canChat: boolean }) {
  const allMessages = useLobbyMessages()
  // /clear hides everything posted BEFORE the local timestamp. Server-
  // side messages are untouched; this is purely a self-view filter.
  const clearedAt = useClearedAt()
  const messages = clearedAt > 0
    ? allMessages.filter((m) => m.ts >= clearedAt)
    : allMessages
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

    // Slash-command dispatch. Later slices add /skill, /shout, /define;
    // for slice 1 we handle /clear locally and let everything else
    // pass through to postChat as plain text.
    const parsed = parseChat(trimmed)
    if (parsed.kind === 'clear') {
      setClearedAtNow()
      setText('')
      setError(null)
      return
    }
    if (parsed.kind === 'error') {
      setError(parsed.message)
      return
    }
    // Slice 1 fall-through: anything that isn't /clear or a plain
    // message just posts as literal text. Future slices intercept
    // the other kinds before we get here.
    const toPost = parsed.kind === 'message' ? parsed.text : trimmed

    setSubmitting(true)
    setError(null)
    try {
      const res = await callPostChat({ text: toPost })
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
    <div className={`puc-chat__bubble puc-chat__bubble--${message.kind}${message.hasTournamentCrown ? ' puc-chat__bubble--tcrown' : message.hasCrown ? ' puc-chat__bubble--crown' : message.hasHalo ? ' puc-chat__bubble--halo' : ''}`}>
      <span className="puc-chat__name">
        {message.isBypass ? '👻 ' : ''}
        {message.hasTournamentCrown
          ? <span className="puc-chat__crown" title="Weekly Tournament champion — last 7 days">🏆</span>
          : message.hasCrown
            ? <span className="puc-chat__crown" title="3+ duel wins in a row — last 72h">🔥</span>
            : message.hasHalo && <span className="puc-chat__halo" title="Duel winner — last 24h">✨</span>}
        {message.kind === 'user' && !message.isBypass && message.normalizedName ? (
          <NameLink
            normalizedName={message.normalizedName}
            displayName={message.name}
            className="puc-chat__name-link"
          />
        ) : (
          <>{message.name}</>
        )}
        {message.title && <span className="puc-chat__title">· {message.title}</span>}
        {isHost ? ' · host' : ''}
        {isSystem ? ' · system' : ''}
        <span className="puc-chat__time">{formatChatTime(message.ts)}</span>
      </span>
      {paragraphs ? (
        paragraphs.map((p, i) => (
          <p key={i} className="puc-chat__text puc-chat__text--host">{p}</p>
        ))
      ) : (
        <span className="puc-chat__text">{message.text}</span>
      )}
      {message.action && <ActionButton action={message.action} />}
      {message.quiz && <QuizBlock messageId={message.id} quiz={message.quiz} />}
    </div>
  )
}

function QuizBlock({ messageId, quiz }: { messageId: string; quiz: QuizState }) {
  const { identity, setCastlePoints } = useCastle()
  const [answer, setAnswer] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [attemptsLeft, setAttemptsLeft] = useState<number | null>(null)
  const [locked, setLocked] = useState(false)

  const isWon = quiz.state === 'won'
  const isClosed = quiz.state === 'closed'
  const winnerLine = isWon
    ? `🏅 ${quiz.winnerName ?? 'someone'} got it!${quiz.earnedPoint ? ' +1 castle point.' : ''}`
    : null
  const canAnswer = !isWon && !isClosed && !locked && !!identity

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canAnswer || submitting) return
    const trimmed = answer.trim()
    if (!trimmed) return
    setSubmitting(true)
    setFeedback(null)
    try {
      const res = await callHostStoryAnswer({ messageId, answer: trimmed })
      if (res.status === 'correct') {
        setFeedback(res.earnedPoint ? `Correct! +1 castle point.` : 'Correct!')
        if (res.earnedPoint) setCastlePoints(res.castlePoints)
        setAnswer('')
      } else if (res.status === 'wrong') {
        setFeedback(`Not quite — ${res.attemptsRemaining} attempt${res.attemptsRemaining === 1 ? '' : 's'} left.`)
        setAttemptsLeft(res.attemptsRemaining)
        if (res.attemptsRemaining <= 0) setLocked(true)
      } else if (res.status === 'already-won') {
        setFeedback(`Too late — ${res.winnerName} already got it.`)
        setLocked(true)
      } else if (res.status === 'closed') {
        setFeedback('Question is closed.')
        setLocked(true)
      } else if (res.status === 'no-attempts-left') {
        setFeedback('No attempts left for you.')
        setLocked(true)
      }
    } catch (err) {
      setFeedback(err instanceof Error ? err.message.replace(/^FirebaseError: /, '') : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={`puc-chat__quiz puc-chat__quiz--${quiz.state}`}>
      <p className="puc-chat__quiz-q">
        <span className="puc-chat__quiz-tag">Question</span> {quiz.question}
      </p>
      {canAnswer && (
        <form className="puc-chat__quiz-form" onSubmit={handleSubmit}>
          <input
            className="puc-chat__quiz-input"
            type="text"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            maxLength={60}
            autoComplete="off"
            placeholder="Your answer…"
            disabled={submitting}
          />
          <button
            type="submit"
            className="puc-chat__quiz-send"
            disabled={submitting || answer.trim().length === 0}
          >
            Answer
          </button>
        </form>
      )}
      {feedback && <p className="puc-chat__quiz-feedback">{feedback}</p>}
      {winnerLine && <p className="puc-chat__quiz-winner">{winnerLine}</p>}
      {(isWon || isClosed) && quiz.explanation && (
        <p className="puc-chat__quiz-explain">📜 {quiz.explanation}</p>
      )}
      {!canAnswer && !isWon && !isClosed && attemptsLeft !== null && attemptsLeft <= 0 && (
        <p className="puc-chat__quiz-feedback">Waiting for someone else to get it…</p>
      )}
    </div>
  )
}

function ActionButton({ action }: { action: ChatMessageAction }) {
  const navigate = useNavigate()
  if (action.kind === 'join-room') {
    const path = action.roomKind === 'wizard' ? `/wizard/${action.roomId}` : `/r/${action.roomId}`
    const label = action.roomKind === 'wizard' ? 'Enter duel' : 'Join room'
    return (
      <button
        type="button"
        className={`puc-chat__action puc-chat__action--${action.roomKind}`}
        onClick={() => navigate(path)}
      >
        ▸ {label}
      </button>
    )
  }
  if (action.kind === 'team-recruit') {
    return (
      <div className="puc-chat__teamcard">
        <span className="puc-chat__teamcard-badge">
          <TeamBadge badge={action.badge} size={48} />
        </span>
        <div className="puc-chat__teamcard-body">
          <p className="puc-chat__teamcard-name">{action.teamName}</p>
          <p className="puc-chat__teamcard-meta">
            Captain {action.captainDisplayName} · {action.memberCount} / 20
          </p>
        </div>
        <button
          type="button"
          className="puc-chat__action puc-chat__action--team"
          onClick={() => navigate(`/team/${action.teamId}`)}
        >
          ▸ View team
        </button>
      </div>
    )
  }
  return null
}

/** Format a chat ts (epoch ms) as a compact "HH:MM". Messages > 24 h
 *  are cleaned up server-side, so we never need date-level context. */
function formatChatTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
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
