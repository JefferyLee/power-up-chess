// Wire types for the Hall chat system.
// Mirrored by apps/web/src/firebase/callables.ts.

import type { HostId } from '../shared/hostId'

export type ChatMessageKind = 'user' | 'host' | 'system'

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
}

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
