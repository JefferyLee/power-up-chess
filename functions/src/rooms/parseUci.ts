// UCI move parser: "e2e4", "e7e8q" → {from, to, promotion?}.

const SQUARE = /^[a-h][1-8]$/

export interface ParsedUci {
  from: string
  to: string
  promotion?: 'q' | 'r' | 'b' | 'n'
}

export function parseUci(uci: string): ParsedUci | null {
  if (typeof uci !== 'string') return null
  if (uci.length !== 4 && uci.length !== 5) return null
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  if (!SQUARE.test(from) || !SQUARE.test(to)) return null
  if (uci.length === 5) {
    const p = uci[4]
    if (p !== 'q' && p !== 'r' && p !== 'b' && p !== 'n') return null
    return { from, to, promotion: p }
  }
  return { from, to }
}
