// useIsNarrow — true when the viewport is at/below a breakpoint. Drives
// the Hall's desktop-rail vs mobile-stack decision (e.g. inline chat vs
// a bottom-sheet button).

import { useEffect, useState } from 'react'

export function useIsNarrow(maxWidthPx = 880): boolean {
  const query = `(max-width: ${maxWidthPx}px)`
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches,
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const onChange = () => setNarrow(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])
  return narrow
}
