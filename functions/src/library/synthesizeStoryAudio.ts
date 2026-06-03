// synthesizeStoryAudio — Microsoft Edge Neural TTS via the
// `msedge-tts` library. Used as the runtime fallback for the Story
// Library when a pre-generated static asset is missing
// (e.g. a story added since the last `pnpm generate-audio` run).
//
// Pre-generation lives in functions/scripts/generate-story-audio.mjs;
// the library is the same on both sides so the protocol-quirks
// surface is one place.
//
// Returns audio as base64 (mp3); ~100-150 KB per story, well under
// the 10 MB callable response limit.

import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

export type StoryVoice = 'lucy' | 'luca'

export interface SynthesizeStoryAudioRequest {
  voice: StoryVoice
  text: string
}

export interface SynthesizeStoryAudioResponse {
  ok: true
  audioBase64: string
  mimeType: 'audio/mpeg'
}

const VOICE_MAP: Record<StoryVoice, string> = {
  lucy: 'en-US-AriaNeural',
  luca: 'en-US-GuyNeural',
}

const MAX_TEXT_LEN = 4000

export const synthesizeStoryAudio = onCall<
  SynthesizeStoryAudioRequest,
  Promise<SynthesizeStoryAudioResponse>
>(async (req) => {
  if (!req.auth) {
    throw new HttpsError('unauthenticated', 'Sign in first.')
  }
  const voice = req.data?.voice
  const rawText = req.data?.text
  if (voice !== 'lucy' && voice !== 'luca') {
    throw new HttpsError('invalid-argument', 'voice must be lucy or luca.')
  }
  const text = typeof rawText === 'string' ? rawText.trim() : ''
  if (text.length === 0) {
    throw new HttpsError('invalid-argument', 'text is required.')
  }
  if (text.length > MAX_TEXT_LEN) {
    throw new HttpsError('invalid-argument', `text exceeds ${MAX_TEXT_LEN} chars.`)
  }

  try {
    const tts = new MsEdgeTTS()
    await tts.setMetadata(VOICE_MAP[voice], OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = await tts.toStream(text)
    const audio = await streamToBuffer(audioStream)
    return {
      ok: true,
      audioBase64: audio.toString('base64'),
      mimeType: 'audio/mpeg',
    }
  } catch (err) {
    console.error('synthesizeStoryAudio: edge-tts failed', err)
    throw new HttpsError(
      'internal',
      err instanceof Error ? err.message : 'TTS synthesis failed.',
    )
  }
})

function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    stream.on('data', (chunk: Buffer) => chunks.push(chunk))
    stream.on('end', () => resolve(Buffer.concat(chunks)))
    stream.on('error', reject)
  })
}
