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
  /** True if the author had an active cosmetic at send time. Snapshot
   *  so historical bubbles render consistently even after the cosmetic
   *  expires. Currently only "duel-winner halo" sets this. */
  hasHalo?: boolean
  /** True if the author had the streak crown (3+ consecutive Wizard's
   *  Duel wins) at send time. Visually overrides hasHalo. */
  hasCrown?: boolean
  /** Author's lifetime-earn title label at send time ("Apprentice", etc.),
   *  omitted when below the entry threshold. Snapshot — historical
   *  bubbles keep showing the title from when they were posted. */
  title?: string
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
  /** True if the guest currently has the post-duel-win halo cosmetic.
   *  Refreshed each heartbeat from guests/{name}.cosmetics. */
  hasHalo?: boolean
  /** True if the guest currently has the streak crown. Overrides halo. */
  hasCrown?: boolean
  /** Live lifetime-earn title label, refreshed each heartbeat. */
  title?: string
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
  // Headroom is per-minute (burst) AND per-5-minutes (sustained).
  // The old per-day cap of 30 was too low for active days — kids hit
  // it and then waited 24 h to chat again. Now the worst-case wait is
  // 5 minutes.
  messagesPerMinute: 20,
  messagesPer5Min: 80,
  hostRepliesPerDay: 15,
  textMaxChars: 200,
} as const
