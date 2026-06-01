// Stage 1 — download the Lichess CC0 puzzle CSV (zstd-compressed) into ./work.
//
// We don't commit the raw dump (it's ~400 MB). Re-run this whenever you want
// to refresh against the latest snapshot.

import { mkdir, stat } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { DUMP_URL, RAW_ZST, WORK_DIR } from './paths.js'

export async function runFetch(): Promise<void> {
  await mkdir(WORK_DIR, { recursive: true })
  try {
    const s = await stat(RAW_ZST)
    if (s.size > 100_000_000) {
      console.log(`Already have ${RAW_ZST} (${humanSize(s.size)}); skipping download.`)
      return
    }
    console.log(`Existing dump at ${RAW_ZST} looks small (${humanSize(s.size)}); re-downloading.`)
  } catch {
    // not present — fall through
  }

  console.log(`Downloading ${DUMP_URL} → ${RAW_ZST}`)
  const res = await fetch(DUMP_URL)
  if (!res.ok || !res.body) {
    throw new Error(`Download failed: HTTP ${res.status}`)
  }
  const dest = createWriteStream(RAW_ZST)
  let received = 0
  const body = res.body as unknown as ReadableStream<Uint8Array>
  const node = Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0])
  node.on('data', (chunk: Buffer) => {
    received += chunk.length
    if (received % (32 * 1024 * 1024) < chunk.length) {
      process.stdout.write(`  ${humanSize(received)}\r`)
    }
  })
  await pipeline(node, dest)
  console.log(`\nDownloaded ${humanSize(received)}.`)
}

function humanSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i++
  }
  return `${n.toFixed(1)} ${units[i]}`
}
