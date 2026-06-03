// Server-side piece-set registry.
//
// Source of truth for purchase pricing and "what sets exist". The
// client has a richer registry (with rendering data, blurbs, etc.)
// in apps/web/src/cosmetics/pieceSets.tsx — the prices here MUST match
// the client priceCp values, since the server is the trust boundary
// that validates points debits.

/** Sets that ship as free / always-owned. Equipping these never needs
 *  a purchase. */
export const FREE_PIECE_SETS = new Set<string>(['classic', 'outline'])

/** Purchasable sets keyed by id, with their castle-point price. Sets
 *  not in this map (and not in FREE_PIECE_SETS) are rejected by
 *  purchaseCosmetic / equipCosmetic. */
export const PURCHASE_REGISTRY: Record<string, { priceCp: number }> = {
  cburnett: { priceCp: 200 },
  fantasy: { priceCp: 500 },
  animated: { priceCp: 1000 },
  stone: { priceCp: 1000 },
  chibi: { priceCp: 1500 },
  hd: { priceCp: 3000 },
}

export function isKnownPieceSet(id: string): boolean {
  return FREE_PIECE_SETS.has(id) || id in PURCHASE_REGISTRY
}

export function priceFor(id: string): number | null {
  return PURCHASE_REGISTRY[id]?.priceCp ?? null
}

/** Normalise an untrusted client-supplied piece-set id. Returns undefined
 *  if the id is missing, empty, or not a known set — callers should let
 *  the viewer's local default decide in that case. */
export function sanitisePieceSetId(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  if (!trimmed) return undefined
  return isKnownPieceSet(trimmed) ? trimmed : undefined
}
