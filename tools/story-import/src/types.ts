// Shared types across the story-extraction stages.

export interface BookMeta {
  /** Short slug used as the prefix in story ids and the raw-text filename. */
  bookId: string
  /** Display title for source attribution. */
  title: string
  /** Author(s) string for attribution. */
  author?: string
  /** Original publication year (if known). */
  year?: number
  /** Absolute path to the source file. */
  path: string
  /** File format. Determines which extractor to call. */
  format: 'pdf' | 'epub'
}

/** A single text chunk we'll feed to the harvester. */
export interface TextChunk {
  bookId: string
  /** Stable hash for the cache key. */
  chunkId: string
  /** 1-based chunk index within the book. */
  index: number
  /** Approximate page range this chunk spans, for sourcePage attribution. */
  pageStart?: number
  pageEnd?: number
  text: string
}

/** Story candidate as returned by Gemini in the harvest stage. */
export interface StoryCandidate {
  /** Stable id assigned downstream — `{bookId}-{slug}`. Generated, not from LLM. */
  id: string
  bookId: string
  /** Short title in the host's voice (≤ 60 chars). */
  title: string
  /** 2-5 sentence retelling — original wording. Becomes the source-of-truth body. */
  body: string
  /** "1920s", "modern", "ancient" etc. Free-form, mainly for UI grouping later. */
  era?: string
  /** Player names mentioned (Capablanca, Polgár …). */
  players?: string[]
  /** One of: history, anecdote, game, tournament, opening, tactic. */
  motif: string
  /** Page range in the source. */
  sourcePage?: string
  /** Chunk this candidate came from — used for anti-verbatim validation. */
  sourceChunkId: string
}

/** Final voiced + validated story, ready for emit. */
export interface VoicedStory extends StoryCandidate {
  variants: {
    lucy: string
    luca: string
  }
}

/** Rights metadata co-located with the emitted story. */
export type RightsStatus = 'engineering-stored-not-reviewed' | 'reviewed-ok' | 'reviewed-block'

export interface EmittedStory extends VoicedStory {
  source: {
    book: string
    author?: string
    year?: number
    page?: string
  }
  rightsStatus: RightsStatus
  generatedAt: number
}
