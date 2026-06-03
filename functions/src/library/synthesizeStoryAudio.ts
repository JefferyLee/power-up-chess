// synthesizeStoryAudio — text-to-speech for the Story Library, using
// Microsoft Edge's free Neural TTS endpoint.
//
// We connect to Edge's read-aloud WebSocket the same way the
// `edge-tts` Python library (and many OSS tools) do: a well-known
// public trusted-client token, no auth, no quota. The endpoint is
// UNOFFICIAL — Microsoft can throttle or close it at any time — so
// the client falls back to the browser's Web Speech API on error.
//
// Returns audio as base64 (mp3) in the response, so the client can
// build a Blob URL and play via <audio>. Stories are ~500–1000 chars
// → ~30–60 KB audio, comfortably under the 10 MB callable limit.

import { randomUUID } from 'node:crypto'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import WebSocket from 'ws'

export type StoryVoice = 'lucy' | 'luca'

export interface SynthesizeStoryAudioRequest {
  voice: StoryVoice
  text: string
}

export interface SynthesizeStoryAudioResponse {
  ok: true
  audioBase64: string
  /** "audio/mpeg" — the Edge endpoint format we requested. */
  mimeType: 'audio/mpeg'
}

const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const EDGE_WS_URL =
  `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${EDGE_TOKEN}`

// Voice list: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support
// Aria/Guy are warm en-US Neural voices that read children's content
// naturally. Both run at default rate; SSML prosody adds a 5 % slow.
const VOICE_MAP: Record<StoryVoice, string> = {
  lucy: 'en-US-AriaNeural',
  luca: 'en-US-GuyNeural',
}

const MAX_TEXT_LEN = 4000 // single story body should never approach this
const CONNECT_TIMEOUT_MS = 8_000
const SYNTHESIS_TIMEOUT_MS = 25_000

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
    const audio = await synthesize(VOICE_MAP[voice], text)
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

function synthesize(voiceName: string, text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const connectionId = randomUUID().replaceAll('-', '')
    const requestId = randomUUID().replaceAll('-', '')
    const url = `${EDGE_WS_URL}&ConnectionId=${connectionId}`

    const ws = new WebSocket(url, {
      headers: {
        // Mimicking the Edge browser handshake — the endpoint
        // rejects connections that don't look like an Edge client.
        'Pragma': 'no-cache',
        'Cache-Control': 'no-cache',
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      },
    })

    const chunks: Buffer[] = []
    let settled = false
    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      try {
        ws.close()
      } catch {
        /* ignore */
      }
      fn()
    }

    const connectTimer = setTimeout(() => {
      settle(() => reject(new Error('edge-tts: connect timeout')))
    }, CONNECT_TIMEOUT_MS)
    const overallTimer = setTimeout(() => {
      settle(() => reject(new Error('edge-tts: synthesis timeout')))
    }, SYNTHESIS_TIMEOUT_MS)

    ws.on('open', () => {
      clearTimeout(connectTimer)
      try {
        // 1) speech.config — declare output format + metadata options.
        const ts = new Date().toUTCString()
        const config = {
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: false,
                  wordBoundaryEnabled: false,
                },
                outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
              },
            },
          },
        }
        const configMessage =
          `X-Timestamp:${ts}\r\n` +
          `Content-Type:application/json; charset=utf-8\r\n` +
          `Path:speech.config\r\n\r\n` +
          JSON.stringify(config)
        ws.send(configMessage)

        // 2) ssml — the actual text + voice selection.
        const ssml =
          `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>` +
          `<voice name='${voiceName}'>` +
          `<prosody rate='-4%' pitch='+0Hz'>${escapeXml(text)}</prosody>` +
          `</voice>` +
          `</speak>`
        const ssmlMessage =
          `X-RequestId:${requestId}\r\n` +
          `Content-Type:application/ssml+xml\r\n` +
          `X-Timestamp:${ts}\r\n` +
          `Path:ssml\r\n\r\n` +
          ssml
        ws.send(ssmlMessage)
      } catch (err) {
        settle(() => reject(err instanceof Error ? err : new Error(String(err))))
      }
    })

    ws.on('message', (data: Buffer | string, isBinary: boolean) => {
      if (isBinary && Buffer.isBuffer(data)) {
        // Binary frame: 2-byte big-endian header length, then ASCII
        // header text, then the audio bytes. We only want the audio
        // bytes that follow the header in frames labeled Path:audio.
        const headerLen = data.readUInt16BE(0)
        const headerEnd = 2 + headerLen
        const header = data.subarray(2, headerEnd).toString('utf8')
        if (header.includes('Path:audio')) {
          chunks.push(data.subarray(headerEnd))
        }
      } else {
        // Text frame — protocol message. We watch for turn.end as the
        // signal that synthesis is complete.
        const msg = typeof data === 'string' ? data : data.toString('utf8')
        if (msg.includes('Path:turn.end')) {
          clearTimeout(overallTimer)
          settle(() => resolve(Buffer.concat(chunks)))
        }
      }
    })

    ws.on('error', (err) => {
      clearTimeout(connectTimer)
      clearTimeout(overallTimer)
      settle(() => reject(err))
    })
    ws.on('close', (code, reason) => {
      clearTimeout(connectTimer)
      clearTimeout(overallTimer)
      if (chunks.length > 0) {
        // Got some audio before close — treat as success.
        settle(() => resolve(Buffer.concat(chunks)))
      } else {
        settle(() =>
          reject(
            new Error(
              `edge-tts: closed without audio (code ${code}, reason ${reason.toString('utf8')})`,
            ),
          ),
        )
      }
    })
  })
}

function escapeXml(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
