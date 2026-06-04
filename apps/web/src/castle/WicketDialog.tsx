// WicketDialog — the paper note that flies out of the wicket asking
// for name + magic word. Floats over the gate art. Owns the call to
// the castleEnter Cloud Function, the 3-strike retry, and the bypass
// link that appears after the third wrong attempt.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { callCastleBypass, callCastleEnter } from '../firebase/callables'
import { useCastle } from './useCastle'
import {
  clearIdentity,
  generateBypassName,
  hashMagicWord,
  loadCredential,
  normalizeName,
  type CastleCredential,
} from './identity'
import { useAuthUid } from '../auth/useAuthUid'
import './WicketDialog.css'

type Status =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'wrong'; remaining: number }
  | { kind: 'rate-limited'; retryAfterMs: number }
  | { kind: 'error'; message: string }

export function WicketDialog() {
  const navigate = useNavigate()
  const { signIn } = useCastle()
  const auth = useAuthUid()
  const [name, setName] = useState('')
  const [magicWord, setMagicWord] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [strikes, setStrikes] = useState(0)
  // Cached credential from a prior visit on this device (5-day TTL). When
  // present, the wicket renders a "Welcome back" path so the user can
  // re-enter without retyping their magic word.
  const [remembered, setRemembered] = useState<CastleCredential | null>(() => loadCredential())
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Autofocus the name field when the note appears — but only in the
  // manual-entry path; the welcome-back path doesn't need the name input.
  useEffect(() => {
    if (!remembered) nameInputRef.current?.focus()
  }, [remembered])

  const applyEnterResponse = useCallback(
    (
      res: Awaited<ReturnType<typeof callCastleEnter>>,
      credential: CastleCredential,
    ): boolean => {
      if (res.status === 'new' || res.status === 'returning') {
        // Server-pushed cosmetics are the source of truth on sign-in
        // — the localStorage cache could be stale (other device, etc).
        // Project them onto the identity so useCosmetics() reads the
        // canonical equipped set from the very first frame.
        const serverPieceSet = res.cosmetics?.pieceSet
        const serverAvatar = res.cosmetics?.avatar
        const cosmetics: { pieceSet?: string; avatar?: Record<string, unknown> } = {}
        if (serverPieceSet) cosmetics.pieceSet = serverPieceSet
        if (serverAvatar) cosmetics.avatar = serverAvatar as Record<string, unknown>
        signIn(
          {
            displayName: res.displayName,
            normalizedName: normalizeName(res.displayName),
            castlePoints: res.castlePoints,
            isBypass: false,
            isFirstVisit: res.status === 'new',
            sessionId: res.sessionId,
            ...(res.status === 'returning' && res.decayedBy > 0
              ? { lastDecay: { decayedBy: res.decayedBy, pointsBefore: res.pointsBeforeDecay } }
              : {}),
            ...(res.bonus && res.bonus.total > 0 ? { lastBonus: res.bonus } : {}),
            ...(Object.keys(cosmetics).length > 0 ? { cosmetics } : {}),
          },
          credential,
        )
        navigate('/', { replace: true })
        return true
      }
      return false
    },
    [signIn, navigate],
  )

  const handleQuickEnter = useCallback(async () => {
    if (!remembered || auth.status !== 'ready' || status.kind === 'submitting') return
    setStatus({ kind: 'submitting' })
    try {
      const res = await callCastleEnter({ name: remembered.displayName, hash: remembered.hash })
      if (applyEnterResponse(res, remembered)) return
      if (res.status === 'wrong-magic') {
        // Server hash no longer matches (account was reset elsewhere) —
        // drop the cached credential and fall back to manual entry.
        clearIdentity()
        setRemembered(null)
        setStatus({ kind: 'error', message: 'Your magic word looks different now — please type it again.' })
      } else if (res.status === 'rate-limited') {
        setStatus({ kind: 'rate-limited', retryAfterMs: res.retryAfterMs })
      } else if (res.status === 'invalid-input') {
        setStatus({ kind: 'error', message: res.reason })
      }
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [remembered, auth.status, status.kind, applyEnterResponse])

  const handleForgetMe = useCallback(() => {
    clearIdentity()
    setRemembered(null)
    setStatus({ kind: 'idle' })
    setStrikes(0)
    setName('')
    setMagicWord('')
  }, [])

  const canSubmit =
    auth.status === 'ready' &&
    name.trim().length >= 1 &&
    name.trim().length <= 20 &&
    magicWord.length >= 4 &&
    magicWord.length <= 30 &&
    status.kind !== 'submitting'

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      if (!canSubmit) return
      setStatus({ kind: 'submitting' })
      try {
        const trimmedName = name.trim()
        const hash = await hashMagicWord(trimmedName, magicWord)
        const res = await callCastleEnter({ name: trimmedName, hash })
        if (applyEnterResponse(res, { displayName: trimmedName, hash })) return
        if (res.status === 'wrong-magic') {
          setStrikes((n) => n + 1)
          setStatus({ kind: 'wrong', remaining: res.attemptsRemaining })
          setMagicWord('')
        } else if (res.status === 'rate-limited') {
          setStatus({ kind: 'rate-limited', retryAfterMs: res.retryAfterMs })
        } else if (res.status === 'invalid-input') {
          setStatus({ kind: 'error', message: res.reason })
        }
      } catch (err) {
        setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
      }
    },
    [canSubmit, name, magicWord, applyEnterResponse],
  )

  const handleBypass = useCallback(async () => {
    setStatus({ kind: 'submitting' })
    try {
      const res = await callCastleBypass()
      signIn({
        displayName: res.displayName,
        normalizedName: normalizeName(res.displayName),
        castlePoints: 0,
        isBypass: true,
        isFirstVisit: true,
      })
      navigate('/', { replace: true })
    } catch (err) {
      // If even bypass fails (e.g. offline), fall back to a fully local
      // throwaway — still lets the user play the no-network rooms.
      const fallback = generateBypassName()
      signIn({
        displayName: fallback,
        normalizedName: normalizeName(fallback),
        castlePoints: 0,
        isBypass: true,
        isFirstVisit: true,
      })
      navigate('/', { replace: true })
      void err
    }
  }, [signIn, navigate])

  const showBypass = strikes >= 3

  if (remembered) {
    return (
      <div className="puc-wicket" role="dialog" aria-label="Welcome back to the castle">
        <div className="puc-wicket__note">
          <div className="puc-wicket__note-pin" aria-hidden="true" />
          <h2 className="puc-wicket__title">A note from the host</h2>
          <p className="puc-wicket__hello">
            Welcome back, <strong>{remembered.displayName}</strong>! Ready to come in?
          </p>

          {status.kind === 'rate-limited' && (
            <p className="puc-wicket__error">
              Too many tries — wait about {Math.ceil(status.retryAfterMs / 1000)} seconds.
            </p>
          )}
          {status.kind === 'error' && (
            <p className="puc-wicket__error">{status.message}</p>
          )}

          <button
            type="button"
            className="puc-wicket__cta"
            onClick={() => { void handleQuickEnter() }}
            disabled={auth.status !== 'ready' || status.kind === 'submitting'}
          >
            {status.kind === 'submitting' ? 'Entering…' : 'Enter the castle'}
          </button>

          <button
            type="button"
            className="puc-wicket__bypass"
            onClick={handleForgetMe}
            disabled={status.kind === 'submitting'}
          >
            Not {remembered.displayName}? Tap here to tell me who you are →
          </button>

          <p className="puc-wicket__auth">
            {auth.status === 'loading' && 'Knocking the door…'}
            {auth.status === 'ready' && `Signed in · ${auth.uid.slice(0, 8)}`}
            {auth.status === 'error' && `Auth error: ${auth.error.message}`}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="puc-wicket" role="dialog" aria-label="Sign in to the castle">
      <form className="puc-wicket__note" onSubmit={handleSubmit}>
        <div className="puc-wicket__note-pin" aria-hidden="true" />
        <h2 className="puc-wicket__title">A note from the host</h2>
        <p className="puc-wicket__hello">
          Welcome to Power Up Castle! What should I call you, and what&apos;s your magic word?
        </p>

        <label className="puc-wicket__field">
          <span>Your name</span>
          <input
            ref={nameInputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            autoComplete="off"
            spellCheck={false}
            placeholder="e.g. Ada"
          />
        </label>

        <label className="puc-wicket__field">
          <span>Magic word</span>
          <input
            type="password"
            value={magicWord}
            onChange={(e) => setMagicWord(e.target.value)}
            minLength={4}
            maxLength={30}
            autoComplete="off"
            placeholder="4–30 characters"
          />
        </label>

        <p className="puc-wicket__hint">
          Your magic word is how I&apos;ll remember you next time. Pick something you can recall but don&apos;t share with anyone.
        </p>

        {status.kind === 'wrong' && (
          <p className="puc-wicket__error">
            Hmm, that doesn&apos;t look right.
            {status.remaining > 0
              ? ` You have ${status.remaining} ${status.remaining === 1 ? 'try' : 'tries'} left.`
              : ' Last try!'}
          </p>
        )}
        {status.kind === 'rate-limited' && (
          <p className="puc-wicket__error">
            Too many tries — wait about {Math.ceil(status.retryAfterMs / 1000)} seconds.
          </p>
        )}
        {status.kind === 'error' && (
          <p className="puc-wicket__error">{status.message}</p>
        )}

        <button
          type="submit"
          className="puc-wicket__cta"
          disabled={!canSubmit}
        >
          {status.kind === 'submitting' ? 'Entering…' : 'Enter the castle'}
        </button>

        {showBypass && (
          <button
            type="button"
            className="puc-wicket__bypass"
            onClick={handleBypass}
            disabled={status.kind === 'submitting'}
          >
            I have trouble with my magic word →
          </button>
        )}

        <p className="puc-wicket__auth">
          {auth.status === 'loading' && 'Knocking the door…'}
          {auth.status === 'ready' && `Signed in · ${auth.uid.slice(0, 8)}`}
          {auth.status === 'error' && `Auth error: ${auth.error.message}`}
        </p>
      </form>
    </div>
  )
}
