// ChatPanel — the shared Hall chat. Subscribes to lobby/messages via
// onSnapshot, renders bubbles, posts via callPostChat.

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callHostStoryAnswer, callPostChat, callReportChatMessage } from '../firebase/callables'
import { useClearedAt, setClearedAtNow } from './clearedAt'
import { hideAuthor, unhideAuthor, useHiddenAuthors } from './hiddenAuthors'
import { useCastle } from './useCastle'
import { useLobbyMessages, type ChatMessage, type ChatMessageAction, type QuizState } from './useLobbyChat'
import { NameLink } from '../invitations/NameLink'
import { TeamBadge } from '../teams/TeamBadge'
import { TerminalOverlay } from './terminal/TerminalOverlay'
import './ChatPanel.css'

export function ChatPanel({ canChat }: { canChat: boolean }) {
  const allMessages = useLobbyMessages()
  // /clear hides everything posted BEFORE the local timestamp. Server-
  // side messages are untouched; this is purely a self-view filter.
  const clearedAt = useClearedAt()
  const unclearedMessages = clearedAt > 0
    ? allMessages.filter((m) => m.ts >= clearedAt)
    : allMessages
  // "Hide for me" — lines from authors this device muted. Local only;
  // a toggle lets the kid peek at what they hid.
  const hiddenAuthors = useHiddenAuthors()
  const [showHidden, setShowHidden] = useState(false)
  const isMuted = (m: ChatMessage) => m.kind === 'user' && !!m.normalizedName && hiddenAuthors.has(m.normalizedName)
  const hiddenCount = hiddenAuthors.size === 0 ? 0 : unclearedMessages.filter(isMuted).length
  const messages = hiddenCount === 0 || showHidden
    ? unclearedMessages
    : unclearedMessages.filter((m) => !isMuted(m))
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [terminalOpen, setTerminalOpen] = useState(false)
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

    // Embedded chat only handles /clear inline; every other slash
    // command lives in the terminal overlay (tap ⛶ to enter). This
    // keeps the inline UI calm — kids who type /xyz here get a nudge
    // toward the terminal where the world unfolds.
    if (trimmed.startsWith('/')) {
      const name = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase()
      if (name === 'clear') {
        setClearedAtNow()
        setText('')
        setError(null)
        return
      }
      setError('Open the terminal (tap ⛶) to use commands.')
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
        {(() => {
          // Only the LATEST story-with-quiz keeps its card. Older
          // story bubbles render as plain teaser text. Server already
          // closes the prior quiz when a new story posts; this just
          // stops the closed cards from cluttering chat history.
          const latestQuizId = (() => {
            for (let i = messages.length - 1; i >= 0; i--) {
              if (messages[i]!.quiz) return messages[i]!.id
            }
            return null
          })()
          return messages.map((m) => (
            <Bubble key={m.id} message={m} showQuiz={m.id === latestQuizId} muted={isMuted(m)} />
          ))
        })()}
      </div>
      {hiddenCount > 0 && (
        <div className="puc-chat__hidden-bar">
          {showHidden
            ? `Showing ${hiddenCount} line${hiddenCount === 1 ? '' : 's'} you hid.`
            : `${hiddenCount} line${hiddenCount === 1 ? '' : 's'} hidden for you.`}
          <button type="button" className="puc-chat__report" onClick={() => setShowHidden((v) => !v)}>
            {showHidden ? 'Hide them again' : 'Show hidden'}
          </button>
        </div>
      )}
      <form className="puc-chat__form" onSubmit={handleSubmit}>
        <button
          type="button"
          className="puc-chat__terminal"
          onClick={() => setTerminalOpen(true)}
          disabled={!canChat}
          title="Open the Castle Terminal"
          aria-label="Open terminal"
        >
          ⛶
        </button>
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
      {terminalOpen && <TerminalOverlay onClose={() => setTerminalOpen(false)} />}
    </div>
  )
}

function Bubble({ message, showQuiz, muted }: { message: ChatMessage; showQuiz: boolean; muted: boolean }) {
  const { identity } = useCastle()
  const isHost = message.kind === 'host'
  const isSystem = message.kind === 'system'
  // "Hide for me": any other guest's line can be muted on this device.
  // Bypass guests have no stable name to mute, so no button for them.
  const canHide =
    message.kind === 'user' && !!message.normalizedName && message.normalizedName !== identity?.normalizedName
  // A kid can flag another guest's message; 3 distinct reports auto-hide it.
  // Not your own, not host lines; system lines only when they carry a
  // kid's own words (team founded / recruiting cards are `reportable`).
  const canReport =
    (message.kind === 'user' || message.reportable === true) &&
    !(message.normalizedName && message.normalizedName === identity?.normalizedName)
  const [reportState, setReportState] = useState<'idle' | 'confirm' | 'sent'>('idle')
  const doReport = () => {
    setReportState('sent')
    void callReportChatMessage(message.id).catch(() => setReportState('idle'))
  }
  // Host stories are usually 2-5 sentences — split them into short
  // paragraphs so a 4-sentence anecdote doesn't render as one wall of text.
  const paragraphs = isHost ? splitForReading(message.text) : null
  return (
    <div className={`puc-chat__bubble puc-chat__bubble--${message.kind}${message.hasTournamentCrown ? ' puc-chat__bubble--tcrown' : message.hasCrown ? ' puc-chat__bubble--crown' : message.hasHalo ? ' puc-chat__bubble--halo' : ''}${muted ? ' puc-chat__bubble--muted' : ''}`}>
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
        {message.viaTerminal && (
          <span className="puc-chat__tunnel" title="Sent through the Castle Terminal">
            · 🌀 from the secret tunnel
          </span>
        )}
        {message.viaWizard && (
          <span className="puc-chat__tunnel" title="Said inside a Wizard's Duel — duel chat is always visible here too">
            · ⚔️ from a Wizard duel
          </span>
        )}
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
      {message.quiz && showQuiz && <QuizBlock messageId={message.id} quiz={message.quiz} />}
      {(canReport || canHide) && (
        <div className="puc-chat__mod">
          {canHide && (muted ? (
            <button type="button" className="puc-chat__report" onClick={() => unhideAuthor(message.normalizedName)} title="Show this guest's lines again">
              Unhide
            </button>
          ) : (
            <button type="button" className="puc-chat__report" onClick={() => hideAuthor(message.normalizedName)} title="Hide this guest's lines — only for you, only on this device">
              🙈 Hide
            </button>
          ))}
          {canReport && reportState === 'idle' && (
            <button type="button" className="puc-chat__report" onClick={() => setReportState('confirm')} title="Report this message">
              ⚑ Report
            </button>
          )}
          {reportState === 'confirm' && (
            <span className="puc-chat__report-confirm">
              Report this message?
              <button type="button" className="puc-chat__report" onClick={doReport}>Yes</button>
              <button type="button" className="puc-chat__report" onClick={() => setReportState('idle')}>No</button>
            </span>
          )}
          {reportState === 'sent' && (
            <span className="puc-chat__reported">Reported ✓ — thanks for telling us</span>
          )}
        </div>
      )}
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
  if (action.kind === 'join-tournament') {
    return (
      <button
        type="button"
        className="puc-chat__action puc-chat__action--tournament"
        onClick={() => navigate('/tournament')}
      >
        ▸ Sign up too
      </button>
    )
  }
  if (action.kind === 'spectate-room') {
    const path = action.roomKind === 'wizard'
      ? `/wizard/${action.roomId}`
      : `/r/${action.roomId}`
    return (
      <button
        type="button"
        className={`puc-chat__action puc-chat__action--${action.roomKind}`}
        onClick={() => navigate(path)}
      >
        ▸ Spectate
      </button>
    )
  }
  if (action.kind === 'join-open-room') {
    const path = action.roomKind === 'wizard'
      ? `/wizard/${action.roomId}`
      : `/r/${action.roomId}`
    return (
      <button
        type="button"
        className={`puc-chat__action puc-chat__action--${action.roomKind}`}
        onClick={() => navigate(path)}
      >
        {action.roomKind === 'wizard' ? '▸ Enter duel' : '▸ Join room'}
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
