// waitingRoomsFeed — the sanitised "rooms waiting for an opponent" list
// the Hall reads (castle_public/waitingRooms). Rebuilt every minute by
// heraldWaitingRooms from the `waiting` rooms it already scans.
//
// Room docs carry uids + normalized names, so clients may no longer LIST
// rooms / wizard_rooms (rules: get-only). Only what the door badge and
// chooser actually show goes in here: display name, clock, age.

export const WAITING_ROOMS_FEED_PATH = 'castle_public/waitingRooms'
/** Matches the old client-side listener cap. */
export const FEED_MAX_PER_KIND = 25

export interface WaitingRoomFeedRow {
  roomId: string
  hostDisplayName: string
  /** True when the host is a bypass guest (no profile to link to). */
  hostIsBypass: boolean
  createdAt: number
  /** Chess only — wizard duels run a fixed clock. */
  timeControl?: { initialMs: number; incrementMs: number } | null
}

export interface WaitingRoomsFeedDoc {
  rooms: WaitingRoomFeedRow[]
  wizardRooms: WaitingRoomFeedRow[]
  refreshedAt: number
}

/** The fields we read off a room / wizard_room doc. */
export interface RawWaitingRoom {
  id: string
  white?: { displayName?: string; normalizedName?: string }
  createdAt?: number
  timeControl?: { initialMs: number; incrementMs: number } | null
}

export function buildFeedRows(
  rooms: RawWaitingRoom[],
  kind: 'chess' | 'wizard',
): WaitingRoomFeedRow[] {
  const rows = rooms.map((d) => {
    const row: WaitingRoomFeedRow = {
      roomId: d.id,
      hostDisplayName: d.white?.displayName ?? 'Someone',
      hostIsBypass: !d.white?.normalizedName,
      createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
    }
    if (kind === 'chess') row.timeControl = d.timeControl ?? null
    return row
  })
  // Newest first — the most kid-facing room is "who just opened
  // something I could grab right now".
  rows.sort((a, b) => b.createdAt - a.createdAt)
  return rows.slice(0, FEED_MAX_PER_KIND)
}
