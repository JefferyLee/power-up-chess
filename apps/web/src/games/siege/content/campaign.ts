import type { MapDef } from '../sim/types'
import { beekeepersField } from './maps/beekeepers-field'
import { courtyardGate } from './maps/courtyard-gate'
import { darkThrone } from './maps/dark-throne'
import { forestPath } from './maps/forest-path'
import { frostChapel } from './maps/frost-chapel'
import { frozenLake } from './maps/frozen-lake'
import { ironMine } from './maps/iron-mine'
import { kitchenGarden } from './maps/kitchen-garden'
import { lavaSteps } from './maps/lava-steps'
import { oldBridge } from './maps/old-bridge'
import { shadowHall } from './maps/shadow-hall'
import { throneApproach } from './maps/throne-approach'

/** The 12 campaign maps in order (docs/SIEGE_DESIGN.md §6). */
export const CAMPAIGN: MapDef[] = [
  courtyardGate,
  kitchenGarden,
  oldBridge,
  forestPath,
  beekeepersField,
  ironMine,
  frozenLake,
  frostChapel,
  lavaSteps,
  shadowHall,
  throneApproach,
  darkThrone,
].sort((a, b) => a.order - b.order)
