// Stage 1 — extract raw text from each PDF book into work/raw/{bookId}.txt
// and chunked JSON into work/chunks/{bookId}.json.
//
// Chunks are ~3000 chars, preferring paragraph boundaries. Each chunk
// carries the page range it spans (approximated from pdf-parse's per-page
// output) so we can later attribute story.sourcePage.
//
// EPUB extraction is not implemented yet — those books are skipped with
// a console warning.

import { createHash } from 'node:crypto'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import pdfParse from 'pdf-parse'
import { BOOKS } from './books.js'
import { CHUNKS_DIR, RAW_DIR } from './paths.js'
import type { BookMeta, TextChunk } from './types.js'

const TARGET_CHUNK_CHARS = 3000
const MIN_CHUNK_CHARS = 800

export async function runExtract(): Promise<void> {
  await mkdir(RAW_DIR, { recursive: true })
  await mkdir(CHUNKS_DIR, { recursive: true })

  for (const book of BOOKS) {
    if (book.format !== 'pdf') {
      console.warn(`  skip ${book.bookId} — ${book.format} extraction not implemented yet`)
      continue
    }
    try {
      await stat(book.path)
    } catch {
      console.warn(`  skip ${book.bookId} — source file missing: ${book.path}`)
      continue
    }

    console.log(`  extract ${book.bookId} (${book.title}) …`)
    const { rawText, pageBreaks } = await extractPdf(book.path)
    await writeFile(`${RAW_DIR}/${book.bookId}.txt`, rawText)

    const chunks = chunkText(book, rawText, pageBreaks)
    await writeFile(`${CHUNKS_DIR}/${book.bookId}.json`, JSON.stringify(chunks, null, 2))
    console.log(`    raw chars: ${rawText.length}, chunks: ${chunks.length}`)
  }
}

async function extractPdf(path: string): Promise<{ rawText: string; pageBreaks: number[] }> {
  const buffer = await readFile(path)
  const parsed = await pdfParse(buffer)
  // pdf-parse returns the whole document as one string, with form-feed (\f)
  // separating pages. We use that to derive cumulative-offset → page-number.
  const rawText = parsed.text
  const pageBreaks: number[] = []
  let offset = 0
  for (const piece of rawText.split('\f')) {
    pageBreaks.push(offset)
    offset += piece.length + 1 // +1 for the form feed itself
  }
  return { rawText, pageBreaks }
}

function chunkText(book: BookMeta, raw: string, pageBreaks: number[]): TextChunk[] {
  // Split on paragraph boundaries first; greedily pack into chunks.
  const paragraphs = raw.split(/\n\s*\n/).map((s) => s.trim()).filter((s) => s.length > 0)
  const chunks: TextChunk[] = []
  let buf = ''
  let bufStartOffset = 0
  let runningOffset = 0
  let chunkIndex = 0

  const flush = (endOffset: number) => {
    if (buf.length < MIN_CHUNK_CHARS) return
    chunkIndex++
    const id = chunkHash(book.bookId, chunkIndex, buf)
    chunks.push({
      bookId: book.bookId,
      chunkId: id,
      index: chunkIndex,
      pageStart: offsetToPage(bufStartOffset, pageBreaks),
      pageEnd: offsetToPage(endOffset, pageBreaks),
      text: buf.trim(),
    })
    buf = ''
  }

  for (const p of paragraphs) {
    // Find the paragraph's actual start position so we can attribute pages
    // accurately. indexOf is O(n*m) worst-case but the corpus is small.
    const pStart = raw.indexOf(p, runningOffset)
    const pEnd = pStart + p.length
    runningOffset = pEnd

    if (buf.length === 0) {
      bufStartOffset = pStart
    }

    if (buf.length + p.length + 2 > TARGET_CHUNK_CHARS && buf.length > 0) {
      flush(bufStartOffset + buf.length)
      bufStartOffset = pStart
    }
    buf += (buf.length === 0 ? '' : '\n\n') + p
  }
  flush(bufStartOffset + buf.length)
  return chunks
}

function offsetToPage(offset: number, pageBreaks: number[]): number {
  // pageBreaks[i] is the cumulative offset where page (i+1) begins.
  // Binary search for the largest break ≤ offset.
  let lo = 0
  let hi = pageBreaks.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1
    if (pageBreaks[mid]! <= offset) lo = mid
    else hi = mid - 1
  }
  return lo + 1 // pages are 1-based
}

function chunkHash(bookId: string, index: number, text: string): string {
  const h = createHash('sha256')
  h.update(`${bookId}::${index}::${text.slice(0, 200)}`)
  return `${bookId}-${h.digest('hex').slice(0, 10)}`
}
