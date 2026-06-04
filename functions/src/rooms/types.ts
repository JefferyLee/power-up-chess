// Wire-format types shared with the client. Keep these stable.

export interface PlayerRef {
  playerId: string
  displayName: string
  /** This player's equipped piece-set at game start. Locked for the
   *  duration of the game — the board renders this side's pieces with
   *  this set on every viewer's screen. Older rooms predate the
   *  field; treat absent as "let the viewer's own default decide". */
  pieceSetId?: string
  /** Castle name (lowercased + trimmed). Lets the same player rejoin
   *  the seat from a different anonymous-auth uid after a disconnect
   *  or device switch. Missing on rooms created before this field
   *  existed; reclaim falls back to spectator in that case. */
  normalizedName?: string
}

export type RoomStatus = 'waiting' | 'live' | 'completed'

export interface TimeControl {
  initialMs: number
  incrementMs: number
}

export interface RoomDoc {
  white: PlayerRef
  black: PlayerRef | null
  status: RoomStatus
  currentFen: string
  hostMode: 'lucy' | 'luca'
  theme: string
  /**
   * Authoritative move list. Validated and appended by the submitMove function;
   * never written directly by clients. Capped well below Firestore's 1 MB doc
   * size limit — even a 200-move game is only ~40 KB here.
   */
  moves: Move[]
  /** Set when status === 'completed'. */
  result?: 'white' | 'black' | 'draw'
  endReason?: 'checkmate' | 'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move' | 'resign' | 'timeout' | 'other'
  /** Null for an untimed game; clocks are skipped entirely. */
  timeControl: TimeControl | null
  /** Stored remaining time at lastTickServerTs. Null when timeControl is null. */
  whiteTimeMs: number | null
  blackTimeMs: number | null
  /** Server ms when the currently-running side's clock started. Set on
   *  joinRoom (live transition) and on every submitMove. Null while waiting
   *  or completed. */
  lastTickServerTs: number | null
  createdAt: number // ms since epoch
  updatedAt: number
}

export interface Move {
  san: string
  uci: string
  fenBefore: string
  fenAfter: string
  byPlayerId: string
  clientTs: number
  serverTs: number
}

export interface CreateRoomRequest {
  displayName: string
  /** Caller's normalized castle name — used to debit the room-opening cost. */
  normalizedName?: string
  /** True for bypass guests. Bypass guests cannot open rooms (no balance). */
  isBypass?: boolean
  timeControl?: TimeControl | null
  /** Caller's equipped piece-set id. Stamped onto white.pieceSetId so
   *  both players see this player's pieces in their chosen set. */
  pieceSetId?: string
}

export interface CreateRoomResponse {
  roomId: string
}

export interface JoinRoomRequest {
  roomId: string
  displayName: string
  /** Caller's equipped piece-set id. Stamped onto black.pieceSetId. */
  pieceSetId?: string
  /** Caller's castle name. Lets the server reclaim an existing seat
   *  when the caller's uid has changed (disconnect / device switch)
   *  but their castle identity matches a slot's stored normalizedName. */
  normalizedName?: string
}

export interface JoinRoomResponse {
  roomId: string
  status: RoomStatus
}

export interface SubmitMoveRequest {
  roomId: string
  /** Zero-based expected move index — used to detect lost-update races. */
  moveIndex: number
  /** Source-destination plus optional promotion piece, e.g. "e7e8q". */
  uci: string
  clientTs: number
}

export interface SubmitMoveResponse {
  ok: true
  moveIndex: number
  fenAfter: string
}
