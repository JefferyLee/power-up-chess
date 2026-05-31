# Books And References

Last reviewed: 2026-05-31

This folder contains chess books and historical references that may support Power Up Chess product design, Lucy and Luca's chess knowledge, and future puzzle/content pipelines.

These files should be treated as source references, not automatically publishable app content. Before any text, diagrams, puzzles, explanations, or scans are used in a deployed product, their rights status must be reviewed.

Current inventory: 7 source files plus this README.

Top-level usage guidance is also summarized in [../REFERENCE_MATERIALS.md](../REFERENCE_MATERIALS.md).

## When To Read This Folder

Read these materials when working on:

- Puzzle Garden extraction or source planning.
- Lucy/Luca chess explanations.
- Ada-level curriculum planning.
- Famous player or chess history cards.
- Source metadata and rights review.

Do not process the full book files for ordinary UI work, styling changes, bug fixes, or unrelated technical tasks.

## Catalog

| File | Format | Size | Metadata Found | Recommended Use | Rights Status |
| --- | --- | ---: | --- | --- | --- |
| `Bobby Fischer Teaches Chess -- Bobby Fischer & Stuart Margulies & Don Mosenfelder -- 2006.pdf` | PDF | 17.06 MB | 345 pages; title and author metadata present | Beginner-friendly teaching reference; possible inspiration for tactical lesson style and checkmate training structure | Needs rights review before reuse |
| `Chess _ 5334 problems, combinations, and games -- Bruce Pandolfini, László Polgár -- New York, 2013 -- Hachette UK -- isbn13 9781603763356.epub` | EPUB | 335.05 MB | English EPUB; title `Chess`; creator metadata lists László Polgár; publisher Workman Publishing; 2013; ISBN metadata present; 11293 archive items | Major candidate source for Puzzle Garden extraction after rights review; likely useful for tactical progression, mate patterns, combinations, and game-based exercises | Needs rights review before reuse |
| `How to study chess on your own _ creating a plan that works -- Davorin Kuljasevic -- National Book Network, Lanham, 2021 -- New In Chess -- isbn13 9789056919313.epub` | EPUB | 5.74 MB | English EPUB; 450 archive items | Study-planning reference for curriculum design, practice routines, and learning progression | Needs rights review before reuse |
| `Libro de los juegos_ acedrex, dados e tablas _ ordenamiento -- Rey de Castilla Alfonso X, Raúl Orellana Calderón -- Biblioteca Castro, Madrid, 2007 -- isbn13 9788496452411.pdf` | PDF | 27.76 MB | 238 pages | Historical games and chess-culture reference; possible source for history/context after verification | Modern edition needs rights review |
| `My System & Chess Praxis _ His Landmark Classics in One -- Nimzowitsch, Aron;Sherwood, Robert -- 1st, 2016 -- New in Chess; New In Chess,Csi -- isbn13 9789056916596.epub` | EPUB | 36.02 MB | English EPUB; title, creator, publisher, ISBN metadata present; 1214 archive items | Strategic concept reference for later curriculum: prophylaxis, overprotection, open files, passed pawns, restraint | Needs rights review before reuse |
| `My system_ a chess treatise -- Aron Nimzowitsch, Aron Nimzovich -- 1930-01-01 -- Harcourt, Brace and company.pdf` | PDF | 17.88 MB | 330 pages; title and author metadata present | Older edition of a classic strategy text; useful for comparing concepts with the later combined edition | Needs public-domain/edition review |
| `The Art of the Game of Chess -- Ruy López; Andrew Soltis; Michael J_ McGrath -- Catholic University of America Press, Washington, D_C_, 2020 -- isbn13 9780813232812.pdf` | PDF | 2.02 MB | 318 pages; title and author metadata present | Modern English edition/translation of a classic Ruy López work; useful for verified history cards, opening history, and chess-culture context | Modern edition needs rights review |

## Suggested Project Uses

### 1. Host Knowledge Base

Use these books to identify chess concepts Lucy or Luca may explain later:

- Basic checkmate patterns.
- Tactical thinking.
- Study habits.
- Classic strategic terms.
- Historical chess context.

Lucy and Luca should only state historical or biographical facts that have been verified and attached to a source record.

### 2. Puzzle Garden Candidates

Some materials may contain positions or exercises that could inspire Puzzle Garden content.

The strongest current candidate is `Chess: 5334 Problems, Combinations, and Games`, because it appears to be a large puzzle/problem collection. It should still go through rights review and technical validation before any derived puzzle set is published.

Before importing any puzzle:

- Confirm the rights status of the source.
- Extract or reconstruct the position as FEN.
- Validate all solution moves with `chess.js`.
- Check the solution with Stockfish.
- Write an original child-friendly explanation in the selected host voice.
- Store source metadata with the puzzle.

Do not copy book explanations, diagrams, or scans into the app unless the license explicitly permits it.

### 3. Curriculum And Progression

The modern training books can help shape a learning path for Ada:

- Very short tactical tasks first.
- Pattern recognition before long calculation.
- Gentle review after each game.
- Repeated themes: checks, captures, threats, loose pieces, forks, pins, back-rank ideas.
- Later strategy: open files, piece activity, king safety, pawn structure.

### 4. History Cards

Historical works can support small "Chess Time Machine", "Lucy History Note", or "Luca History Note" cards.

The Ruy López and Alfonso X materials are especially relevant here, but modern editions/translations still need rights review before reuse.

Rules for these cards:

- Keep them short.
- Verify facts against approved sources.
- Avoid unsourced claims.
- Do not use current tournament news in MVP0/MVP1.
- Track source title, author/editor, year, and page or section when possible.

## Import Priority

Recommended order:

1. A small hand-authored puzzle set for MVP0 validation.
2. `Chess: 5334 Problems, Combinations, and Games` as the main future Puzzle Garden candidate after rights review.
3. `Bobby Fischer Teaches Chess` for beginner-facing teaching patterns.
4. `How to Study Chess on Your Own` for learning structure ideas.
5. `My System` materials for later intermediate strategy.
6. Ruy López and Alfonso X historical sources for carefully sourced history cards.

## Technical Notes

- PDFs can be inspected with Python `pypdf` in the bundled workspace runtime.
- EPUB files can be inspected as ZIP archives and parsed through their OPF metadata.
- The Polgár/Pandolfini EPUB is large, so any extraction process should be incremental and should avoid loading the entire archive into memory at once.
- Large source files should not be bundled into the production web app.
- Derived app-ready content should live in a separate normalized data folder, for example `data/puzzles/` or `data/chess_facts/`.

## Rights And Privacy Notes

- Treat all modern editions as protected until proven otherwise.
- Public-domain status can depend on country, edition, translation, editor notes, annotations, scans, and publication history.
- This folder may contain large and copyrighted files; avoid publishing it directly.
- For child-facing release, use only reviewed, age-appropriate derived content.
