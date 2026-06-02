// hostStoryAnswer — judges a user's guess at a story-quiz question.
//
// Atomically: marks the message as won (first correct answer only),
// increments the winner's castle points by 1 (non-bypass guests only),
// returns whether this caller was right plus the explanation if the
// quiz is now resolved.
//
// Rate-limit: 3 attempts per uid per quiz. Wrong guesses count.

import { getFirestore } from 'firebase-admin/firestore'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import type { ChatMessageDoc, QuizState } from './chatTypes'
import { normalizeAnswer } from './storyQuiz'
import type { GuestDoc } from './types'

const MAX_ATTEMPTS = 3
const ANSWER_AWARD = 1

interface Request {
  messageId: string
  answer: string
}
type Response =
  | {
      status: 'correct'
      attemptsUsed: number
      explanation: string
      earnedPoint: boolean
      castlePoints: number
    }
  | {
      status: 'wrong'
      attemptsUsed: number
      attemptsRemaining: number
    }
  | {
      status: 'already-won'
      winnerName: string
      explanation?: string
    }
  | {
      status: 'closed'
      explanation?: string
    }
  | {
      status: 'no-attempts-left'
      explanation?: string
    }

export const hostStoryAnswer = onCall<Request, Promise<Response>>(
  async (req) => {
    if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.')
    const uid = req.auth.uid
    const messageId = String(req.data?.messageId ?? '')
    const rawAnswer = String(req.data?.answer ?? '')
    if (!messageId) throw new HttpsError('invalid-argument', 'messageId required.')
    const guess = normalizeAnswer(rawAnswer)
    if (!guess) throw new HttpsError('invalid-argument', 'Empty answer.')

    const db = getFirestore()

    // Resolve caller identity from the same shadow doc postChat uses.
    const idSnap = await db.doc(`chat_identity/${uid}`).get()
    const idData = idSnap.data() as
      | { displayName: string; normalizedName: string; isBypass: boolean }
      | undefined
    if (!idData) throw new HttpsError('failed-precondition', 'Set presence before answering.')

    const msgRef = db.doc(`lobby/messages/items/${messageId}`)
    const keyRef = db.doc(`story_quiz_keys/${messageId}`)
    const attemptRef = db.doc(`story_quiz_attempts/${messageId}/uids/${uid}`)

    // Pre-resolve the guest ref so we can read it inside the transaction's
    // read phase (Firestore requires ALL reads before ANY writes).
    const guestRef = !idData.isBypass && idData.normalizedName
      ? db.doc(`guests/${idData.normalizedName}`)
      : null

    return db.runTransaction(async (tx) => {
      // ── Phase 1: all reads ──────────────────────────────────────────
      const [msgSnap, keySnap, attemptSnap, guestSnap] = await Promise.all([
        tx.get(msgRef),
        tx.get(keyRef),
        tx.get(attemptRef),
        guestRef ? tx.get(guestRef) : Promise.resolve(null),
      ])
      if (!msgSnap.exists) throw new HttpsError('not-found', 'Message not found.')
      const msg = msgSnap.data() as ChatMessageDoc
      const quiz = msg.quiz
      if (!quiz) throw new HttpsError('failed-precondition', 'This message has no quiz.')
      if (!keySnap.exists) throw new HttpsError('failed-precondition', 'Quiz key missing.')
      const keyData = keySnap.data() as { acceptedAnswers: string[]; explanation: string }

      if (quiz.state === 'won') {
        return {
          status: 'already-won' as const,
          winnerName: quiz.winnerName ?? '',
          explanation: quiz.explanation,
        }
      }
      if (quiz.state === 'closed') {
        return { status: 'closed' as const, explanation: quiz.explanation }
      }

      const attempts = (attemptSnap.data() as { count?: number } | undefined)?.count ?? 0
      if (attempts >= MAX_ATTEMPTS) {
        return { status: 'no-attempts-left' as const, explanation: undefined }
      }

      const correct = keyData.acceptedAnswers.some((a) => a === guess)
      const nextAttempts = attempts + 1

      // ── Phase 2: all writes ─────────────────────────────────────────
      tx.set(attemptRef, { count: nextAttempts, lastAt: Date.now() }, { merge: true })

      if (!correct) {
        return {
          status: 'wrong' as const,
          attemptsUsed: nextAttempts,
          attemptsRemaining: MAX_ATTEMPTS - nextAttempts,
        }
      }

      // Correct — claim the win + award the point.
      let earnedPoint = false
      let castlePoints = 0
      if (guestRef && guestSnap?.exists) {
        const guest = guestSnap.data() as GuestDoc
        if (guest.uids.includes(uid)) {
          castlePoints = guest.castlePoints + ANSWER_AWARD
          // Lifetime-earn lazy migration (Phase D).
          const lifetimePrev = guest.lifetimeEarned ?? Math.max(0, guest.castlePoints)
          tx.update(guestRef, {
            castlePoints,
            lifetimeEarned: lifetimePrev + ANSWER_AWARD,
          })
          earnedPoint = true
        }
      }

      const updatedQuiz: QuizState = {
        question: quiz.question,
        state: 'won',
        winnerName: idData.displayName,
        winnerUid: uid,
        earnedPoint,
        explanation: keyData.explanation,
        resolvedAt: Date.now(),
      }
      tx.update(msgRef, { quiz: updatedQuiz })

      return {
        status: 'correct' as const,
        attemptsUsed: nextAttempts,
        explanation: keyData.explanation,
        earnedPoint,
        castlePoints,
      }
    })
  },
)
