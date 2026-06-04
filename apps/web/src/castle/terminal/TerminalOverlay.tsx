// Full-screen terminal overlay — the "hidden world" mode of the Hall.
// In terminal mode the Hall is completely hidden: no public chat, no
// host portrait, no online list, nothing bleeds through. The kid sees
// only their own private text-world session (echo / reply / whisper /
// ascii). Plain text in the input becomes a private "mumble" — no
// public broadcasting from here. To talk to the Hall, /exit and use
// the inline chat.
//
// ESC or /exit closes.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../firebase/app'
import { useCastle } from '../useCastle'
import { useLobbyPresence } from '../useLobbyChat'
import { callPostChat } from '../../firebase/callables'
import { dispatchCommand, type WorldSnapshot } from './commandRegistry'
import { usePrivateStream, pushPrivate, type PrivateEntry } from './privateStream'
import './TerminalOverlay.css'

interface Props {
  onClose: () => void
}

export function TerminalOverlay({ onClose }: Props) {
  const { identity, hostId } = useCastle()
  const privateEntries = usePrivateStream()
  const presence = useLobbyPresence()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [currentStoryTitle, setCurrentStoryTitle] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
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

  // Stick to bottom on new content.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [privateEntries.length])

  // ESC closes; focus the input on mount.
  useEffect(() => {
    inputRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

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
          await callPostChat({ text: msg.slice(0, 200) })
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
        <span className="puc-term__title">CASTLE TERMINAL</span>
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
            You enter the Castle Terminal. The Hall is sealed off here — only your
            own footsteps echo. Type /help to begin.
          </p>
        )}
        {privateEntries.map((entry) =>
          <PrivateLine key={`priv-${entry.id}`} entry={entry} />,
        )}
      </div>

      <form className="puc-term__form" onSubmit={onSubmit}>
        <span className="puc-term__prompt">castle&gt;</span>
        <input
          ref={inputRef}
          className="puc-term__input"
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          disabled={busy}
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
        <span className="puc-term__prompt">&gt;</span>
        <span className="puc-term__text">{entry.text}</span>
      </div>
    )
  }
  if (entry.kind === 'whisper') {
    return <div className="puc-term__line puc-term__line--whisper">{entry.text}</div>
  }
  if (entry.kind === 'ascii') {
    return <pre className="puc-term__ascii">{entry.text}</pre>
  }
  return <div className="puc-term__line puc-term__line--reply">{entry.text}</div>
}
