// Typed wrappers around our Cloud Functions callables.
//
// Each wrapper returns just `.data` from the callable result so callers don't
// have to unwrap `{ data }` themselves.

import { httpsCallable } from 'firebase/functions'
import { functions } from './app'
import type {
  CreateRoomRequest,
  CreateRoomResponse,
  JoinRoomRequest,
  JoinRoomResponse,
  SubmitMoveRequest,
  SubmitMoveResponse,
} from '../rooms/types'

const createRoomFn = httpsCallable<CreateRoomRequest, CreateRoomResponse>(functions, 'createRoom')
const joinRoomFn = httpsCallable<JoinRoomRequest, JoinRoomResponse>(functions, 'joinRoom')
const submitMoveFn = httpsCallable<SubmitMoveRequest, SubmitMoveResponse>(functions, 'submitMove')
const resignGameFn = httpsCallable<{ roomId: string }, { ok: true }>(functions, 'resignGame')
const claimTimeWinFn = httpsCallable<{ roomId: string }, { ok: true }>(functions, 'claimTimeWin')

// Phase 5: LLM-backed host commentary.
export interface HostCommentaryRequest {
  host: 'lucy' | 'luca'
  classification: string
  fenBefore: string
  fenAfter: string
  moveSan: string
  moveUci: string
  evalBeforeCp: number
  evalAfterCp: number
  bestMoveSan?: string | null
  bestLineSan?: string[]
  playerName: string
  isAdaSpecialMode?: boolean
}
export interface HostCommentaryResponse {
  text: string
  source: 'cache' | 'llm'
}

export interface GameRecapRequest {
  host: 'lucy' | 'luca'
  pgn: string
  summary: {
    best?: number
    excellent?: number
    good?: number
    inaccuracy?: number
    mistake?: number
    blunder?: number
    brilliant?: number
  }
  result: 'white' | 'black' | 'draw'
  whiteName: string
  blackName: string
  playerName: string
  isAdaSpecialMode?: boolean
}
export interface GameRecapResponse {
  text: string
  source: 'cache' | 'llm'
}

const hostCommentaryFn = httpsCallable<HostCommentaryRequest, HostCommentaryResponse>(functions, 'hostCommentary')
const gameRecapFn = httpsCallable<GameRecapRequest, GameRecapResponse>(functions, 'gameRecap')

// MVP2: Castle auth + points.
export interface CastleEnterRequest {
  name: string
  hash: string
}
export type CastleEnterResponse =
  | { status: 'new'; displayName: string; castlePoints: 0; decayedBy: 0; pointsBeforeDecay: 0 }
  | { status: 'returning'; displayName: string; castlePoints: number; decayedBy: number; pointsBeforeDecay: number }
  | { status: 'wrong-magic'; attemptsRemaining: number }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'invalid-input'; reason: string }
export interface CastleBypassResponse {
  displayName: string
}

export type AwardSource =
  | { source: 'puzzle'; puzzleId: string; scorePoints: number; isFirstSolve: boolean }
  | { source: 'chess-win'; gameId: string }
  | { source: 'chess-review'; gameId: string; brilliant: number; bestExcellent: number }
export interface AwardCastlePointsRequest {
  normalizedName: string
  award: AwardSource
}
export interface AwardCastlePointsResponse {
  castlePoints: number
  added: number
  unlockedJustNow: boolean
}

const castleEnterFn = httpsCallable<CastleEnterRequest, CastleEnterResponse>(functions, 'castleEnter')
const castleBypassFn = httpsCallable<void, CastleBypassResponse>(functions, 'castleBypass')
const awardCastlePointsFn = httpsCallable<AwardCastlePointsRequest, AwardCastlePointsResponse>(functions, 'awardCastlePoints')

export async function callCreateRoom(req: CreateRoomRequest): Promise<CreateRoomResponse> {
  const { data } = await createRoomFn(req)
  return data
}

export async function callJoinRoom(req: JoinRoomRequest): Promise<JoinRoomResponse> {
  const { data } = await joinRoomFn(req)
  return data
}

export async function callSubmitMove(req: SubmitMoveRequest): Promise<SubmitMoveResponse> {
  const { data } = await submitMoveFn(req)
  return data
}

export async function callResignGame(roomId: string): Promise<void> {
  await resignGameFn({ roomId })
}

export async function callClaimTimeWin(roomId: string): Promise<void> {
  await claimTimeWinFn({ roomId })
}

export async function callHostCommentary(req: HostCommentaryRequest): Promise<HostCommentaryResponse> {
  const { data } = await hostCommentaryFn(req)
  return data
}

export async function callGameRecap(req: GameRecapRequest): Promise<GameRecapResponse> {
  const { data } = await gameRecapFn(req)
  return data
}

export async function callCastleEnter(req: CastleEnterRequest): Promise<CastleEnterResponse> {
  const { data } = await castleEnterFn(req)
  return data
}

export async function callCastleBypass(): Promise<CastleBypassResponse> {
  const { data } = await castleBypassFn()
  return data
}

export async function callAwardCastlePoints(req: AwardCastlePointsRequest): Promise<AwardCastlePointsResponse> {
  const { data } = await awardCastlePointsFn(req)
  return data
}
