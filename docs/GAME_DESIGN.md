# Game Design

## Design Pillars

1. The rules are real chess.
2. Every meaningful success feels visible.
3. Feedback is kind, specific, and truthful.
4. The player should feel capable, not tested.
5. Magic, beauty, and sound should support learning.

## Power-Up Philosophy

Power-ups are a reward layer, not a separate rules system for standard chess.

In standard games:
- Power-ups do not change legal moves.
- Power-ups do not give unfair advantages.
- Power-ups do not affect the opponent.
- Power-ups can unlock animations, cards, review hints, and theme progress.

In practice and puzzle modes:
- Some power-ups may reveal hints.
- Some power-ups may replay the attacking line.
- Some power-ups may highlight danger squares.
- These should be clearly learning aids.

## Power-Up Card Ideas

### Capture Spark

Trigger: capture any piece.

Effect:
- Small animation.
- Shows captured piece value.
- The selected host gives a short comment.

Example copy:
"Nice capture, Ada. Your knight found a bright little path."

### Tactic Bloom

Trigger: win material through a tactic.

Effect:
- Flower or light burst.
- Shows motif if known: fork, pin, skewer, discovered attack, back-rank idea.

### Danger Vision

Trigger: earned from solving puzzles or playing strong moves.

Effect:
- In practice mode, highlights one piece that is under attack or one major threat.

### Replay Ribbon

Trigger: capture, tactic, checkmate, or brilliant move.

Effect:
- Replays the move sequence as a short theater animation.

### Crown Spark

Trigger: excellent move, checkmate, or rare milestone.

Effect:
- Adds progress toward the Queen of the World ceremony collection.

### Hint Sparkle

Trigger: earned in practice or puzzles.

Effect:
- Reveals a gentle hint.
- Should not be available in serious online games unless both players agree it is a training game.

## Move Feedback Intensity

### Ordinary Move

Visual:
- Small piece glow.

Selected host:
- One short positive sentence.

### Good Move

Visual:
- Brighter square trail.
- Small sound cue.

Selected host:
- Praise plus reason.

### Excellent Move

Visual:
- Board accent.
- Card reveal.

Selected host:
- Specific explanation.

### Brilliant Move

Visual:
- Full ceremony.
- Crown, flowers, light, fireworks.
- Optional title: "Queen of the Board" or "Royal Brilliant".

Selected host:
- Celebratory but specific explanation.
- Must explain why the move was strong.

### Mistake

Visual:
- Soft pause, no negative alarm.

Selected host:
- Gentle correction.
- One learning idea.

Example:
"That move has a brave idea, but your queen may become a target. Let's keep an eye on her next time."

## Host Selection

Power Up Chess has two twin hosts: Lucy and Luca.

Availability story:
- Sometimes Lucy is home.
- Sometimes Luca is home.
- Most of the time both are home.

Player choices:
- Lucy.
- Luca.
- Both.
- Surprise me.

MVP0 can start with Lucy or Luca. MVP1 should support all four choices.

When both hosts are selected:
- One host should lead.
- The second host may add short reactions after special moments.
- The pair should not over-talk or distract from the board.

## Queen of the World Ceremony

Trigger:
- Brilliant move.
- Checkmate after a strong attacking sequence.
- Major learning milestone.

Requirements:
- Rare enough to feel special.
- Engine-backed when triggered by move quality.
- Strong visual celebration.
- Copy should feel grand but still sincere.

Example copy:
"Ada, that was a royal move. You saw the hidden idea, protected your plan, and turned the whole board in your favor."

## Move Replay Theater

Purpose:
- Help the player understand attacks and captures.
- Make chess logic visible.

For captures:
- Show the attacking piece path.
- Highlight the captured piece.
- Show why the square was legal.
- Optionally show what the opponent was threatening.

For tactics:
- Replay the tactic line.
- Label the motif when known.

For checkmate:
- Highlight escape squares.
- Show defending pieces.
- Explain why the king cannot escape.

## Puzzle Garden

Purpose:
- Daily tactical practice in a magical setting.

Puzzle attributes:
- FEN.
- Side to move.
- Solution line.
- Motif.
- Difficulty.
- Source.
- Rights status.
- Explanation.
- Host voice variants when useful.

Recommended motifs for Ada's level:
- One-move checkmate.
- Hanging pieces.
- Forks.
- Pins.
- Skewers.
- Basic back-rank mate.
- Removing the defender.
- Simple discovered attack.

## Famous Women in Chess Moments

These are short, factual, optional learning cards.

Rules:
- Facts must be verified and sourced.
- No invented anecdotes.
- No current tournament news in MVP0/MVP1.
- Keep the tone inspiring without exaggerating.

Possible subjects:
- Judit Polgar.
- Hou Yifan.
- Vera Menchik.
- Nona Gaprindashvili.
- Maia Chiburdanidze.

## Ada Special Mode

Ada Special Mode should feel personal, not manipulative. The emotional frame should be "smart, brave chess player" rather than princess-centered fantasy.

Ideas:
- Lucy or Luca greets Ada with remembered progress.
- Personalized titles based on real achievements, such as "Brave Calculator", "Tactic Finder", or "Calm Defender".
- A private "Ada's Greatest Moves" gallery.
- A "Brave Try" collection for moments when Ada attempted a good idea even if the tactic did not fully work.
- Special ceremony copy for genuine milestones.
- Theme unlocks named after Ada's progress, such as "Ada's First Fork" or "Ada's Checkmate Garden".

Boundaries:
- Do not praise every move as amazing.
- Do not compare Ada negatively to others.
- Do not reveal personal data publicly.
