// Hook that shrinks the chess square below its "natural" desktop size
// when the viewport can't fit it. Returns the square edge in pixels.
//
// Pass the screen's natural max size (typically 72 on big screens). On
// a phone where (viewport width / 8) is smaller, we use that smaller
// value so the 8-square board always fits horizontally. We also leave
// some vertical room for the page header, since most chess screens
// stack header + board + side panel.

import { useEffect, useState } from 'react'

/** Horizontal breathing room — keeps the board from hugging the screen edges. */
const SIDE_PADDING_PX = 16
/** Vertical chrome we reserve for the page header / labels above the board. */
const VERTICAL_CHROME_PX = 96
/** Boards smaller than this become unusable on touch — tap targets too small. */
const MIN_SQUARE_PX = 36

function computeSquareSize(maxSquarePx: number): number {
  if (typeof window === 'undefined') return maxSquarePx
  const wAvail = window.innerWidth - SIDE_PADDING_PX
  const hAvail = window.innerHeight - VERTICAL_CHROME_PX
  const fit = Math.floor(Math.min(wAvail, hAvail) / 8)
  return Math.max(MIN_SQUARE_PX, Math.min(maxSquarePx, fit))
}

export function useResponsiveSquareSize(maxSquarePx: number): number {
  const [size, setSize] = useState(() => computeSquareSize(maxSquarePx))
  useEffect(() => {
    const onResize = () => setSize(computeSquareSize(maxSquarePx))
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    // Catch any cases where the initial render happened before fonts/
    // viewport units settled (mobile address-bar reflow).
    onResize()
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [maxSquarePx])
  return size
}
