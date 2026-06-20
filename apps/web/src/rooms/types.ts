// Wire-format types — must stay in sync with functions/src/rooms/types.ts.
//
// If you change either side, change both. A shared package becomes worthwhile
// in MVP1 if the contract grows.

export interface PlayerRef {
  playerId: string
  displayName: string
  /** This player's equipped piece-set at game start. Both viewers
   *  render this side's pieces with this set. Missing on older rooms;
   *  fall back to the viewer's local default. */
  pieceSetId?: string
  /** Castle name (lowercased + trimmed). Lets the same player rejoin
   *  the seat from a different anonymous-auth uid after a disconnect
   *  or device switch. Missing on rooms created before this field
   *  existed; reclaim falls back to spectator in that case. */
  normalizedName?: string
}

export type RoomStatus = 'waiting' | 'live' | 'completed'
export type RoomResult = 'white' | 'black' | 'draw'
export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move'
  | 'resign'
  | 'timeout'
  | 'other'

export interface TimeControlWire {
  initialMs: number
  incrementMs: number
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

export interface RoomDoc {
  white: PlayerRef
  black: PlayerRef | null
  status: RoomStatus
  currentFen: string
  hostMode: 'lucy' | 'luca'
  theme: string
  moves: Move[]
  result?: RoomResult
  endReason?: EndReason
  /** Null for an untimed game. */
  timeControl: TimeControlWire | null
  /** Remaining time at lastTickServerTs. Null if untimed. */
  whiteTimeMs: number | null
  blackTimeMs: number | null
  /** Server timestamp when the running side's clock last started; the running
   *  side is implicit from currentFen's side-to-move (set when status flips
   *  to 'live' on joinRoom). Null while waiting / once completed. */
  lastTickServerTs: number | null
  createdAt: number
  updatedAt: number
  /** Pending takeback offer — the requester's own last move, awaiting
   *  opponent consent. */
  takeback?: { by: 'w' | 'b'; atMoveCount: number } | null
  /** Takebacks each side has spent this game (max 3). */
  takebacksUsed?: { w: number; b: number }
}

export interface CreateRoomRequest {
  displayName: string
  /** Caller's normalized castle name — used server-side to debit the
   *  room-opening cost. Required for non-bypass guests. */
  normalizedName?: string
  /** True for bypass guests. Bypass guests cannot open rooms. */
  isBypass?: boolean
  hostMode?: 'lucy' | 'luca'
  timeControl?: TimeControlWire | null
  /** Caller's equipped piece-set id. Stamped onto white.pieceSetId. */
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
  /** Caller's castle name (lowercased + trimmed). Server uses this to
   *  reclaim an existing seat after a uid change (disconnect / device
   *  switch). When the room already has both players and one's
   *  normalizedName matches the caller, joinRoom updates that slot's
   *  playerId instead of rejecting "room full". */
  normalizedName?: string
}
export interface JoinRoomResponse {
  roomId: string
  status: RoomStatus
}

export interface SubmitMoveRequest {
  roomId: string
  moveIndex: number
  uci: string
  clientTs: number
}
export interface SubmitMoveResponse {
  ok: true
  moveIndex: number
  fenAfter: string
}
