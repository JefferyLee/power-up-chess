// Wire-format types shared with the client. Keep these stable.

export interface PlayerRef {
  playerId: string
  displayName: string
}

export type RoomStatus = 'waiting' | 'live' | 'completed'

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
  endReason?: 'checkmate' | 'stalemate' | 'insufficient_material' | 'threefold_repetition' | 'fifty_move' | 'resign' | 'other'
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
  hostMode?: 'lucy' | 'luca'
}

export interface CreateRoomResponse {
  roomId: string
}

export interface JoinRoomRequest {
  roomId: string
  displayName: string
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
