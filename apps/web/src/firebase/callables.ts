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
export interface EnterBonus {
  starter?: number
  checkIn?: number
  streak?: number
  streakDays?: number
  /** Sum of starter + checkIn + streak — handy for the toast headline. */
  total: number
}
export interface EnterCosmetics {
  pieceSet?: string
  ownedPieceSets?: string[]
  /** Personal heraldic avatar (slice 4b). */
  avatar?: TeamBadge
}
export type CastleEnterResponse =
  | {
      status: 'new'
      displayName: string
      castlePoints: number
      decayedBy: 0
      pointsBeforeDecay: 0
      bonus?: EnterBonus
      sessionId: string
      cosmetics?: EnterCosmetics
    }
  | {
      status: 'returning'
      displayName: string
      castlePoints: number
      decayedBy: number
      pointsBeforeDecay: number
      bonus?: EnterBonus
      sessionId: string
      cosmetics?: EnterCosmetics
    }
  | { status: 'wrong-magic'; attemptsRemaining: number }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'invalid-input'; reason: string }
export interface CastleBypassResponse {
  displayName: string
}

export type ChessOpponent =
  | 'human'
  | 'ai-beginner'
  | 'ai-easy'
  | 'ai-medium'
  | 'ai-hard'
  | 'ai-expert'

export type AwardSource =
  | { source: 'puzzle'; puzzleId: string; scorePoints: number; isFirstSolve: boolean }
  | { source: 'chess-win'; gameId: string; opponent?: ChessOpponent }
  | { source: 'chess-review'; gameId: string; brilliant: number; bestExcellent: number }
  | { source: 'mystery'; mysteryId: string }
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
  /** True when the post came from the Castle Terminal's /say bridge —
   *  rendered with a "secret tunnel" tag in chat. */
  viaTerminal?: boolean
}
export type PostChatResponse =
  | { status: 'ok'; messageId: string; censored: boolean; hostReplyPending: boolean }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'empty' }
  | { status: 'too-long' }

// When adding a kind here, also update setPresence's sanitiseLocation
// (functions/src/castle/setPresence.ts) and the UI mappers in
// useLobbyChat.ts + OnlineList.tsx.
export type LocationTag =
  | { kind: 'hall' }
  | { kind: 'chess'; roomId: string }
  | { kind: 'wizard'; roomId: string }
  | { kind: 'puzzle-garden' }
  | { kind: 'puzzle-plot'; plot: string }
  | { kind: 'puzzle-daily' }
  | { kind: 'puzzle-legends' }
  | { kind: 'puzzle-calibration' }
  | { kind: 'puzzle-leaderboard' }
  | { kind: 'practice' }
  | { kind: 'local' }
  | { kind: 'forest' }

export interface SetPresenceRequest {
  sessionId: string
  displayName: string
  normalizedName: string
  hostId: 'lucy' | 'luca'
  isBypass: boolean
  /** Omit for the Hall — the server defaults to hall when absent. */
  location?: LocationTag
  /** H.7 auth session token from castleEnter. */
  authSessionId?: string
}
export type SetPresenceResponse =
  | { ok: true }
  | { ok: false; evicted: true }

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
  /** Phase E — castle points credited for this run (0 if score below
   *  the lowest tier OR the daily cap was already hit). */
  castlePointsAdded: number
  /** Guest's castle-point balance AFTER this run's payout. */
  castlePoints: number
}

const submitForestScoreFn = httpsCallable<SubmitForestScoreRequest, SubmitForestScoreResponse>(functions, 'submitForestScore')

// MVP2 W.3: Wizard's Duel online.
export interface WizardPlayerInfo {
  displayName: string
  normalizedName: string
  isBypass: boolean
  /** Caller's equipped piece-set id. Stamped onto their slot's
   *  pieceSetId so both viewers see this player's pieces in their
   *  chosen set. */
  pieceSetId?: string
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
export interface SpellPricing {
  effectiveCost: number
  baseCost: number
  personalMultiplier: number
  supplyMultiplier: number
  supplyRemaining: number
  personalCastCount: number
}
export interface SubmitWizardSpellResponse {
  ok: true
  castlePoints: number
  pricing: SpellPricing
}

const createWizardRoomFn = httpsCallable<WizardPlayerInfo, CreateWizardRoomResponse>(functions, 'createWizardRoom')
const joinWizardRoomFn = httpsCallable<JoinWizardRoomRequest, JoinWizardRoomResponse>(functions, 'joinWizardRoom')
const submitWizardMoveFn = httpsCallable<SubmitWizardMoveRequest, { ok: true }>(functions, 'submitWizardMove')
const submitWizardSpellFn = httpsCallable<SubmitWizardSpellRequest, SubmitWizardSpellResponse>(functions, 'submitWizardSpell')
const claimWizardTimeWinFn = httpsCallable<{ roomId: string }, { ok: true }>(functions, 'claimWizardTimeWin')
const resignWizardGameFn = httpsCallable<{ roomId: string }, { ok: true }>(functions, 'resignWizardGame')

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

// MVP2 M.7: On-demand story request from the host avatar.
export interface HostTellStoryRequest {
  hostId?: 'lucy' | 'luca'
}
export type HostTellStoryResponse =
  | { status: 'ok'; messageId: string; storyId: string; hostId: 'lucy' | 'luca' }
  | { status: 'rate-limited'; retryAfterMs: number; scope: 'minute' | 'day' }
  | { status: 'no-story-available' }
const hostTellStoryFn = httpsCallable<HostTellStoryRequest, HostTellStoryResponse>(functions, 'hostTellStory')

// Hidden Text World V1 — terminal /ask Lucy|Luca handler.
export interface AskHostRequest {
  host: 'lucy' | 'luca'
  question: string
}
export type AskHostResponse =
  | { status: 'ok'; answer: string }
  | { status: 'rate-limited'; retryAfterMs: number }
  | { status: 'too-long' }
  | { status: 'blocked' }
const askHostFn = httpsCallable<AskHostRequest, AskHostResponse>(functions, 'askHost')

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
export async function callClaimWizardTimeWin(roomId: string): Promise<void> {
  await claimWizardTimeWinFn({ roomId })
}
export async function callResignWizardGame(roomId: string): Promise<void> {
  await resignWizardGameFn({ roomId })
}
export async function callPostWizardMessage(req: PostWizardMessageRequest): Promise<PostWizardMessageResponse> {
  const { data } = await postWizardMessageFn(req)
  return data
}
export async function callPostWizardVoice(req: PostWizardVoiceRequest): Promise<PostWizardVoiceResponse> {
  const { data } = await postWizardVoiceFn(req)
  return data
}

export async function callAskHost(req: AskHostRequest): Promise<AskHostResponse> {
  const { data } = await askHostFn(req)
  return data
}
export async function callHostStoryAnswer(req: HostStoryAnswerRequest): Promise<HostStoryAnswerResponse> {
  const { data } = await hostStoryAnswerFn(req)
  return data
}
export async function callHostTellStory(req: HostTellStoryRequest): Promise<HostTellStoryResponse> {
  const { data } = await hostTellStoryFn(req)
  return data
}

// MVP2 Puzzle Garden — server-driven adaptive serving.

export type Plot = 'mate' | 'fork' | 'pinSkewer' | 'sacrifice' | 'endgame' | 'defense'

export interface ServerPuzzle {
  id: string
  fen: string
  sideToMove: 'w' | 'b'
  solution: string[]
  motifs: string[]
  plot: Plot
  difficulty: number
  ratingDeviation: number
  legends: boolean
  source: { provider: 'lichess'; puzzleId: string; license: 'CC0' }
  explanation?: string
  hints?: [string, string, string]
}

export interface GetNextPuzzleRequest {
  normalizedName: string
  plot: Plot
  ratingOverride?: number
}
export type GetNextPuzzleResponse =
  | { ok: true; puzzle: ServerPuzzle; playerRating: number }
  | { ok: false; reason: 'empty' | 'invalid-input' | 'not-found' }

export interface SubmitPuzzleAttemptRequest {
  normalizedName: string
  puzzleId: string
  success: boolean
  timeMs?: number
}
export interface SubmitPuzzleAttemptResponse {
  ok: true
  plot: Plot
  ratingBefore: number
  ratingAfter: number
  puzzleRating: number
  castlePointsAdded: number
  castlePoints: number
  legends: boolean
  dailyCompletedNow?: boolean
  dailyBonusAdded?: number
}

export interface GetDailyFiveRequest { normalizedName: string }
export type GetDailyFiveResponse =
  | {
      ok: true
      dayKey: string
      puzzles: ServerPuzzle[]
      results: Array<boolean | null>
      completionBonusPaid: boolean
    }
  | { ok: false; reason: 'invalid-input' | 'empty' }

export interface GetLegendsListRequest { normalizedName: string }
export interface GetLegendsListResponse {
  ok: true
  puzzles: ServerPuzzle[]
  solved: string[]
  totalSolved: number
  unlockThreshold: number
}

export interface GetMasterAtriumListRequest { normalizedName: string }
export interface GetMasterAtriumListResponse {
  ok: true
  puzzles: ServerPuzzle[]
  solved: string[]
  totalSolved: number
  unlockThreshold: number
}

export type FeedbackKind = 'bug' | 'suggestion'
export interface SubmitFeedbackRequest {
  kind: FeedbackKind
  text: string
  route?: string
  userAgent?: string
  authorName?: string
  normalizedName?: string
  isBypass?: boolean
}
export interface SubmitFeedbackResponse { ok: true; ts: number }

export interface MarkFeedbackReadRequest { id: string; read?: boolean }
export interface MarkFeedbackReadResponse { ok: true }

export interface DeleteFeedbackRequest { id: string }
export interface DeleteFeedbackResponse { ok: true }

export interface AwardTutorialCompleteRequest { normalizedName: string }
export interface AwardTutorialCompleteResponse {
  ok: true
  added: number
  castlePoints: number
  alreadyClaimed: boolean
}

export interface GetCalibrationSetRequest {
  normalizedName: string
}
export type GetCalibrationSetResponse =
  | { ok: true; puzzles: ServerPuzzle[]; alreadyCalibrated: boolean }
  | { ok: false; reason: 'invalid-input' | 'empty' }

export interface SubmitCalibrationRequest {
  normalizedName: string
  results: boolean[]
}
export interface SubmitCalibrationResponse {
  ok: true
  seedRating: number
}

const getNextPuzzleFn = httpsCallable<GetNextPuzzleRequest, GetNextPuzzleResponse>(
  functions,
  'getNextPuzzle',
)
const submitPuzzleAttemptFn = httpsCallable<
  SubmitPuzzleAttemptRequest,
  SubmitPuzzleAttemptResponse
>(functions, 'submitPuzzleAttempt')
const getCalibrationSetFn = httpsCallable<
  GetCalibrationSetRequest,
  GetCalibrationSetResponse
>(functions, 'getCalibrationSet')
const submitCalibrationFn = httpsCallable<
  SubmitCalibrationRequest,
  SubmitCalibrationResponse
>(functions, 'submitCalibration')
const getDailyFiveFn = httpsCallable<GetDailyFiveRequest, GetDailyFiveResponse>(
  functions,
  'getDailyFive',
)
const getLegendsListFn = httpsCallable<
  GetLegendsListRequest,
  GetLegendsListResponse
>(functions, 'getLegendsList')
const getMasterAtriumListFn = httpsCallable<
  GetMasterAtriumListRequest,
  GetMasterAtriumListResponse
>(functions, 'getMasterAtriumList')
const submitFeedbackFn = httpsCallable<SubmitFeedbackRequest, SubmitFeedbackResponse>(
  functions,
  'submitFeedback',
)
const markFeedbackReadFn = httpsCallable<
  MarkFeedbackReadRequest,
  MarkFeedbackReadResponse
>(functions, 'markFeedbackRead')
const deleteFeedbackFn = httpsCallable<
  DeleteFeedbackRequest,
  DeleteFeedbackResponse
>(functions, 'deleteFeedback')
const awardTutorialCompleteFn = httpsCallable<
  AwardTutorialCompleteRequest,
  AwardTutorialCompleteResponse
>(functions, 'awardTutorialComplete')

// P1.D Theme Shop
export interface PurchaseCosmeticRequest {
  normalizedName: string
  sessionId: string
  pieceSetId: string
}
export interface PurchaseCosmeticResponse {
  ok: true
  castlePoints: number
  ownedPieceSets: string[]
  equippedPieceSet: string
}
export interface EquipCosmeticRequest {
  normalizedName: string
  sessionId: string
  pieceSetId: string
}
export interface EquipCosmeticResponse {
  ok: true
  equippedPieceSet: string
}
const purchaseCosmeticFn = httpsCallable<
  PurchaseCosmeticRequest,
  PurchaseCosmeticResponse
>(functions, 'purchaseCosmetic')
const equipCosmeticFn = httpsCallable<
  EquipCosmeticRequest,
  EquipCosmeticResponse
>(functions, 'equipCosmetic')

// P1.F Story Library — Edge-TTS proxy callable. 'owl' is the Book
// Owl's British voice; 'cn' reads the Chinese story variants.
export interface SynthesizeStoryAudioRequest {
  voice: 'lucy' | 'luca' | 'owl' | 'cn'
  text: string
}
export interface SynthesizeStoryAudioResponse {
  ok: true
  audioBase64: string
  mimeType: 'audio/mpeg'
}
const synthesizeStoryAudioFn = httpsCallable<
  SynthesizeStoryAudioRequest,
  SynthesizeStoryAudioResponse
>(functions, 'synthesizeStoryAudio')

export interface MarkStoryReadRequest { storyId: string }
export interface MarkStoryReadResponse { added: boolean; booksRead: number }
const markStoryReadFn = httpsCallable<MarkStoryReadRequest, MarkStoryReadResponse>(
  functions,
  'markStoryRead',
)
export async function callMarkStoryRead(req: MarkStoryReadRequest): Promise<MarkStoryReadResponse> {
  const { data } = await markStoryReadFn(req)
  return data
}

export interface LibraryShelfEntry {
  bookKey: string
  author?: string
  storyIds: string[]
  totalStories: number
  reads: number
  kidReadCount: number
}
export interface GetLibraryShelvesResponse {
  shelves: LibraryShelfEntry[]
  totalKidReads: number
  totalLibraryReads: number
}
const getLibraryShelvesFn = httpsCallable<unknown, GetLibraryShelvesResponse>(
  functions,
  'getLibraryShelves',
)
export async function callGetLibraryShelves(): Promise<GetLibraryShelvesResponse> {
  const { data } = await getLibraryShelvesFn(undefined)
  return data
}

// Book Owl — curated reading lists proxied from the book-seek project.
export interface SeekBooksRequest { topicId: string }
export interface SeekBook {
  title: string
  author: string
  year: string
  intro: string
  introCn: string
  coverUrl?: string
  verified?: boolean
}
export interface SeekSection {
  key: string
  title: string
  titleCn: string
  books: SeekBook[]
}
export interface SeekList {
  topicId: string
  label: string
  labelCn: string
  sections: SeekSection[]
  notes?: string
  notesCn?: string
}
export type SeekBooksResponse =
  | { ok: true; list: SeekList }
  | { ok: false; status: 'not-ready' }
const seekBooksFn = httpsCallable<SeekBooksRequest, SeekBooksResponse>(
  functions,
  'seekBooks',
)
export async function callSeekBooks(topicId: string): Promise<SeekBooksResponse> {
  const { data } = await seekBooksFn({ topicId })
  return data
}

export interface RecentlyPlayedEntry {
  normalizedName: string
  displayName: string
  lastPlayedAt: number
  online: boolean
  here?: 'hall' | 'chess' | 'wizard' | 'puzzle' | 'practice' | 'local' | 'forest'
}
export interface GetRecentlyPlayedResponse { entries: RecentlyPlayedEntry[] }
const getRecentlyPlayedFn = httpsCallable<unknown, GetRecentlyPlayedResponse>(
  functions,
  'getRecentlyPlayed',
)
export async function callGetRecentlyPlayed(): Promise<GetRecentlyPlayedResponse> {
  const { data } = await getRecentlyPlayedFn(undefined)
  return data
}

export interface FindPlayerRequest { query: string }
export interface FindPlayerMatch { normalizedName: string; displayName: string }
export interface FindPlayerResponse { matches: FindPlayerMatch[] }
const findPlayerFn = httpsCallable<FindPlayerRequest, FindPlayerResponse>(
  functions,
  'findPlayer',
)
export async function callFindPlayer(req: FindPlayerRequest): Promise<FindPlayerResponse> {
  const { data } = await findPlayerFn(req)
  return data
}

// ── Teams (MVP3-P3) ──
export interface TeamBadge {
  shape?: 'shield-heater' | 'shield-round' | 'shield-pointed' | 'roundel'
    | 'oval' | 'kite' | 'lozenge' | 'heart'
  layout?: 'solid' | 'horizontal' | 'vertical' | 'quartered'
    | 'bend' | 'chevron' | 'chief' | 'bordure'
  bg?: string
  bg2?: string
  border?: string
  symbol?: string
  symbolColor?: string
  /** Optional motto / monogram engraved on the badge. ≤12 chars,
   *  uppercase letters + digits + spaces only. Server-sanitised. */
  text?: string
  /** Where the text appears. 'chief' = top band inside the shield,
   *  'base' = scroll banner below the shield, 'none' = no text. */
  textPosition?: 'none' | 'chief' | 'base'
  textColor?: string
}

export interface CreateTeamRequest {
  name: string
  motto?: string
  badge?: TeamBadge
}
export interface CreateTeamResponse {
  teamId: string
  castlePoints: number
}
const createTeamFn = httpsCallable<CreateTeamRequest, CreateTeamResponse>(functions, 'createTeam')
export async function callCreateTeam(req: CreateTeamRequest): Promise<CreateTeamResponse> {
  const { data } = await createTeamFn(req)
  return data
}

export interface LeaveTeamRequest { teamId: string }
export interface LeaveTeamResponse { ok: true; disbanded: boolean }
const leaveTeamFn = httpsCallable<LeaveTeamRequest, LeaveTeamResponse>(functions, 'leaveTeam')
export async function callLeaveTeam(req: LeaveTeamRequest): Promise<LeaveTeamResponse> {
  const { data } = await leaveTeamFn(req)
  return data
}

export interface DisbandTeamRequest { teamId: string }
export interface DisbandTeamResponse { ok: true }
const disbandTeamFn = httpsCallable<DisbandTeamRequest, DisbandTeamResponse>(functions, 'disbandTeam')
export async function callDisbandTeam(req: DisbandTeamRequest): Promise<DisbandTeamResponse> {
  const { data } = await disbandTeamFn(req)
  return data
}

export interface ApplyToTeamRequest { teamId: string; pitch?: string }
export interface ApplyToTeamResponse { applicationId: string; expiresAt: number }
const applyToTeamFn = httpsCallable<ApplyToTeamRequest, ApplyToTeamResponse>(functions, 'applyToTeam')
export async function callApplyToTeam(req: ApplyToTeamRequest): Promise<ApplyToTeamResponse> {
  const { data } = await applyToTeamFn(req)
  return data
}

export interface ApplicationActionRequest { applicationId: string }
export interface ApplicationActionResponse { status: 'approved' | 'declined' | 'noop' }
const approveApplicationFn = httpsCallable<ApplicationActionRequest, ApplicationActionResponse>(
  functions, 'approveApplication',
)
export async function callApproveApplication(req: ApplicationActionRequest): Promise<ApplicationActionResponse> {
  const { data } = await approveApplicationFn(req)
  return data
}
const declineApplicationFn = httpsCallable<ApplicationActionRequest, ApplicationActionResponse>(
  functions, 'declineApplication',
)
export async function callDeclineApplication(req: ApplicationActionRequest): Promise<ApplicationActionResponse> {
  const { data } = await declineApplicationFn(req)
  return data
}
const cancelApplicationFn = httpsCallable<ApplicationActionRequest, ApplicationActionResponse>(
  functions, 'cancelApplication',
)
export async function callCancelApplication(req: ApplicationActionRequest): Promise<ApplicationActionResponse> {
  const { data } = await cancelApplicationFn(req)
  return data
}

export interface TransferCaptainRequest { teamId: string; toNormalizedName: string }
export interface TransferCaptainResponse { ok: true }
const transferCaptainFn = httpsCallable<TransferCaptainRequest, TransferCaptainResponse>(
  functions, 'transferCaptain',
)
export async function callTransferCaptain(req: TransferCaptainRequest): Promise<TransferCaptainResponse> {
  const { data } = await transferCaptainFn(req)
  return data
}

export interface KickMemberRequest { teamId: string; normalizedName: string }
export interface KickMemberResponse { ok: true }
const kickMemberFn = httpsCallable<KickMemberRequest, KickMemberResponse>(functions, 'kickMember')
export async function callKickMember(req: KickMemberRequest): Promise<KickMemberResponse> {
  const { data } = await kickMemberFn(req)
  return data
}

export interface RenameTeamRequest { teamId: string; name: string; motto?: string }
export interface RenameTeamResponse { ok: true; name: string }
const renameTeamFn = httpsCallable<RenameTeamRequest, RenameTeamResponse>(functions, 'renameTeam')
export async function callRenameTeam(req: RenameTeamRequest): Promise<RenameTeamResponse> {
  const { data } = await renameTeamFn(req)
  return data
}

export interface RebadgeTeamRequest { teamId: string; badge: TeamBadge }
export interface RebadgeTeamResponse { ok: true }
const rebadgeTeamFn = httpsCallable<RebadgeTeamRequest, RebadgeTeamResponse>(functions, 'rebadgeTeam')
export async function callRebadgeTeam(req: RebadgeTeamRequest): Promise<RebadgeTeamResponse> {
  const { data } = await rebadgeTeamFn(req)
  return data
}

export interface PostTeamRecruitmentRequest { teamId: string }
export interface PostTeamRecruitmentResponse { ok: true }
const postTeamRecruitmentFn = httpsCallable<PostTeamRecruitmentRequest, PostTeamRecruitmentResponse>(
  functions, 'postTeamRecruitment',
)
export async function callPostTeamRecruitment(req: PostTeamRecruitmentRequest): Promise<PostTeamRecruitmentResponse> {
  const { data } = await postTeamRecruitmentFn(req)
  return data
}

export interface EquipAvatarRequest { avatar: TeamBadge }
export interface EquipAvatarResponse { ok: true; avatar: TeamBadge }
const equipAvatarFn = httpsCallable<EquipAvatarRequest, EquipAvatarResponse>(functions, 'equipAvatar')
export async function callEquipAvatar(req: EquipAvatarRequest): Promise<EquipAvatarResponse> {
  const { data } = await equipAvatarFn(req)
  return data
}

// P2.K Endgame Trainer — server-side dedupe + castle-point award.
export interface SubmitEndgameClearRequest {
  normalizedName: string
  sessionId: string
  lessonId: string
  positionLabel: string
}
export interface SubmitEndgameClearResponse {
  ok: true
  pointsAdded: number
  castlePoints: number
  clearedPositions: string[]
  lessonMasteredNow: boolean
}
const submitEndgameClearFn = httpsCallable<
  SubmitEndgameClearRequest,
  SubmitEndgameClearResponse
>(functions, 'submitEndgameClear')

// P2.J Opening Trainer — server-side dedupe + castle-point award.
export interface SubmitOpeningClearRequest {
  normalizedName: string
  sessionId: string
  openingId: string
  positionIndex: number
}
export interface SubmitOpeningClearResponse {
  ok: true
  pointsAdded: number
  castlePoints: number
  clearedIndexes: number[]
  lessonMasteredNow: boolean
}
const submitOpeningClearFn = httpsCallable<
  SubmitOpeningClearRequest,
  SubmitOpeningClearResponse
>(functions, 'submitOpeningClear')

// P2.H Weekly Tournament — Slice 2: pairing + result reporting.
export interface TournamentParticipant {
  normalizedName: string
  displayName: string
  registeredAt: number
}
export type PairingResult =
  | 'white-wins'
  | 'black-wins'
  | 'draw'
  | 'bye-white'
export interface Pairing {
  index: number
  white: string
  black: string
  result?: PairingResult
  reportedBy?: string
  reportedAt?: number
  /** P2.H Slice 4 — game room minted by the white player; both kids
   *  play through /r/{roomId}. */
  roomId?: string
  /** P2.H Slice 5 — opposing player flagged the reported result. */
  disputed?: {
    byNormalizedName: string
    at: number
    reason?: string
  }
  /** Admin override stamp. */
  overriddenBy?: {
    normalizedName: string
    at: number
    previousResult?: PairingResult
  }
}
export interface TournamentRound {
  index: number
  startedAt: number
  pairings: Pairing[]
}
export interface TournamentDoc {
  weekKey: string
  status: 'registration' | 'active' | 'closed'
  openedAt: number
  closesAt: number
  participants: TournamentParticipant[]
  rounds: TournamentRound[]
  winnerName?: string
  closedAt?: number
}
export const BYE_OPPONENT = '__bye__'
export interface GetCurrentTournamentResponse {
  ok: true
  tournament: TournamentDoc
}
export interface RegisterForTournamentRequest {
  normalizedName: string
  sessionId: string
}
export interface RegisterForTournamentResponse {
  ok: true
  tournament: TournamentDoc
  alreadyRegistered: boolean
}
export interface UnregisterFromTournamentRequest {
  normalizedName: string
  sessionId: string
}
export interface UnregisterFromTournamentResponse {
  ok: true
  tournament: TournamentDoc
  wasNotRegistered: boolean
}
export interface StartNextRoundRequest {
  normalizedName: string
  sessionId: string
}
export interface StartNextRoundResponse {
  ok: true
  tournament: TournamentDoc
}
export interface ReportTournamentResultRequest {
  normalizedName: string
  sessionId: string
  roundIndex: number
  pairingIndex: number
  result: Exclude<PairingResult, 'bye-white'>
}
export interface ReportTournamentResultResponse {
  ok: true
  tournament: TournamentDoc
}
export interface CloseTournamentRequest {
  normalizedName: string
  sessionId: string
}
export interface CloseTournamentResponse {
  ok: true
  tournament: TournamentDoc
  winnerName?: string
  yourCastlePoints?: number
}
export interface DisputeTournamentResultRequest {
  normalizedName: string
  sessionId: string
  roundIndex: number
  pairingIndex: number
  reason?: string
}
export interface DisputeTournamentResultResponse {
  ok: true
  tournament: TournamentDoc
}
export interface OverrideTournamentResultRequest {
  normalizedName: string
  sessionId: string
  roundIndex: number
  pairingIndex: number
  result: Exclude<PairingResult, 'bye-white'>
}
export interface OverrideTournamentResultResponse {
  ok: true
  tournament: TournamentDoc
}
const getCurrentTournamentFn = httpsCallable<
  Record<string, never>,
  GetCurrentTournamentResponse
>(functions, 'getCurrentTournament')
const registerForTournamentFn = httpsCallable<
  RegisterForTournamentRequest,
  RegisterForTournamentResponse
>(functions, 'registerForTournament')
const unregisterFromTournamentFn = httpsCallable<
  UnregisterFromTournamentRequest,
  UnregisterFromTournamentResponse
>(functions, 'unregisterFromTournament')
const startNextRoundFn = httpsCallable<
  StartNextRoundRequest,
  StartNextRoundResponse
>(functions, 'startNextRound')
const reportTournamentResultFn = httpsCallable<
  ReportTournamentResultRequest,
  ReportTournamentResultResponse
>(functions, 'reportTournamentResult')
const closeTournamentFn = httpsCallable<
  CloseTournamentRequest,
  CloseTournamentResponse
>(functions, 'closeTournament')

export interface CreateTournamentRoomRequest {
  normalizedName: string
  sessionId: string
  roundIndex: number
  pairingIndex: number
}
export interface CreateTournamentRoomResponse {
  ok: true
  roomId: string
}
const createTournamentRoomFn = httpsCallable<
  CreateTournamentRoomRequest,
  CreateTournamentRoomResponse
>(functions, 'createTournamentRoom')
const disputeTournamentResultFn = httpsCallable<
  DisputeTournamentResultRequest,
  DisputeTournamentResultResponse
>(functions, 'disputeTournamentResult')
const overrideTournamentResultFn = httpsCallable<
  OverrideTournamentResultRequest,
  OverrideTournamentResultResponse
>(functions, 'overrideTournamentResult')

export async function callGetNextPuzzle(
  req: GetNextPuzzleRequest,
): Promise<GetNextPuzzleResponse> {
  const { data } = await getNextPuzzleFn(req)
  return data
}
export async function callSubmitPuzzleAttempt(
  req: SubmitPuzzleAttemptRequest,
): Promise<SubmitPuzzleAttemptResponse> {
  const { data } = await submitPuzzleAttemptFn(req)
  return data
}
export async function callGetCalibrationSet(
  req: GetCalibrationSetRequest,
): Promise<GetCalibrationSetResponse> {
  const { data } = await getCalibrationSetFn(req)
  return data
}
export async function callSubmitCalibration(
  req: SubmitCalibrationRequest,
): Promise<SubmitCalibrationResponse> {
  const { data } = await submitCalibrationFn(req)
  return data
}
export async function callGetDailyFive(
  req: GetDailyFiveRequest,
): Promise<GetDailyFiveResponse> {
  const { data } = await getDailyFiveFn(req)
  return data
}
export async function callGetLegendsList(
  req: GetLegendsListRequest,
): Promise<GetLegendsListResponse> {
  const { data } = await getLegendsListFn(req)
  return data
}
export async function callGetMasterAtriumList(
  req: GetMasterAtriumListRequest,
): Promise<GetMasterAtriumListResponse> {
  const { data } = await getMasterAtriumListFn(req)
  return data
}
export async function callSubmitFeedback(
  req: SubmitFeedbackRequest,
): Promise<SubmitFeedbackResponse> {
  const { data } = await submitFeedbackFn(req)
  return data
}
export async function callMarkFeedbackRead(
  req: MarkFeedbackReadRequest,
): Promise<MarkFeedbackReadResponse> {
  const { data } = await markFeedbackReadFn(req)
  return data
}
export async function callDeleteFeedback(
  req: DeleteFeedbackRequest,
): Promise<DeleteFeedbackResponse> {
  const { data } = await deleteFeedbackFn(req)
  return data
}
export async function callAwardTutorialComplete(
  req: AwardTutorialCompleteRequest,
): Promise<AwardTutorialCompleteResponse> {
  const { data } = await awardTutorialCompleteFn(req)
  return data
}
export async function callPurchaseCosmetic(
  req: PurchaseCosmeticRequest,
): Promise<PurchaseCosmeticResponse> {
  const { data } = await purchaseCosmeticFn(req)
  return data
}
export async function callEquipCosmetic(
  req: EquipCosmeticRequest,
): Promise<EquipCosmeticResponse> {
  const { data } = await equipCosmeticFn(req)
  return data
}
export async function callSynthesizeStoryAudio(
  req: SynthesizeStoryAudioRequest,
): Promise<SynthesizeStoryAudioResponse> {
  const { data } = await synthesizeStoryAudioFn(req)
  return data
}
export async function callSubmitEndgameClear(
  req: SubmitEndgameClearRequest,
): Promise<SubmitEndgameClearResponse> {
  const { data } = await submitEndgameClearFn(req)
  return data
}
export async function callSubmitOpeningClear(
  req: SubmitOpeningClearRequest,
): Promise<SubmitOpeningClearResponse> {
  const { data } = await submitOpeningClearFn(req)
  return data
}
export async function callGetCurrentTournament(): Promise<GetCurrentTournamentResponse> {
  const { data } = await getCurrentTournamentFn({})
  return data
}
export async function callRegisterForTournament(
  req: RegisterForTournamentRequest,
): Promise<RegisterForTournamentResponse> {
  const { data } = await registerForTournamentFn(req)
  return data
}
export async function callUnregisterFromTournament(
  req: UnregisterFromTournamentRequest,
): Promise<UnregisterFromTournamentResponse> {
  const { data } = await unregisterFromTournamentFn(req)
  return data
}
export async function callStartNextRound(
  req: StartNextRoundRequest,
): Promise<StartNextRoundResponse> {
  const { data } = await startNextRoundFn(req)
  return data
}
export async function callReportTournamentResult(
  req: ReportTournamentResultRequest,
): Promise<ReportTournamentResultResponse> {
  const { data } = await reportTournamentResultFn(req)
  return data
}
export async function callCloseTournament(
  req: CloseTournamentRequest,
): Promise<CloseTournamentResponse> {
  const { data } = await closeTournamentFn(req)
  return data
}
export async function callCreateTournamentRoom(
  req: CreateTournamentRoomRequest,
): Promise<CreateTournamentRoomResponse> {
  const { data } = await createTournamentRoomFn(req)
  return data
}
export async function callDisputeTournamentResult(
  req: DisputeTournamentResultRequest,
): Promise<DisputeTournamentResultResponse> {
  const { data } = await disputeTournamentResultFn(req)
  return data
}
export async function callOverrideTournamentResult(
  req: OverrideTournamentResultRequest,
): Promise<OverrideTournamentResultResponse> {
  const { data } = await overrideTournamentResultFn(req)
  return data
}

// ─────────────────────────────────────────────────────────────────────────────
// Chess invitations (Phase B). User-to-user invites; server charges 5 CP at
// send time, room is spawned by respondInvite on accept (sender already paid).

import type { TimeControl } from '../clock/timeControl'

export interface SendInviteRequest {
  fromNormalizedName: string
  toNormalizedName: string
  timeControl: TimeControl | null
  /** Sender's equipped piece-set id; flows through to the spawned
   *  room's white.pieceSetId on accept. */
  pieceSetId?: string
  /** Game variant to spawn on accept. Omitted = 'chess' (default).
   *  Server enforces the wizard cost (10 ✦) when set to 'wizard'. */
  kind?: 'chess' | 'wizard'
}
export interface SendInviteResponse {
  ok: true
  inviteId: string
  expiresAt: number
}

export type InvitationStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'ignored'
  | 'cancelled'
  | 'expired'

export interface RespondInviteRequest {
  inviteId: string
  response: 'accept' | 'decline' | 'ignore'
  /** Accepter's equipped piece-set id; stamped onto the spawned room's
   *  black.pieceSetId. Ignored on decline / ignore. */
  pieceSetId?: string
}
export interface RespondInviteResponse {
  ok: true
  status: InvitationStatus
  roomId?: string
}

export interface CancelInviteRequest { inviteId: string }
export interface CancelInviteResponse { ok: true; status: InvitationStatus }

const sendInviteFn = httpsCallable<SendInviteRequest, SendInviteResponse>(functions, 'sendInvite')
const respondInviteFn = httpsCallable<RespondInviteRequest, RespondInviteResponse>(functions, 'respondInvite')
const cancelInviteFn = httpsCallable<CancelInviteRequest, CancelInviteResponse>(functions, 'cancelInvite')

export async function callSendInvite(req: SendInviteRequest): Promise<SendInviteResponse> {
  const { data } = await sendInviteFn(req)
  return data
}
export async function callRespondInvite(req: RespondInviteRequest): Promise<RespondInviteResponse> {
  const { data } = await respondInviteFn(req)
  return data
}
export async function callCancelInvite(req: CancelInviteRequest): Promise<CancelInviteResponse> {
  const { data } = await cancelInviteFn(req)
  return data
}

// Public profile read for the User Card popover.
export interface GetPublicProfileRequest {
  normalizedName: string
  /** Optional identity proof for tier resolution. callGetPublicProfile
   *  fills these from the active CastleIdentity automatically — callers
   *  don't normally need to supply them, but explicit values override. */
  selfNormalizedName?: string
  selfSessionId?: string
}
export type ProfileTitleRank = {
  id: 'apprentice' | 'adept' | 'sorcerer' | 'archmage'
  label: string
  threshold: number
}
export interface GetPublicProfileResponse {
  displayName: string
  normalizedName: string
  title: ProfileTitleRank | null
  castlePoints: number
  lifetimeEarned: number
  puzzlesSolved: number
  hasHalo: boolean
  hasCrown: boolean
  hasTournamentCrown: boolean
  hostId: 'lucy' | 'luca'
  currentLocation: LocationTag | null
  inGame: boolean
  chessRating: number | null
  chessRatingDelta: number | null
  chessGames: number
  bestPuzzleRating: number | null
  puzzleRatings: Record<string, number>
  matchesAi: number | null
  matchesLocal: number | null
  tournamentsEntered: number | null
  tournamentsBestPlacement: number | null
  booksRead: number | null
  quizCorrect: number | null
  quizAttempted: number | null
  /** Currently-equipped piece-set id. Always a concrete id (defaults to
   *  'classic' server-side when the guest has no cosmetics). The non-null
   *  guarantee is load-bearing: passing null/undefined to <Piece
   *  pieceSetIdOverride> makes it render the VIEWER's set, leaking the
   *  viewer's cosmetic state into the profile being inspected. */
  equippedPieceSet: string
  avatar: TeamBadge | null
  teams: Array<{
    teamId: string
    name: string
    badge: TeamBadge
    captain: boolean
  }>
  todaysFiveSolved: number | null
  todaysFiveTotal: number | null
  todaysFiveDone: boolean
  todaysFiveResults: Array<boolean | null> | null
  // Origin — tiered by viewerTier; see functions/src/castle/getPublicProfile.ts.
  firstCountry: string | null
  recentCountry: string | null
  joinedMonth: string | null
  onlineStatus: 'online' | 'today' | 'away'
  firstCity: string | null
  recentCity: string | null
  joinedAt: number | null
  lastSeenAt: number | null
  firstIp: string | null
  recentIp: string | null
  firstIpHash: string | null
  recentIpHash: string | null
  viewerTier: 'public' | 'self' | 'admin'
}

const getPublicProfileFn = httpsCallable<GetPublicProfileRequest, GetPublicProfileResponse>(
  functions,
  'getPublicProfile',
)
export async function callGetPublicProfile(
  req: GetPublicProfileRequest,
): Promise<GetPublicProfileResponse> {
  // Auto-attach identity proof so every caller gets correct tier
  // checks without having to thread the active CastleIdentity through.
  // Skip for bypass guests (no normalizedName) and when the caller
  // explicitly passes their own selfNormalizedName (e.g. tests).
  // Dynamic import avoids a circular dep with the castle module.
  let augmented: GetPublicProfileRequest = req
  if (!req.selfNormalizedName) {
    const { loadIdentity } = await import('../castle/identity')
    const id = loadIdentity()
    if (id && !id.isBypass && id.normalizedName && id.sessionId) {
      augmented = {
        ...req,
        selfNormalizedName: id.normalizedName,
        selfSessionId: id.sessionId,
      }
    }
  }
  const { data } = await getPublicProfileFn(augmented)
  return data
}

