import { useEffect, useState } from 'react'
import { StartScreen } from './screens/StartScreen'
import { LocalGameScreen } from './screens/LocalGameScreen'
import type { HostId } from './hosts/hosts'

type Route =
  | { kind: 'start' }
  | { kind: 'local'; hostId: HostId; whiteName: string; blackName: string }

export function App() {
  const [route, setRoute] = useState<Route>({ kind: 'start' })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'magic-forest')
  }, [])

  if (route.kind === 'start') {
    return (
      <StartScreen
        onStartLocal={({ hostId, whiteName, blackName }) =>
          setRoute({ kind: 'local', hostId, whiteName, blackName })
        }
      />
    )
  }

  return (
    <LocalGameScreen
      hostId={route.hostId}
      whiteName={route.whiteName}
      blackName={route.blackName}
      onExit={() => setRoute({ kind: 'start' })}
    />
  )
}
