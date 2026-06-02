// Wire types for the Hall chat system.
// Mirrored by apps/web/src/firebase/callables.ts.

import type { HostId } from '../shared/hostId'

export type ChatMessageKind = 'user' | 'host' | 'system'

export type ChatMessageAction =
  | { kind: 'join-room'; roomKind: 'chess' | 'wizard'; roomId: string; openerName: string }

/** Visible-only state for the story-comprehension quiz attached to a
 *  host's ambient story. The secret answer key lives in a separate
 *  function-only collection (story_quiz_keys) and never reaches clients. */
export interface QuizState {
  question: string
  state: 'open' | 'won' | 'closed'
  /** Set once someone wins. */
  winnerName?: string
  winnerUid?: string
  /** True if the winner was a non-bypass guest and the point was actually awarded. */
  earnedPoint?: boolean
  /** Revealed once state ≠ 'open'. */
  explanation?: string
  /** Timestamp the quiz was won or auto-closed. */
  resolvedAt?: number
}

export interface ChatMessageDoc {
  /** Display name as the message author should appear. */
  name: string
  /** Author uid for moderation traceability (empty for host/system). */
  uid: string
  /** Normalized name — empty for bypass guests + host/system messages. */
  normalizedName: string
  /** True if author is a bypass guest. Renders with 👻 prefix. */
  isBypass: boolean
  kind: ChatMessageKind
  /** Sanitised text. */
  text: string
  /** Server timestamp (ms). */
  ts: number
  /** Hidden by moderation flag count ≥ 3 (Phase D++). */
  hidden?: boolean
  /** For 'host' messages — which persona spoke. */
  hostId?: HostId
  /** Optional CTA button rendered with the message. Used today for
   *  "someone just opened a room — click to join". */
  action?: ChatMessageAction
  /** Optional quiz attached to a 'host' ambient story. Visible state
   *  only; the answer key is in story_quiz_keys/{messageId}. */
  quiz?: QuizState
}

/** Where the user currently is in the app. `hall` is the default; any
 *  room kind carries the roomId so spectators can follow into it. */
export type LocationTag =
  | { kind: 'hall' }
  | { kind: 'chess'; roomId: string }
  | { kind: 'wizard'; roomId: string }

export interface PresenceDoc {
  sessionId: string
  /** Display name shown in the OnlineList. */
  displayName: string
  /** Normalized name for dedup (empty for bypass guests so they each appear). */
  normalizedName: string
  /** Auth uid — used to retro-block trolls. */
  uid: string
  isBypass: boolean
  hostId: HostId
  /** Server ts of the last heartbeat (ms). */
  lastSeenAt: number
  /** Where the user currently is — defaults to hall when omitted. */
  location?: LocationTag
}

// ─── Callables ─────────────────────────────────────────────────────────────

export interface PostChatRequest {
  text: string
}
export type PostChatResponse =
  | { status: 'ok'; messageId: string; censored: boolean; hostReplyPending: boolean }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'empty' }
  | { status: 'too-long' }

export interface SetPresenceRequest {
  sessionId: string
  /** Where this presence row should appear — omit / hall for the Hall. */
  location?: LocationTag
}
export interface SetPresenceResponse {
  ok: true
}

// ─── Rate limits ───────────────────────────────────────────────────────────

export const CHAT_LIMITS = {
  messagesPerMinute: 5,
  messagesPerDay: 30,
  hostRepliesPerDay: 15,
  textMaxChars: 200,
} as const
