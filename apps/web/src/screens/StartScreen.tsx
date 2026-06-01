import { useState } from 'react'
import { HOSTS, type HostId } from '../hosts/hosts'
import './StartScreen.css'

interface Props {
  onStartLocal: (config: { hostId: HostId; whiteName: string; blackName: string }) => void
}

export function StartScreen({ onStartLocal }: Props) {
  const [hostId, setHostId] = useState<HostId>('lucy')
  const [whiteName, setWhiteName] = useState('Ada')
  const [blackName, setBlackName] = useState('Friend')

  const canStart = whiteName.trim().length > 0 && blackName.trim().length > 0

  return (
    <div className="puc-start">
      <div className="puc-start__inner">
        <header className="puc-start__hero">
          <h1 className="puc-start__title">Power Up Chess</h1>
          <p className="puc-start__subtitle">A brave little forest, a real chess board, and a host who is glad you came.</p>
        </header>

        <section className="puc-start__panel" aria-labelledby="puc-start-host">
          <h2 id="puc-start-host" className="puc-start__panel-title">Pick a host</h2>
          <div className="puc-start__hosts">
            {(Object.values(HOSTS)).map((h) => (
              <button
                key={h.id}
                type="button"
                className={`puc-start__host ${hostId === h.id ? 'puc-start__host--selected' : ''}`}
                onClick={() => setHostId(h.id)}
                aria-pressed={hostId === h.id}
              >
                <span className="puc-start__host-name">{h.name}</span>
                <span className="puc-start__host-blurb">{h.blurb}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="puc-start__panel" aria-labelledby="puc-start-players">
          <h2 id="puc-start-players" className="puc-start__panel-title">Who is playing?</h2>
          <div className="puc-start__players">
            <label className="puc-start__player">
              <span className="puc-start__player-label">White</span>
              <input
                type="text"
                value={whiteName}
                onChange={(e) => setWhiteName(e.target.value)}
                maxLength={24}
                autoComplete="off"
              />
            </label>
            <label className="puc-start__player">
              <span className="puc-start__player-label">Black</span>
              <input
                type="text"
                value={blackName}
                onChange={(e) => setBlackName(e.target.value)}
                maxLength={24}
                autoComplete="off"
              />
            </label>
          </div>
        </section>

        <button
          type="button"
          className="puc-start__cta"
          disabled={!canStart}
          onClick={() => onStartLocal({ hostId, whiteName: whiteName.trim(), blackName: blackName.trim() })}
        >
          Start local game
        </button>

        <p className="puc-start__note">Online private rooms arrive in the next milestone.</p>
      </div>
    </div>
  )
}
