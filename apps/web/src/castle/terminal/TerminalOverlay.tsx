// Full-screen terminal overlay — the "hidden world" mode of the Hall.
// In terminal mode the Hall is completely hidden: no public chat, no
// host portrait, no online list, nothing bleeds through. The kid sees
// only their own private text-world session (echo / reply / whisper /
// ascii). Plain text in the input becomes a private "mumble" — no
// public broadcasting from here. To talk to the Hall, /exit and use
// the inline chat.
//
// ESC or /exit closes.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/app'
import { useCastle } from '../useCastle'
import { useLobbyMessages, useLobbyPresence } from '../useLobbyChat'
import { callPostChat } from '../../firebase/callables'
import { dispatchCommand, type WorldSnapshot } from './commandRegistry'
import { usePrivateStream, pushPrivate, type PrivateEntry } from './privateStream'
import { playKeyClick } from './keyClick'
import { loadCurrentRoom, markVisited, ROOMS, type RoomId } from './world'
import './TerminalOverlay.css'

const PROMPT = 'PuC>'

interface Props {
  onClose: () => void
}

export function TerminalOverlay({ onClose }: Props) {
  const { identity, hostId } = useCastle()
  const privateEntries = usePrivateStream()
  const presence = useLobbyPresence()
  // Subscribed but NOT rendered in the terminal UI — only fed into
  // the world snapshot so /read can peek the Hall on demand.
  const recentMessages = useLobbyMessages()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [currentStoryTitle, setCurrentStoryTitle] = useState<string | null>(null)
  // Castle Map location. Reads the persisted room on first open so the
  // kid resumes where they left off.
  const [currentRoom, setCurrentRoom] = useState<RoomId>(() => loadCurrentRoom())
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Track the live story title so /look can mention it. We only want
  // the title for the host currently on duty; if the story is from
  // the off-duty host we treat it as absent (matches CurrentStoryPanel).
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'castle_live', 'current_story'), (snap) => {
      const data = snap.data() as { hostId?: string; title?: string } | undefined
      if (!data || data.hostId !== hostId) { setCurrentStoryTitle(null); return }
      setCurrentStoryTitle(data.title ?? null)
    })
    return () => unsub()
  }, [hostId])

  // Auto-scroll strategy:
  //  - If the LAST new entry is an ASCII block (the chess board is 11
  //    lines tall and dwarfs a phone viewport), scroll that block to
  //    the TOP of view so the whole board is visible. The trailing
  //    "Make a move" reply line ends up below the fold; the kid
  //    scrolls down to find it, which feels natural.
  //  - Otherwise, anchor to the bottom so the latest reply is in view.
  //
  // rAF + setTimeout fallback covers iOS Safari's occasional miss
  // when the keyboard is mid-animation.
  const lastSeenCountRef = useRef(0)
  useEffect(() => {
    const newEntries = privateEntries.slice(lastSeenCountRef.current)
    lastSeenCountRef.current = privateEntries.length
    // Walk back to find the most recent ascii entry in the new batch.
    // /play's batch is (reply, ascii, reply) — the ascii is the second
    // entry, not the last, so we have to look explicitly.
    const newAscii = [...newEntries].reverse().find((e) => e.kind === 'ascii')
    const scroll = () => {
      if (newAscii) {
        const el = scrollRef.current?.querySelector(`[data-entry-id="${newAscii.id}"]`)
        if (el) {
          ;(el as HTMLElement).scrollIntoView({ block: 'start', behavior: 'auto' })
          return
        }
      }
      bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' })
    }
    const frame = requestAnimationFrame(scroll)
    const timer = window.setTimeout(scroll, 100)
    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [privateEntries])

  // Focus the input the moment the DOM is committed (layout effect
  // runs synchronously after paint — stays in the gesture chain that
  // opened the terminal, so iOS Safari pops the keyboard).
  useLayoutEffect(() => {
    inputRef.current?.focus()
  }, [])

  // ESC closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Re-focus on every new private-stream entry. Command output landing
  // is a strong signal that the kid is about to type the next command,
  // and any tap that scrolled the page during the wait shouldn't have
  // robbed the prompt of focus.
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [privateEntries.length])

  // First-open auto-look: when the kid opens a fresh terminal session
  // (empty private stream), describe the room they're in so they get
  // oriented without having to type /look. /clear then reopen also
  // triggers this — that's intentional, kid gets a clean "you are here".
  // Ref guard prevents the effect from firing twice in React strict mode.
  const didAutoLookRef = useRef(false)
  useEffect(() => {
    if (didAutoLookRef.current) return
    if (privateEntries.length > 0) {
      didAutoLookRef.current = true
      return
    }
    didAutoLookRef.current = true
    const room = ROOMS[currentRoom]
    const lines = [`── ${room.name} ──`, room.description]
    if (room.occupant) lines.push(room.occupant)
    const isFirst = markVisited(currentRoom)
    if (isFirst && room.firstVisit) lines.push(room.firstVisit)
    lines.push('Type /help to see what you can do.')
    pushPrivate('reply', lines.join('\n'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy) return
    const trimmed = text.trim()
    if (!trimmed) return

    setBusy(true)
    try {
      const world: WorldSnapshot = {
        presence,
        hostOnDuty: hostId,
        currentStoryTitle,
        recentMessages,
        currentRoom,
        setCurrentRoom,
      }
      const handled = await dispatchCommand(trimmed, {
        identity,
        navigate,
        world,
        // Public chat is still reachable for handlers that explicitly
        // want it (e.g. /me posts an emote to the Hall). Plain text
        // typed into the terminal is NOT broadcast — see the !handled
        // branch below.
        postPublic: async (msg: string) => {
          // Every terminal-originated public post carries the
          // viaTerminal flag so onlookers see a "secret tunnel" tag.
          await callPostChat({ text: msg.slice(0, 200), viaTerminal: true })
        },
        exitTerminal: onClose,
      })
      if (!handled) {
        // Plain text in the terminal stays in the terminal. Echo it
        // as a mumble so the kid sees something happened, but nothing
        // leaves this private session.
        pushPrivate('echo', trimmed)
        pushPrivate('whisper', 'You murmur to yourself. The Hall does not hear you here. (Type /exit to talk in the Hall.)')
      }
      setText('')
    } catch (err) {
      console.warn('terminal submit failed', err)
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="puc-term">
      <header className="puc-term__head">
        <span className="puc-term__title">Terminal of Power Up Castle</span>
        <button
          type="button"
          className="puc-term__close"
          onClick={onClose}
          aria-label="Exit terminal"
          title="ESC to exit"
        >✕</button>
      </header>

      <div className="puc-term__scroll" ref={scrollRef}>
        {privateEntries.length === 0 && (
          <p className="puc-term__welcome">
            You slip behind the chat panel into the older rooms of the Castle…
          </p>
        )}
        {privateEntries.map((entry) =>
          <PrivateLine key={`priv-${entry.id}`} entry={entry} />,
        )}
        {/* Bottom-anchor for scrollIntoView; cheaper than measuring
            the scroll container's scrollHeight after layout. */}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      <form className="puc-term__form" onSubmit={onSubmit}>
        <span className="puc-term__prompt">{PROMPT}</span>
        <input
          ref={inputRef}
          className="puc-term__input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Click on every keystroke that contributes a visible
            // character (so arrow keys + modifiers stay silent).
            if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Enter') {
              playKeyClick()
            }
          }}
          maxLength={200}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="type /help to begin"
        />
      </form>
    </div>,
    document.body,
  )
}

function PrivateLine({ entry }: { entry: PrivateEntry }) {
  if (entry.kind === 'echo') {
    return (
      <div className="puc-term__line puc-term__line--echo">
        <span className="puc-term__prompt">{PROMPT}</span>
        <span className="puc-term__text">{entry.text}</span>
      </div>
    )
  }
  if (entry.kind === 'whisper') {
    return <div className="puc-term__line puc-term__line--whisper">{entry.text}</div>
  }
  if (entry.kind === 'ascii') {
    return <pre className="puc-term__ascii" data-entry-id={entry.id}>{entry.text}</pre>
  }
  return <div className="puc-term__line puc-term__line--reply">{entry.text}</div>
}
