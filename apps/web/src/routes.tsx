// Route + Hall-door registry — the one table App.tsx turns into lazy
// <Route>s and HallScreen turns into door tiles.
//
// Every entry here is code-split: `load` is a dynamic import that App.tsx
// wraps in React.lazy, so a screen's code only ships when the kid opens
// its door. The castle gate (`/`) is the exception — it stays eager in
// App.tsx because it IS the first paint.
//
// Door order matters: HallScreen renders each section's doors in the
// order they appear in this table.

import type { ComponentType } from 'react'

export type DoorSection = 'learn' | 'play' | 'fun'

export interface DoorDef {
  section: DoorSection
  /** Emoji fallback when the door PNG hasn't shipped (see RoomDoor). */
  icon: string
  /** Door art key — /sprites/doors/<iconKey>.png. Also the door's identity. */
  iconKey: string
  /** `{host}` is replaced with the current host's name by HallScreen. */
  label: string
  blurb: string
  variant: 'oak' | 'mossy' | 'forest' | 'starry' | 'parchment'
  /** Castle points needed to open the door (checked against the current
   *  balance, not lifetime — see DECISIONS). Wizard's gate is the default;
   *  the live value comes from publicStats.wizardGateMinPoints. */
  gate?: number
  companionImg?: string
}

export interface RouteDef {
  path: string
  /** Screen name reported to analytics — never contains a dynamic id. */
  name: string
  load: () => Promise<{ default: ComponentType }>
  door?: DoorDef
}

/** Online Chess + Practice unlock at this many castle points. */
export const PLAY_GATE_POINTS = 200
/** Wizard's Duel gate when publicStats hasn't loaded — matches the
 *  server fallback in createWizardRoom / joinWizardRoom. */
export const WIZARD_GATE_DEFAULT = 1000

/** Adapt a named export to the `{ default }` shape React.lazy wants. */
function named<M extends Record<K, ComponentType>, K extends string>(
  load: () => Promise<M>,
  key: K,
): () => Promise<{ default: ComponentType }> {
  return () => load().then((m) => ({ default: m[key] }))
}

/** Wizard routes sit behind the magical-warning gate. */
function wizard(key: 'WizardDuelRoute' | 'WizardRoomRoute'): () => Promise<{ default: ComponentType }> {
  return () =>
    Promise.all([
      import('./games/wizard/WizardWarningGate'),
      import('./games/wizard/WizardDuelRoute'),
    ]).then(([gate, routes]) => {
      const Screen = routes[key]
      const Gated = () => (
        <gate.WizardWarningGate>
          <Screen />
        </gate.WizardWarningGate>
      )
      return { default: Gated }
    })
}

export const ROUTES: ReadonlyArray<RouteDef> = [
  // ── Learn chess ──
  {
    path: '/learn',
    name: '/learn',
    load: named(() => import('./learn/LearnRoute'), 'LearnRoute'),
    door: {
      section: 'learn',
      icon: '📖',
      iconKey: 'learn',
      label: 'Learn chess',
      blurb: "Five short lessons. Start here if you're new.",
      variant: 'mossy',
    },
  },
  { path: '/learn/:lessonId', name: 'lesson', load: named(() => import('./learn/LessonScreen'), 'LessonScreen') },
  {
    path: '/puzzles',
    name: '/puzzles',
    load: named(() => import('./puzzles/PuzzleGardenScreen'), 'PuzzleGardenScreen'),
    door: {
      section: 'learn',
      icon: '🌱',
      iconKey: 'puzzles',
      label: 'Puzzle Garden',
      blurb: 'Tactical puzzles, your own pace.',
      variant: 'mossy',
    },
  },
  { path: '/puzzles/calibration', name: '/puzzles/calibration', load: named(() => import('./puzzles/CalibrationScreen'), 'CalibrationScreen') },
  { path: '/puzzles/leaderboard', name: '/puzzles/leaderboard', load: named(() => import('./puzzles/LeaderboardScreen'), 'LeaderboardScreen') },
  { path: '/puzzles/daily', name: '/puzzles/daily', load: named(() => import('./puzzles/DailyFiveScreen'), 'DailyFiveScreen') },
  { path: '/puzzles/legends', name: '/puzzles/legends', load: named(() => import('./puzzles/LegendsHallScreen'), 'LegendsHallScreen') },
  { path: '/puzzles/master', name: '/puzzles/master', load: named(() => import('./puzzles/MasterAtriumScreen'), 'MasterAtriumScreen') },
  { path: '/puzzles/plot/:plot', name: 'puzzle_plot', load: named(() => import('./puzzles/PlotScreen'), 'PlotScreen') },
  {
    path: '/knights-hop',
    name: '/knights-hop',
    load: named(() => import('./games/knightshop/KnightsHopRoute'), 'KnightsHopRoute'),
    door: {
      section: 'learn',
      icon: '♞',
      iconKey: 'knights-hop',
      label: "Knight's Hop",
      blurb: 'Move like a real chess piece. Pawn + Knight levels.',
      variant: 'mossy',
    },
  },
  {
    path: '/endgame',
    name: '/endgame',
    load: named(() => import('./endgame/EndgameRoute'), 'EndgameRoute'),
    door: {
      section: 'learn',
      icon: '♔',
      iconKey: 'endgame',
      label: 'Endgame Drills',
      blurb: 'Classic checkmates against a stubborn defender.',
      variant: 'oak',
    },
  },
  { path: '/endgame/:id', name: 'endgame_lesson', load: named(() => import('./endgame/EndgameLessonScreen'), 'EndgameLessonScreen') },
  {
    path: '/openings',
    name: '/openings',
    load: named(() => import('./openings/OpeningsRoute'), 'OpeningsRoute'),
    door: {
      section: 'learn',
      icon: '♕',
      iconKey: 'opening',
      label: 'Opening Trainer',
      blurb: "Italian, Spanish, Queen's Gambit — principled moves.",
      variant: 'starry',
    },
  },
  { path: '/openings/:id', name: 'opening_lesson', load: named(() => import('./openings/OpeningLessonScreen'), 'OpeningLessonScreen') },

  // ── Play a game ──
  {
    path: '/r/:roomId',
    name: 'chess_room',
    load: named(() => import('./screens/OnlineGameScreen'), 'OnlineGameScreen'),
    door: {
      section: 'play',
      icon: '🏰',
      iconKey: 'online',
      label: 'Online Chess',
      blurb: 'Play a friend with a private link.',
      variant: 'oak',
      gate: PLAY_GATE_POINTS,
    },
  },
  {
    path: '/local',
    name: '/local',
    load: named(() => import('./screens/LocalGameRoute'), 'LocalGameRoute'),
    door: {
      section: 'play',
      icon: '👥',
      iconKey: 'local',
      label: 'Local Chess',
      blurb: 'Pass-and-play at one device.',
      variant: 'oak',
    },
  },
  {
    path: '/ai',
    name: '/ai',
    load: named(() => import('./screens/AiPracticeRoute'), 'AiPracticeRoute'),
    door: {
      section: 'play',
      icon: '♞',
      iconKey: 'practice-ai',
      label: 'Practice with {host}',
      blurb: 'Gentle AI sparring.',
      // HallScreen picks mossy for Lucy, starry for Luca.
      variant: 'mossy',
      gate: PLAY_GATE_POINTS,
    },
  },
  {
    path: '/tournament',
    name: '/tournament',
    load: named(() => import('./tournament/TournamentRoute'), 'TournamentRoute'),
    door: {
      section: 'play',
      icon: '🏆',
      iconKey: 'tournament',
      label: 'Weekly Tournament',
      blurb: 'Weekly Swiss — sign up, get paired, play your rounds.',
      variant: 'oak',
    },
  },
  {
    path: '/archive',
    name: '/archive',
    load: named(() => import('./screens/GameArchiveScreen'), 'GameArchiveScreen'),
    door: {
      section: 'play',
      icon: '📜',
      iconKey: 'archive',
      label: 'Hall of Games',
      blurb: 'Every online game, replay and review. NEW.',
      variant: 'parchment',
    },
  },
  { path: '/review', name: '/review', load: named(() => import('./screens/PostGameAnalysisScreen'), 'PostGameAnalysisScreen') },
  { path: '/history', name: '/history', load: named(() => import('./screens/HistoryScreen'), 'HistoryScreen') },
  { path: '/history/:name', name: 'player_games', load: named(() => import('./screens/PlayerGamesScreen'), 'PlayerGamesScreen') },

  // ── Take a break ──
  {
    path: '/forest',
    name: '/forest',
    load: named(() => import('./games/forest/ForestRoute'), 'ForestRoute'),
    door: {
      section: 'fun',
      icon: '🌲',
      iconKey: 'forest',
      label: 'Forest Adventure',
      blurb: 'Dodge red, collect gold, jump trees.',
      variant: 'forest',
    },
  },
  {
    path: '/wizard',
    name: '/wizard',
    load: wizard('WizardDuelRoute'),
    door: {
      section: 'fun',
      icon: '✨',
      iconKey: 'wizard',
      label: "Wizard's Duel",
      blurb: 'Chess with magic spells — for fun, not for chess practice.',
      variant: 'starry',
      gate: WIZARD_GATE_DEFAULT,
    },
  },
  { path: '/wizard/:roomId', name: 'wizard_room', load: wizard('WizardRoomRoute') },
  {
    path: '/shop',
    name: '/shop',
    load: named(() => import('./cosmetics/ShopScreen'), 'ShopScreen'),
    door: {
      section: 'fun',
      icon: '🎨',
      iconKey: 'shop',
      label: 'Theme Shop',
      blurb: 'Pick the look of your chess pieces — 8 sets to collect.',
      variant: 'parchment',
    },
  },
  {
    path: '/library',
    name: '/library',
    load: named(() => import('./library/LibraryRoute'), 'LibraryRoute'),
    door: {
      section: 'fun',
      icon: '📚',
      iconKey: 'library',
      label: 'The Library',
      blurb: "Chess stories + the Book Owl's reading lists.",
      variant: 'parchment',
      companionImg: '/sprites/hall/book-owl.png?v=1',
    },
  },
  {
    path: '/knights-run',
    name: '/knights-run',
    load: named(() => import('./games/knightsrun/KnightsRunRoute'), 'KnightsRunRoute'),
    door: {
      section: 'fun',
      icon: '🐎',
      iconKey: 'knights-run',
      label: "Knight's Run",
      blurb: 'Auto-runner — jump over pieces and rack up distance. NEW.',
      variant: 'starry',
    },
  },
  {
    path: '/arcade/tower-defense',
    name: '/arcade/tower-defense',
    load: named(() => import('./screens/TowerDefenseScreen'), 'TowerDefenseScreen'),
    door: {
      section: 'fun',
      icon: '⚔️',
      iconKey: 'tower-defense',
      label: 'Tower Defense',
      blurb: 'Your pieces defend the castle.',
      variant: 'oak',
    },
  },

  // ── Doorless ──
  { path: '/privacy', name: '/privacy', load: named(() => import('./screens/PrivacyScreen'), 'PrivacyScreen') },
  { path: '/me', name: '/me', load: named(() => import('./me/AdventurerPlaqueScreen'), 'AdventurerPlaqueScreen') },
  { path: '/team/:teamId', name: 'team', load: named(() => import('./teams/TeamPage'), 'TeamPage') },
]

/** Routes that have a Hall door, in door order. */
export const DOOR_ROUTES = ROUTES.filter(
  (r): r is RouteDef & { door: DoorDef } => r.door !== undefined,
)
