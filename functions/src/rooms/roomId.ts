// Room ID generator: URL-safe, easy to type, hard to misread.
// Charset excludes 0/O/1/I/L to avoid the most common transcription errors.
// 32 chars ^ 6 length ≈ 1.07B combinations — collisions in MVP0 will be vanishingly rare.

const CHARSET = '23456789ABCDEFGHJKMNPQRSTVWXYZab' // 32 chars, mixed case for entropy
const LEN = 6

export function generateRoomId(): string {
  const buf = new Uint8Array(LEN)
  // crypto.getRandomValues exists in Node 18+ and in browsers.
  crypto.getRandomValues(buf)
  let out = ''
  for (let i = 0; i < LEN; i++) {
    out += CHARSET[buf[i]! % CHARSET.length]
  }
  return out
}
