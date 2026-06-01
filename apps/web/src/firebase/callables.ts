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
