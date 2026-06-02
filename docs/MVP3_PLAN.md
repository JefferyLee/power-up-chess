# MVP3 — Next Steps Plan

Adopted 2026-06-02 after a full-project review. Slots into the
roadmap after the MVP2 castle / hall / puzzles / wizard / feedback /
sign work completes.

The throughline: the project's stated purpose is **helping kids learn
chess**. Most of what's been built so far is the *home* for that
learning (gate, hall, social pulse, identity, puzzles, leaderboards).
MVP3 finishes the actual *teaching* layer that sits on top — basics
tutorial, mobile polish, cosmetics economy, story library, and
piece-aware side games — without compromising the safety / community
posture already in place.

## Scope (locked)

### P0 — fundamentals, 1-2 weeks

#### A. Chess Basics Tutorial — 2-3 days
New `/learn` route. 5 short interactive lessons:
1. Board + piece basics (how each piece moves)
2. Captures + check
3. Checkmate (back-rank, fool's mate, scholar's mate)
4. Special moves (castling, en passant, promotion)
5. Opening tips (control the centre, develop minor pieces, king safety)

Entry: first-time Hall visit triggers Lucy/Luca to ask
*"First time playing chess? Let me show you."* Skippable. ~5 min total.
Completion reward: 50 castle points + Apprentice title (already exists).
Hall surface: prominent `📖 Learn the basics` card.

Re-uses: `Board`, `ChessGame`, host commentary engine.
New: lesson runner with arrow/highlight overlays, lesson script
schema, progress field on guest doc (`learnedBasicsAt: number`).

#### B. Mobile responsive — pass 2 — 1-2 days
Systematic sweep of every screen at 320 / 375 / 414 / 768 px:
- PlotScreen sidebar
- LeaderboardScreen two-column
- AiPracticeScreen + LocalGameScreen
- Forest Adventure
- Wizard Duel board

Touch-target audit (≥44 px). Spot-check on iPhone SE, iPhone 14, iPad
mini in the iOS sim or real devices.

#### C. Small carry-ons (interleave)
- Refactor `LegendsHallScreen` + `MasterAtriumScreen` into a shared
  museum component (kill the copy-paste).
- Promote *Today's Five* card to more prominent garden placement.

### P1 — depth + delight, 3-4 weeks

#### D. Cosmetics Shop — 3-4 days (Ada's suggestion)
Import lichess piece-set SVGs (CC-licensed) — 10+ themes including
the "sword-on-the-bishop" fantasy set Ada asked for.

New `/shop` route. Castle-points pricing:
- Default sets: free
- Common (cburnett, merida): ~200 pts
- Rare (fantasy, kosal): ~500 pts
- Master (animated / glow effects): ~1000 pts

Store `cosmetics.pieceSet` on guest doc. Every chess surface
(Local, AI, Online, Wizard, Puzzle, Legends, Master) reads it.

Hall side panel gets a `🎨 Theme shop` link.

#### E. Asset polish — 3-5 days
Free sources (verified):
- **lichess-org/lila** GitHub for piece SVGs (CC0/GPL)
- **Kenney.nl** for game UI, badges, icons (CC0)
- **game-icons.net** for plot icons (CC BY 3.0)
- **Pixabay** + **Freesound** for SFX (Pixabay License / CC0)
- **FLUX.1 schnell** on Replicate for one-off host poses (50/day free)
- **DiceBear** API for cosmetic avatar variations

Concrete adds:
- ~8 new SFX: small-solve, big-solve, streak, level-up, badge-earned,
  shop-purchase, shop-browse, plot-enter
- Lucy/Luca 3 mood poses each (happy / thinking / cheering) via FLUX
- 6 plot SVG icons replacing the current emoji
- Hall atmospheric details: SVG fireplace flames, window animation

#### F. Story Library — 2 days
`/library` route exposing all 108 extracted stories (currently only
2 are bundled into ambient rotation).

Group by host then by chapter. Click → expand full text + optional
Web-Speech-API TTS read-aloud. No quizzes — kids should be able to
just sit and read.

This rescues the work already done in `tools/story-import/`.

#### G. "Knight's Hop" — Forest reboot — 1 week (Ada's direction)
Re-skin the existing Forest Adventure engine so the player IS a chess
piece. Start as a pawn auto-running through a column grid; only
in-game move available is the piece's native motion. Obstacles match
what that piece can dodge.

Each level promotes upward: pawn → knight → bishop → rook → queen.
Different obstacles favour different pieces.

Teaches piece movement viscerally via muscle memory rather than text.

### P2 — sustained engagement, 1-2 months

#### H. Weekly Tournament — 3 days
Monday open, Sunday close. Swiss pairing. Entry requires 50+ puzzles
solved that week (encourages steady practice). Winner gets a special
crown for one week + 100 pts.

#### I. Voice acting for hosts
ElevenLabs free tier (10k chars/mo) or Web Speech API fallback. Lucy
and Luca read stories + their game commentary. TTS is good enough
that the experience leap is large vs pure text.

#### J. Opening Trainer
Italian, Ruy López, Queen's Gambit. 10-15 key positions each with
guided "find the principled move" prompts.

#### K. Endgame Trainer
- K+P vs K opposition
- K+R vs K mating technique
- K+Q vs K
- Basic pawn endings

#### L. PWA / installable
Manifest + service worker. "Add to home screen" works. Offline puzzle
cache (~50 puzzles).

## Out of scope (decided)

- **Parent dashboard** — not pursuing commercialization in this phase.
- **Removing Wizard Duel / Forest Adventure** — Ada explicitly likes
  them as "cool games to rest between learning." The Knight's Hop
  reskin (G) directs that energy toward chess education.
- **Public matchmaking** — locked out for child-safety reasons.
- **Real authentication** — magic-word identity is the right model.

## Priority table

| Phase | Item | Effort | Rationale |
|---|---|---|---|
| P0 | Chess Basics Tutorial | 2-3 d | Biggest gap vs stated purpose |
| P0 | Mobile polish v2 | 1-2 d | Target audience is on phones / iPads |
| P1 | Cosmetics Shop | 3-4 d | Closes economy loop; Ada-requested |
| P1 | Asset polish | 3-5 d | Brings inside-castle visual up to gate quality |
| P1 | Story Library | 2 d | Activates 108 extracted stories already on disk |
| P1 | Knight's Hop | 1 wk | Ada-direction + actually teaches piece movement |
| P2 | Weekly Tournament | 3 d | Community / habit |
| P2 | Voice hosts | 2-3 d | Immersion jump |
| P2 | Opening trainer | 5-7 d | Completes learning path |
| P2 | Endgame trainer | 5-7 d | Completes learning path |
| P2 | PWA | 1-2 d | Feels like an app |

## Start order

1. P0.A Chess Basics Tutorial
2. P0.B Mobile polish v2
3. P1.D Cosmetics Shop (Ada-requested)
4. ...the rest in any order driven by feedback / energy
