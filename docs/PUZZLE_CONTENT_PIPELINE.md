# Puzzle Content Pipeline

## Purpose

Power Up Chess should include a Puzzle Garden where Ada can practice tactics through beautiful, encouraging, bite-sized challenges.

The user may provide books and references under [books_and_references](books_and_references/README.md), including large EPUB puzzle books. This document describes how to convert usable material into structured puzzle data.

## Important Rights Constraint

Chess positions and facts may not always be protected in the same way as expressive text, but books, explanations, diagrams, selection, arrangement, and commentary can be protected by copyright.

Before using a book in a deployed product, confirm that one of the following is true:
- The material is public domain.
- The user owns rights to use it.
- The license permits this use.
- The content is only used privately and not distributed publicly, subject to legal review.
- The puzzles are transformed into independently authored records with original explanations and rights review.

This is not legal advice. Treat rights clearance as a product requirement before public release.

Official reference:
- U.S. Copyright Office basics: https://www.copyright.gov/what-is-copyright/

## Source Types

Supported source candidates:
- User-provided books in `docs/books_and_references/`.
- `Chess: 5334 Problems, Combinations, and Games` as the current strongest Puzzle Garden candidate after rights review.
- Public-domain chess books.
- Licensed puzzle collections.
- Manually created puzzles.
- Game-derived puzzles from recorded games, if rights and database terms allow it.

## Normalized Puzzle Format

Each puzzle should become a structured record:

```json
{
  "id": "source-slug-000001",
  "fen": "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
  "sideToMove": "w",
  "solution": ["Bb5"],
  "motifs": ["development", "pin"],
  "difficulty": 350,
  "source": {
    "title": "Example Source",
    "page": 12,
    "rightsStatus": "needs_review"
  },
  "explanation": "White develops the bishop and pins the knight."
}
```

## Import Stages

### Stage 1: Extract

Input:
- EPUB file.

Output:
- Raw text.
- Embedded images.
- Page or section markers when available.

Notes:
- EPUB structure varies widely.
- Some chess diagrams may be images only.
- OCR may be needed for image-based diagrams.

### Stage 2: Detect Chess Content

Detect:
- FEN strings.
- Algebraic notation.
- Diagram coordinates.
- Problem numbers.
- Side to move.
- Mate-in-N labels.
- Solution sections.

### Stage 3: Normalize

Convert each problem into:
- FEN.
- Side to move.
- Solution line.
- Motif tags.
- Difficulty estimate.
- Source metadata.

### Stage 4: Validate

Use chess rules and engine checks:
- FEN is legal.
- Side to move is correct.
- Solution moves are legal.
- Claimed mate or tactic is real.
- Engine agrees with the solution.

### Stage 5: Rewrite Explanations

Do not copy book explanations into the app unless licensed.

Instead:
- Generate original child-friendly explanations in the selected Lucy or Luca host voice.
- Keep them short.
- Check that they match the engine-confirmed solution.

### Stage 6: Review

Human review queue:
- Rights status.
- Puzzle correctness.
- Difficulty.
- Explanation quality.
- Suitability for Ada's level.

### Stage 7: Publish

Only publish puzzles with:
- Valid FEN.
- Valid solution.
- Approved rights status.
- Child-friendly explanation.
- Difficulty tag.

## Puzzle Difficulty For Ada

Ada is currently around 300-500 strength, so early puzzles should emphasize:
- One-move tactics.
- Loose pieces.
- Simple forks.
- Simple pins.
- Basic mates.
- Safe captures.
- Checks, captures, threats.

Avoid early overuse of:
- Long forced lines.
- Quiet defensive resources.
- Complex endgame studies.
- Opening traps without explanation.

## Hint Ladder

Each puzzle can have three hints:

1. Gentle direction.
   Example: "Look for checks first."

2. Tactical clue.
   Example: "The knight can attack two important pieces."

3. Near-solution clue.
   Example: "Try moving the knight to a square where it checks the king and attacks the rook."

## Output Files

Suggested local data files:
- `data/puzzles/sources.json`
- `data/puzzles/puzzles.json`
- `data/puzzles/puzzle_attempt_schema.json`

These files should not include copyrighted source text unless the license allows it.
