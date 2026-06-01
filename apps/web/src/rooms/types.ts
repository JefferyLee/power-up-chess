// Wire-format types — must stay in sync with functions/src/rooms/types.ts.
//
// If you change either side, change both. A shared package becomes worthwhile
// in MVP1 if the contract grows.

export interface PlayerRef {
  playerId: string
  displayName: string
}

export type RoomStatus = 'waiting' | 'live' | 'completed'
export type RoomResult = 'white' | 'black' | 'draw'
export type EndReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'threefold_repetition'
  | 'fifty_move'
  | 'other'

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
  createdAt: number
  updatedAt: number
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
  moveIndex: number
  uci: string
  clientTs: number
}
export interface SubmitMoveResponse {
  ok: true
  moveIndex: number
  fenAfter: string
}
