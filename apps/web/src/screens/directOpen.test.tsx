// @vitest-environment jsdom
// Local Chess and Practice opened by address (no Hall state): sign-in and
// the gate still apply, the clock is picked in place, then the game starts.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { CastleIdentity } from '../castle/identity'

const castle = vi.hoisted(() => ({ identity: null as CastleIdentity | null }))
vi.mock('../castle/useCastle', () => ({ useCastle: () => ({ identity: castle.identity }) }))
vi.mock('./TimeControlDialog', () => ({
  TimeControlDialog: ({ onConfirm, onCancel }: { onConfirm: (p: unknown) => void; onCancel: () => void }) => (
    <div data-testid="clock-dialog">
      <button onClick={() => onConfirm({ value: { initialSeconds: 600, incrementSeconds: 0 } })}>ten minutes</button>
      <button onClick={onCancel}>never mind</button>
    </div>
  ),
}))
vi.mock('./LocalGameScreen', () => ({
  LocalGameScreen: (p: { whiteName: string; blackName: string }) => <div data-testid="local-game">{p.whiteName} vs {p.blackName}</div>,
}))
vi.mock('./AiPracticeScreen', () => ({
  AiPracticeScreen: (p: { playerName: string; difficultyId: string }) => <div data-testid="ai-game">{p.playerName} · {p.difficultyId}</div>,
}))

import { LocalGameRoute } from './LocalGameRoute'
import { AiPracticeRoute } from './AiPracticeRoute'

const ada: CastleIdentity = { displayName: 'Ada', normalizedName: 'ada', castlePoints: 250, isBypass: false, isFirstVisit: false }

function open(path: '/local' | '/ai') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<div data-testid="hall" />} />
        <Route path="/local" element={<LocalGameRoute />} />
        <Route path="/ai" element={<AiPracticeRoute />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  castle.identity = ada
})
afterEach(cleanup)

describe('Local Chess opened by address', () => {
  it('sends a guest who is not signed in to the gate', () => {
    castle.identity = null
    open('/local')
    expect(screen.getByTestId('hall')).toBeTruthy()
  })
  it('asks for the clock, then starts the game as the Hall would', () => {
    open('/local')
    fireEvent.click(screen.getByText('ten minutes'))
    expect(screen.getByTestId('local-game').textContent).toBe('Ada vs Friend')
  })
  it('goes back to the Hall when the clock dialog is dismissed', () => {
    open('/local')
    fireEvent.click(screen.getByText('never mind'))
    expect(screen.getByTestId('hall')).toBeTruthy()
  })
})

describe('Practice opened by address', () => {
  it('keeps the 200-point gate: a locked guest lands in the Hall', () => {
    castle.identity = { ...ada, castlePoints: 120 }
    open('/ai')
    expect(screen.getByTestId('hall')).toBeTruthy()
    expect(screen.queryByTestId('clock-dialog')).toBeNull()
  })
  it('asks for the clock, then starts practice at the saved difficulty', () => {
    open('/ai')
    fireEvent.click(screen.getByText('ten minutes'))
    expect(screen.getByTestId('ai-game').textContent).toBe('Ada · beginner')
  })
})
