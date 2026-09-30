// In-duel chat panel. Sits in the right column of WizardRoomScreen.
//
// Each text message costs the sender 1 castle point and each voice
// clip costs 5 — deducted server-side inside the same transaction
// that writes the message, so we can never charge without posting
// (or vice versa). Costs are surfaced inline in the input area so kids
// see the trade-off before clicking Send / releasing the record button.

import { useCallback, useEffect, useRef, useState } from 'react'
import { callPostWizardMessage, callPostWizardVoice } from '../../firebase/callables'
import { useWizardChatMessages, type WizardChatMessage } from './useWizardChat'
import './WizardChat.css'

import { friendlyError } from '../../errors/friendlyError'
const COSTS = {
  player: { text: 1, voice: 5 },
  spectator: { text: 2, voice: 20 },
} as const

const MAX_CHARS = 240
const MAX_VOICE_MS = 15_000
const MIN_VOICE_MS = 300

type Role = 'player' | 'spectator'

interface Props {
  roomId: string
  /** 'player' if the viewer is one of the two seated wizards, else 'spectator'. */
  yourRole: Role
  /** True for bypass guests / anyone without a castlePoints balance. */
  isBypass: boolean
  /** Caller's current castle-points balance — used to disable Send when broke. */
  callerPoints: number
  /** Caller's own color (null for spectators), to render their bubbles on the right. */
  yourColor: 'w' | 'b' | null
  /** Notified after a successful send so the caller can update their points UI. */
  onPosted: (newPoints: number) => void
}

export function WizardChat({ roomId, yourRole, isBypass, callerPoints, yourColor, onPosted }: Props) {
  const textCost = COSTS[yourRole].text
  const voiceCost = COSTS[yourRole].voice
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

  const brokeText = callerPoints < textCost
  const brokeVoice = callerPoints < voiceCost
  const textDisabled = isBypass || brokeText || submitting
  const voiceDisabled = isBypass || brokeVoice || submitting

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (textDisabled) return
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
      setError(friendlyError(err, 'sending your message'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleVoice = useCallback(
    async (clip: { blob: Blob; mimeType: string; durationMs: number }) => {
      if (voiceDisabled) return
      setSubmitting(true)
      setError(null)
      try {
        const audioBase64 = await blobToBase64(clip.blob)
        const res = await callPostWizardVoice({
          roomId,
          audioBase64,
          mimeType: clip.mimeType,
          durationMs: clip.durationMs,
        })
        onPosted(res.castlePoints)
      } catch (err) {
        setError(friendlyError(err, 'sending your voice note'))
      } finally {
        setSubmitting(false)
      }
    },
    [roomId, voiceDisabled, onPosted],
  )

  const placeholder = isBypass
    ? 'Bypass guests can\'t chat in duels (no points to spend).'
    : brokeText
      ? `Need ${textCost} castle point${textCost === 1 ? '' : 's'} to send a message.`
      : `Type a message… (${textCost} pt) or hold mic (${voiceCost} pt)`

  return (
    <div className="puc-wdchat">
      <div className="puc-wdchat__header">
        <span className="puc-wdchat__title">Duel chat</span>
        <span className="puc-wdchat__cost">
          {yourRole === 'spectator' ? 'watching · ' : ''}{textCost} pt · text  |  {voiceCost} pt · 🎙
        </span>
      </div>
      <div
        className="puc-wdchat__scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        aria-live="polite"
      >
        {messages.length === 0 && (
          <p className="puc-wdchat__empty">Quiet so far. (Text {textCost} pt · voice {voiceCost} pt.)</p>
        )}
        {messages.map((m) => <Bubble key={m.id} message={m} mineUid={null} mineColor={yourColor} />)}
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
          disabled={textDisabled}
        />
        <button
          type="submit"
          className="puc-wdchat__send"
          disabled={textDisabled || text.trim().length === 0}
        >
          Send
        </button>
      </form>
      <VoiceRecorder
        disabled={voiceDisabled}
        callerPoints={callerPoints}
        voiceCost={voiceCost}
        isBypass={isBypass}
        onClip={handleVoice}
        onError={setError}
      />
      {error && <p className="puc-wdchat__error">{error}</p>}
    </div>
  )
}

function Bubble({
  message, mineColor, mineUid,
}: {
  message: WizardChatMessage
  mineColor: 'w' | 'b' | null
  mineUid: string | null
}) {
  const isSpectator = message.role === 'spectator' || message.color === null
  const mine = mineUid !== null
    ? message.uid === mineUid
    : !isSpectator && mineColor !== null && message.color === mineColor
  const bubbleVariant = isSpectator ? 's' : message.color ?? 'w'
  return (
    <div
      className={`puc-wdchat__bubble puc-wdchat__bubble--${bubbleVariant}${mine ? ' puc-wdchat__bubble--mine' : ''}`}
    >
      <span className="puc-wdchat__name">
        {message.displayName}
        {isSpectator && <span className="puc-wdchat__badge">watching</span>}
      </span>
      {message.kind === 'voice'
        ? <VoiceBubble message={message} />
        : <span className="puc-wdchat__text">{message.text}</span>}
    </div>
  )
}

function VoiceBubble({ message }: { message: Extract<WizardChatMessage, { kind: 'voice' }> }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio(`data:${message.mimeType};base64,${message.audioBase64}`)
    audio.onended = () => setPlaying(false)
    audio.onpause = () => setPlaying(false)
    audioRef.current = audio
    return () => {
      audio.pause()
      audioRef.current = null
    }
  }, [message.audioBase64, message.mimeType])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) {
      a.pause()
      a.currentTime = 0
    } else {
      a.currentTime = 0
      a.play().then(() => setPlaying(true)).catch(() => { /* autoplay blocked */ })
    }
  }

  const secs = Math.max(0.1, message.durationMs / 1000).toFixed(1)
  return (
    <button type="button" className="puc-wdchat__voice" onClick={toggle}>
      <span className="puc-wdchat__voice-icon">{playing ? '⏸' : '▶'}</span>
      <span className="puc-wdchat__voice-wave">🎙</span>
      <span className="puc-wdchat__voice-dur">{secs}s</span>
    </button>
  )
}

// ── Recorder ────────────────────────────────────────────────────────────

interface RecorderProps {
  disabled: boolean
  callerPoints: number
  voiceCost: number
  isBypass: boolean
  onClip: (clip: { blob: Blob; mimeType: string; durationMs: number }) => void
  onError: (msg: string) => void
}

function VoiceRecorder({ disabled, callerPoints, voiceCost, isBypass, onClip, onError }: RecorderProps) {
  const [recording, setRecording] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startTsRef = useRef<number>(0)
  const tickRef = useRef<number | null>(null)
  const supportsRecording = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia

  const cleanup = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current)
      tickRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    recorderRef.current = null
    setRecording(false)
  }, [])

  useEffect(() => cleanup, [cleanup])

  const stop = useCallback(() => {
    const rec = recorderRef.current
    if (rec && rec.state !== 'inactive') {
      rec.stop()
    } else {
      cleanup()
    }
  }, [cleanup])

  const start = useCallback(async () => {
    if (disabled || recording) return
    const mimeType = pickMime()
    if (!mimeType || !supportsRecording) {
      onError('Your browser doesn\'t support voice recording.')
      return
    }
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch (err) {
      const e = err as { name?: string }
      if (e.name === 'NotAllowedError') {
        onError('Microphone permission denied.')
      } else {
        onError('Could not access the microphone.')
      }
      return
    }
    streamRef.current = stream
    const recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32_000 })
    chunksRef.current = []
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data)
    }
    recorder.onstop = () => {
      const ms = Date.now() - startTsRef.current
      const cappedMs = Math.min(ms, MAX_VOICE_MS)
      const chunks = chunksRef.current
      cleanup()
      if (ms < MIN_VOICE_MS || chunks.length === 0) return
      const blob = new Blob(chunks, { type: mimeType })
      onClip({ blob, mimeType, durationMs: cappedMs })
    }
    startTsRef.current = Date.now()
    recorder.start(100)
    recorderRef.current = recorder
    setRecording(true)
    setElapsedMs(0)
    tickRef.current = window.setInterval(() => {
      const ms = Date.now() - startTsRef.current
      setElapsedMs(ms)
      if (ms >= MAX_VOICE_MS) stop()
    }, 100)
  }, [disabled, recording, supportsRecording, cleanup, stop, onError, onClip])

  if (!supportsRecording) return null

  const remaining = Math.max(0, MAX_VOICE_MS - elapsedMs)
  const helperText = isBypass
    ? 'Bypass guests can\'t send voice.'
    : callerPoints < voiceCost
      ? `Need ${voiceCost} castle points for a voice message.`
      : recording
        ? `🔴 ${(elapsedMs / 1000).toFixed(1)}s — release to send  (${(remaining / 1000).toFixed(1)}s left)`
        : `Hold to record (max ${MAX_VOICE_MS / 1000}s · costs ${voiceCost} pt)`

  return (
    <div className="puc-wdchat__rec-row">
      <button
        type="button"
        className={`puc-wdchat__rec${recording ? ' puc-wdchat__rec--on' : ''}`}
        onPointerDown={(e) => { e.preventDefault(); void start() }}
        onPointerUp={(e) => { e.preventDefault(); stop() }}
        onPointerLeave={() => { if (recording) stop() }}
        onPointerCancel={() => { if (recording) stop() }}
        disabled={disabled && !recording}
      >
        🎙 {recording ? 'Recording…' : 'Hold'}
      </button>
      <span className="puc-wdchat__rec-hint">{helperText}</span>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────

function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      const idx = result.indexOf(',')
      resolve(idx >= 0 ? result.slice(idx + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
    reader.readAsDataURL(blob)
  })
}
