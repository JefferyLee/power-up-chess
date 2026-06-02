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

// MVP2 Phase D: Hall chat.
export interface PostChatRequest {
  text: string
}
export type PostChatResponse =
  | { status: 'ok'; messageId: string; censored: boolean; hostReplyPending: boolean }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'empty' }
  | { status: 'too-long' }

export type LocationTag =
  | { kind: 'hall' }
  | { kind: 'chess'; roomId: string }
  | { kind: 'wizard'; roomId: string }

export interface SetPresenceRequest {
  sessionId: string
  displayName: string
  normalizedName: string
  hostId: 'lucy' | 'luca'
  isBypass: boolean
  /** Omit for the Hall — the server defaults to hall when absent. */
  location?: LocationTag
}
export interface SetPresenceResponse {
  ok: true
}

const postChatFn = httpsCallable<PostChatRequest, PostChatResponse>(functions, 'postChat')
const setPresenceFn = httpsCallable<SetPresenceRequest, SetPresenceResponse>(functions, 'setPresence')

// MVP2 Phase E: Forest Adventure scores.
export interface SubmitForestScoreRequest {
  normalizedName: string
  runId: string
  score: number
}
export interface SubmitForestScoreResponse {
  ok: true
  best: number
  improved: boolean
}

const submitForestScoreFn = httpsCallable<SubmitForestScoreRequest, SubmitForestScoreResponse>(functions, 'submitForestScore')

// MVP2 W.3: Wizard's Duel online.
export interface WizardPlayerInfo {
  displayName: string
  normalizedName: string
  isBypass: boolean
}
export interface CreateWizardRoomResponse { roomId: string }
export interface JoinWizardRoomRequest extends WizardPlayerInfo { roomId: string }
export interface JoinWizardRoomResponse { color: 'w' | 'b' }
export interface SubmitWizardMoveRequest { roomId: string; from: string; to: string }
export interface SubmitWizardSpellRequest {
  roomId: string
  spellId: string
  targets: string[]
}
export interface SubmitWizardSpellResponse { ok: true; castlePoints: number }

const createWizardRoomFn = httpsCallable<WizardPlayerInfo, CreateWizardRoomResponse>(functions, 'createWizardRoom')
const joinWizardRoomFn = httpsCallable<JoinWizardRoomRequest, JoinWizardRoomResponse>(functions, 'joinWizardRoom')
const submitWizardMoveFn = httpsCallable<SubmitWizardMoveRequest, { ok: true }>(functions, 'submitWizardMove')
const submitWizardSpellFn = httpsCallable<SubmitWizardSpellRequest, SubmitWizardSpellResponse>(functions, 'submitWizardSpell')

export interface PostWizardMessageRequest {
  roomId: string
  text: string
}
export interface PostWizardMessageResponse {
  status: 'ok'
  messageId: string
  censored: boolean
  /** Caller's castle points AFTER the 1-point deduction. */
  castlePoints: number
}
const postWizardMessageFn = httpsCallable<PostWizardMessageRequest, PostWizardMessageResponse>(functions, 'postWizardMessage')

export interface PostWizardVoiceRequest {
  roomId: string
  audioBase64: string
  mimeType: string
  durationMs: number
}
export interface PostWizardVoiceResponse {
  status: 'ok'
  messageId: string
  /** Caller's castle points AFTER the 5-point deduction. */
  castlePoints: number
}
const postWizardVoiceFn = httpsCallable<PostWizardVoiceRequest, PostWizardVoiceResponse>(functions, 'postWizardVoice')

// MVP2 M.5: Story Q&A — judge a guess at the comprehension question
// attached to a host's ambient story. The first correct answer per
// quiz earns +1 castle point (non-bypass guests only).
export interface HostStoryAnswerRequest {
  messageId: string
  answer: string
}
export type HostStoryAnswerResponse =
  | { status: 'correct'; attemptsUsed: number; explanation: string; earnedPoint: boolean; castlePoints: number }
  | { status: 'wrong'; attemptsUsed: number; attemptsRemaining: number }
  | { status: 'already-won'; winnerName: string; explanation?: string }
  | { status: 'closed'; explanation?: string }
  | { status: 'no-attempts-left'; explanation?: string }
const hostStoryAnswerFn = httpsCallable<HostStoryAnswerRequest, HostStoryAnswerResponse>(functions, 'hostStoryAnswer')

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

export async function callPostChat(req: PostChatRequest): Promise<PostChatResponse> {
  const { data } = await postChatFn(req)
  return data
}

export async function callSetPresence(req: SetPresenceRequest): Promise<SetPresenceResponse> {
  const { data } = await setPresenceFn(req)
  return data
}

export async function callSubmitForestScore(req: SubmitForestScoreRequest): Promise<SubmitForestScoreResponse> {
  const { data } = await submitForestScoreFn(req)
  return data
}

export async function callCreateWizardRoom(req: WizardPlayerInfo): Promise<CreateWizardRoomResponse> {
  const { data } = await createWizardRoomFn(req)
  return data
}
export async function callJoinWizardRoom(req: JoinWizardRoomRequest): Promise<JoinWizardRoomResponse> {
  const { data } = await joinWizardRoomFn(req)
  return data
}
export async function callSubmitWizardMove(req: SubmitWizardMoveRequest): Promise<void> {
  await submitWizardMoveFn(req)
}
export async function callSubmitWizardSpell(req: SubmitWizardSpellRequest): Promise<SubmitWizardSpellResponse> {
  const { data } = await submitWizardSpellFn(req)
  return data
}
export async function callPostWizardMessage(req: PostWizardMessageRequest): Promise<PostWizardMessageResponse> {
  const { data } = await postWizardMessageFn(req)
  return data
}
export async function callPostWizardVoice(req: PostWizardVoiceRequest): Promise<PostWizardVoiceResponse> {
  const { data } = await postWizardVoiceFn(req)
  return data
}
export async function callHostStoryAnswer(req: HostStoryAnswerRequest): Promise<HostStoryAnswerResponse> {
  const { data } = await hostStoryAnswerFn(req)
  return data
}
