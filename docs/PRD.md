# Product Requirements Document

## Product Name

Power Up Chess

## One-Sentence Vision

Power Up Chess helps Ada learn real chess through a beautiful, encouraging, power-up driven experience where every move can feel meaningful and every good idea is celebrated.

## Primary User

- Primary learner: Ada, age range 8-10, current chess strength around 300-500 rating.
- Secondary users: parents, friends, and future child learners.
- Initial product focus: Ada first. Wider public child-facing release is a later ambition after the core experience proves effective.

## Product Goals

- Make chess practice feel exciting, kind, and rewarding.
- Teach standard chess accurately without distorting the rules.
- Give immediate positive feedback after moves, especially good moves.
- Celebrate captures, tactics, checkmates, brilliant moves, and learning milestones.
- Build long-term motivation through match history, puzzle progress, collectible themes, and host memory.
- Provide engine-backed move evaluation so praise is meaningful and truthful.

## Non-Goals For Early Versions

- No current tournament news in MVP0 or MVP1.
- No public social network features.
- No gambling, loot boxes, paid random rewards, or manipulative reward loops.
- No rule-changing power-ups in standard chess games.
- No unsupported historical claims from Lucy or Luca.
- No parent dashboard in early versions unless the product expands beyond Ada.

## Core Product Principles

1. Real chess first.
   The board, legal moves, check, checkmate, draw rules, notation, and review should follow standard chess.

2. Encouragement must be honest.
   Lucy and Luca can be warm and enthusiastic, but they must not call a poor move brilliant or invent facts.

3. Praise should scale with meaning.
   Normal moves get light encouragement. Strong moves get larger visual rewards. Brilliant moves get rare, memorable ceremonies.

4. Ada should feel respected.
   Language should be accessible to an 8-10 year old, but not babyish.

5. Magic supports learning.
   Themes, flowers, sparkles, fireworks, cards, and ceremonies should make chess practice more emotionally rewarding while still helping the player understand the position.

## Game Modes

### Online Play

The long-term primary mode. Players can play standard chess against another person through a browser-based room or match system.

Early version expectation:
- Create or join a game.
- Share a private room link or code.
- Play legal standard chess.
- See move animations and capture celebrations.
- Receive Lucy or Luca comments and power-up rewards.
- Save game history.

### Local Two-Player

Two players share one device and take turns.

Purpose:
- Fast MVP validation.
- Useful for parent-child or friend games.
- No network dependency.

### Kind AI Practice

A friendly AI opponent that can adjust strength and optionally provide hints.

MVP1 or later:
- Difficulty tuned around beginner levels.
- Can intentionally choose instructive positions at low levels.
- Hint button can explain threats and candidate moves.
- AI should not pretend to be a human child.

### Puzzle Garden

A training mode built from chess puzzles extracted from provided materials, public-domain sources, licensed books, or manually created content.

The primary local source folder for provided materials is [books_and_references](books_and_references/README.md).

Features:
- Tactical positions.
- Hint ladder.
- Themed rewards after solving.
- Progress tracking by motif, difficulty, and accuracy.

### Post-Game Story Review

After a game, the selected host turns the game into a readable review:
- Best move moments.
- Brave ideas.
- Missed tactics.
- One or two improvement goals.
- A short story-like recap written for an 8-10 year old.

## Power-Up System

Power-ups are primarily emotional and educational rewards.

Power-ups may include:
- Animated reward cards.
- Sound effects.
- Board glow.
- Fireworks.
- Flower bursts.
- Crown ceremony.
- Unlock progress for themes and piece sets.
- Hints in practice or puzzle modes.
- Review tokens that reveal one useful idea after the game.

Power-ups should not alter legal moves or competitive fairness in normal online chess.

## Hosts: Lucy And Luca

Lucy and Luca are twin text-based chess hosts and coaches.

Product story:
- Sometimes Lucy is home.
- Sometimes Luca is home.
- Most of the time both are home.
- Ada or another player can choose Lucy, Luca, both, or a surprise host.

They should:
- Ask for the player's name before a game.
- Remember Ada's name and match history.
- Be especially warm and encouraging to Ada.
- Explain moves clearly.
- Know openings, middlegames, endgames, notation, famous chess players, and historical chess facts.
- Only state facts from approved, verifiable sources.
- Avoid current tournament news in MVP0/MVP1.
- Avoid false praise.
- Treat mistakes as learning opportunities.

Lucy should feel warm, bright, patient, and teacher-like.

Luca should feel like a smart, kind, energetic boy: friendly, playful, direct, adventure-minded, and tactically curious without teasing or roughness.

## Move Feedback Requirements

Every move can receive feedback, but feedback intensity should vary.

Move categories:
- Legal ordinary move: brief positive acknowledgement.
- Good move: clear praise and small visual reward.
- Excellent move: larger visual effect and concrete reason.
- Brilliant move: rare full-screen ceremony, engine-backed explanation, and a special title.
- Mistake: gentle, non-shaming comment plus a learning hint.
- Blunder: calm warning, optional review suggestion, no harsh language.

Brilliant move must be evaluated by a chess engine, not only by templates.

## Visual Themes

The product should eventually support multiple visual worlds:
- Fairy Garden
- Princess Academy
- Magic Forest
- Starry Universe
- Fine Art Chessboard

The first MVP0 theme should be Magic Forest.

Each theme should include:
- Board treatment.
- Piece set.
- Capture animation style.
- Power-up card style.
- Background ambience.
- Sound profile.
- Victory and brilliant move ceremony style.

## Match History And Learning Records

The product should record:
- Player name.
- Opponent name.
- Date and time.
- Color.
- Result.
- Selected host.
- PGN or move list.
- FEN snapshots if useful for review.
- Engine annotations.
- Captures and power-up moments.
- Puzzle progress.
- Common mistakes.
- Best recent achievements.

For MVP0, this can be local browser storage. For MVP1, this should be server-backed for online continuity.

## Reference Materials

Project reference materials live in [books_and_references](books_and_references/README.md).

Use these materials when building:
- Puzzle Garden source extraction.
- Host chess explanations.
- Ada-level curriculum planning.
- Sourced chess history cards.

Do not publish source book text, diagrams, scans, or long passages unless rights allow it. Derived child-facing content should be newly written and attached to source metadata.

## Success Metrics

Early qualitative metrics:
- Ada asks to play again.
- Ada understands why a praised move was good.
- Ada completes puzzles without frustration.
- Ada enjoys review instead of avoiding it.
- The selected host's tone feels kind but truthful.

Product metrics for later versions:
- Games completed per week.
- Puzzle attempts per week.
- Repeat play rate.
- Hint usage.
- Review completion rate.
- Improvement in puzzle accuracy.
- Reduction in repeated tactical mistakes.

## Safety And Privacy Notes

Because the target user is a child, the product should collect minimal personal data.

Early versions should prefer:
- First name or nickname only.
- Local storage for MVP0.
- No public profile.
- No open chat.
- No user-generated images.
- No public leaderboards.

If the product becomes available to many children, child privacy requirements must be reviewed before public launch. FTC COPPA guidance should be consulted for any service directed to children under 13 in the United States.

Reference:
- FTC COPPA overview: https://www.ftc.gov/business-guidance/privacy-security/childrens-privacy

## MVP0 Scope

MVP0 is a deployed playable prototype that validates the fun loop.

Must have:
- Browser-playable chessboard.
- Standard legal moves.
- Private room link online two-player mode across different computers.
- Local two-player mode.
- Basic online deployment.
- Magic Forest visual theme.
- Capture animation and reward.
- Basic Lucy/Luca text comments.
- Simple host selection: Lucy or Luca.
- Stockfish-backed post-game analysis.
- Basic win/checkmate celebration.
- Simple game history in local storage.

Should have if practical:
- Simple puzzle mode with a few hand-authored puzzles.
- Lightweight in-game engine labels when performance allows.

## MVP1 Scope

MVP1 is the first complete version of the intended product.

Must have:
- Online room-based play.
- Local two-player play.
- Engine-backed move classification.
- Lucy/Luca host feedback system.
- Host selection with Lucy, Luca, both, and surprise options.
- Power-up cards.
- Brilliant move ceremony.
- Move Replay Theater for captures and key moves.
- Puzzle Garden with imported or curated puzzles.
- Match history.
- Host-led Post-game Story Review.
- Multiple visual themes.
- Sound effects with mute control.

## Open Decisions

See [Open Questions](OPEN_QUESTIONS.md).
