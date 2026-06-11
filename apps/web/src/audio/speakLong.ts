// Browser SpeechSynthesis has a well-known Chrome bug: a single
// utterance that runs longer than ~15 seconds is silently truncated,
// and a queued utterance can also stop firing if the synth sits idle.
// For the host stories (often 800-2000 chars) this means the voice
// just stops mid-sentence.
//
// Workaround:
//   1. Split the text into sentence-sized chunks (each < ~180 chars).
//   2. Speak them sequentially, chaining via onend.
//   3. Hold a ref to every utterance so they aren't GC'd.
//   4. Run a 10s pause/resume "keepalive" while we're speaking — this
//      is the canonical fix for the Chrome bug where the queue freezes
//      after ~15s of continuous speech.

export interface SpeakLongHandle {
  cancel: () => void
}

export interface SpeakLongOptions {
  text: string
  lang?: string
  rate?: number
  /** Resolved at speak-time so we can match by name even if voices load
   *  asynchronously. */
  pickVoice?: (voices: SpeechSynthesisVoice[]) => SpeechSynthesisVoice | undefined
  onEnd?: () => void
  onError?: () => void
}

const MAX_CHUNK = 180

export function chunkForSpeech(raw: string, maxLen = MAX_CHUNK): string[] {
  const text = raw.replace(/\s+/g, ' ').trim()
  if (!text) return []
  // Split on sentence-ending punctuation. Lookbehind keeps the punctuation.
  const sentences = text.split(/(?<=[.!?…])\s+/u)
  const out: string[] = []
  for (const s of sentences) {
    if (s.length <= maxLen) {
      out.push(s)
      continue
    }
    // Long sentence (no terminator, or run-on) — break on commas/semicolons,
    // then greedily pack pieces back together up to maxLen.
    const pieces = s.split(/(?<=[,;:])\s+/u)
    let buf = ''
    for (const p of pieces) {
      if (!buf) { buf = p; continue }
      if (buf.length + 1 + p.length <= maxLen) {
        buf = buf + ' ' + p
      } else {
        out.push(buf)
        buf = p
      }
    }
    if (buf) out.push(buf)
  }
  return out.filter((c) => c.trim().length > 0)
}

export function speakLong(opts: SpeakLongOptions): SpeakLongHandle {
  const synth = window.speechSynthesis
  synth.cancel()

  const chunks = chunkForSpeech(opts.text)
  const utterances: SpeechSynthesisUtterance[] = []
  let idx = 0
  let cancelled = false
  let keepaliveId: number | null = null

  const resolveVoice = (): SpeechSynthesisVoice | undefined => {
    if (!opts.pickVoice) return undefined
    return opts.pickVoice(synth.getVoices())
  }

  const stopKeepalive = () => {
    if (keepaliveId !== null) {
      window.clearInterval(keepaliveId)
      keepaliveId = null
    }
  }

  // The ~15s queue-freeze bug is CHROMIUM-ONLY, and so is the
  // pause()/resume() workaround. On Safari/iOS, pause() mid-utterance
  // frequently stalls speech permanently (resume() never restarts it)
  // — running the keepalive there CAUSES the very mid-story cutoff
  // it's meant to prevent. Chrome/Edge/Opera UAs all contain
  // "Chrome"; Safari and Firefox don't.
  const needsKeepalive =
    typeof navigator !== 'undefined' && /chrome/i.test(navigator.userAgent)

  const startKeepalive = () => {
    if (!needsKeepalive) return
    if (keepaliveId !== null) return
    keepaliveId = window.setInterval(() => {
      if (cancelled) { stopKeepalive(); return }
      // The Chrome workaround: a no-op pause+resume keeps the queue
      // from hitting its ~15s freeze.
      if (synth.speaking) {
        synth.pause()
        synth.resume()
      }
    }, 10000)
  }

  const speakNext = () => {
    if (cancelled) return
    if (idx >= chunks.length) {
      stopKeepalive()
      opts.onEnd?.()
      return
    }
    const u = new SpeechSynthesisUtterance(chunks[idx]!)
    if (opts.lang) u.lang = opts.lang
    if (opts.rate !== undefined) u.rate = opts.rate
    const v = resolveVoice()
    if (v) u.voice = v
    u.onend = () => {
      if (cancelled) return
      idx++
      speakNext()
    }
    u.onerror = (e) => {
      // 'interrupted' / 'canceled' fire when the caller cancels — those
      // aren't real errors, just bow out quietly.
      stopKeepalive()
      if (cancelled) return
      const errType = (e as SpeechSynthesisErrorEvent).error
      if (errType === 'interrupted' || errType === 'canceled') return
      opts.onError?.()
    }
    utterances.push(u)
    synth.speak(u)
  }

  startKeepalive()
  speakNext()

  return {
    cancel: () => {
      cancelled = true
      stopKeepalive()
      synth.cancel()
    },
  }
}
