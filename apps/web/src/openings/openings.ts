// Opening Trainer catalogue (P2.J Slice 1).
//
// Each opening is a short, hand-curated sequence of decision points.
// The player is asked to find the "principled move" — the textbook
// continuation a coach would teach. There is no engine validation:
// these are pedagogical lines, judged against a single expected UCI
// move per position. Branching variations land in Slice 2.

export interface OpeningPosition {
  /** Position from White's POV, White to move. */
  fen: string
  /** Context label shown above the board ("After 1.e4 e5 2.Nf3"). */
  context: string
  /** UCI of the expected principled move (4-5 chars). */
  expectedUci: string
  /** SAN of the expected move, for display ("Bc4"). */
  expectedSan: string
  /** First-fail hint — points at the right idea without giving the
   *  square away. */
  hint: string
  /** Shown after the correct move — the WHY. 1-2 short sentences. */
  explanation: string
}

export interface Opening {
  id: string
  name: string
  shortName: string
  /** One-line elevator pitch shown on the listing card. */
  blurb: string
  /** Where this opening is on the strategic spectrum. */
  flavour: string
  positions: OpeningPosition[]
}

export const OPENINGS: Opening[] = [
  {
    id: 'italian',
    name: 'Italian Game',
    shortName: 'Italian',
    blurb: 'Classical king-pawn opening. Bishop eyes f7, fast development, gentle on theory.',
    flavour: 'Open · attacking · beginner-friendly',
    positions: [
      {
        fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2',
        context: 'After 1.e4 e5 — find White’s next move.',
        expectedUci: 'g1f3',
        expectedSan: 'Nf3',
        hint: 'Develop a piece that attacks Black’s e5 pawn.',
        explanation:
          'Nf3 develops a knight toward the centre and immediately presses the e5 pawn — Black must defend. Classical opening principle: develop knights before bishops.',
      },
      {
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        context: 'After 2.Nf3 Nc6 — pick the move that names the opening.',
        expectedUci: 'f1c4',
        expectedSan: 'Bc4',
        hint: 'Bring out the light-squared bishop to its most aggressive diagonal.',
        explanation:
          'Bc4 plants the bishop on the a2–g8 diagonal, aiming straight at Black’s f7 — the weakest square in the starting position because only the king defends it. This is the move that makes it the "Italian" Game.',
      },
      {
        fen: 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        context: 'After 3.Bc4 Bc5 — quietly prepare your central break.',
        expectedUci: 'c2c3',
        expectedSan: 'c3',
        hint: 'Set up a future d2–d4 push by making room for the d-pawn.',
        explanation:
          'c3 prepares d4 — the main strategic break in the Italian. Skip this and a future d4 lets Black’s ...Nxd4 wreck the centre. Patience: build the threat first.',
      },
      {
        fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 6 5',
        context: 'After 3...Bc5 4.c3 Nf6 — now strike the centre.',
        expectedUci: 'd2d4',
        expectedSan: 'd4',
        hint: 'The pawn break you spent the last move preparing — play it now.',
        explanation:
          'd4 challenges Black’s e5 pawn and opens lines for your pieces. The c3 pawn supports it; the bishop on c4 is unleashed on the long diagonal. This is the Italian’s textbook plan.',
      },
      {
        fen: 'r1bqk2r/pppp1ppp/2n2n2/8/1bBP4/5N2/PP3PPP/RNBQK2R w KQkq - 1 7',
        context: 'After 5.d4 exd4 6.cxd4 Bb4+ — block the check.',
        expectedUci: 'c1d2',
        expectedSan: 'Bd2',
        hint: 'Use a piece to block (and offer a trade), not the king.',
        explanation:
          'Bd2 is the quiet Möller block. After Bxd2+ Nbxd2 d6 you reach a calm, balanced middlegame. Stepping the king with Kf1 instead would lose castling and the right to develop normally.',
      },
      {
        fen: 'r1bqk2r/pppp1ppp/2n2n2/8/2BP4/5N2/PP1b1PPP/RN1QK2R w KQkq - 0 8',
        context: 'After 7.Bd2 Bxd2+ — recapture without bringing the queen out early.',
        expectedUci: 'b1d2',
        expectedSan: 'Nbxd2',
        hint: 'Develop the queenside knight rather than disturbing the queen.',
        explanation:
          'Nbxd2 finishes minor-piece development and keeps the queen home. Qxd2 also recaptures but exposes the queen — Black plays ...Nxe4! winning a pawn since the queen blocks the bishop\'s defence.',
      },
      {
        fen: 'r1bqk2r/ppp2ppp/2np1n2/8/2BP4/5N2/PP1N1PPP/R2QK2R w KQkq - 0 9',
        context: 'After 8.Nbxd2 d6 — get the king to safety.',
        expectedUci: 'e1g1',
        expectedSan: 'O-O',
        hint: 'Tuck the king behind the kingside pawns before the centre opens.',
        explanation:
          'O-O connects the rooks and tucks the king away. Italian games can sharpen quickly — castle first, attack second. With the king safe, you can start pushing d5 or using the e-file.',
      },
      {
        fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        context: 'After 1.e4 e5 2.Nf3 Nf6 — Black plays the Petroff. Take the pawn!',
        expectedUci: 'f3e5',
        expectedSan: 'Nxe5',
        hint: 'Black ignored the e5 pawn — claim it.',
        explanation:
          'The Petroff Defense gives up a pawn temporarily to counter-attack. 3.Nxe5 is the principled grab. Black wins it back after 3...d6 4.Nf3 Nxe4, but you can never go wrong by accepting a free pawn first.',
      },
      {
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        context: 'After 3.Bc4 Nf6 (Italian Knight Game) — go slow and solid.',
        expectedUci: 'd2d3',
        expectedSan: 'd3',
        hint: 'A quiet pawn move that supports the bishop and the e-pawn.',
        explanation:
          'd3 leads to the Giuoco Pianissimo (the quietest game) — a positional setup that avoids the sharp 4.Ng5 Fried Liver Attack. Solid, slow, perfect for kids learning structure over tactics.',
      },
    ],
  },
  {
    id: 'ruy-lopez',
    name: 'Ruy López',
    shortName: 'Spanish',
    blurb: 'The Spanish Opening — pin the knight, win the centre, grind for centuries.',
    flavour: 'Open · positional · main-line theory',
    positions: [
      {
        fen: 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
        context: 'After 2.Nf3 Nc6 — same start as the Italian, but pick the Spanish move.',
        expectedUci: 'f1b5',
        expectedSan: 'Bb5',
        hint: 'Pin Black’s knight against something more important.',
        explanation:
          'Bb5 attacks the knight that defends e5. Black has been pressuring the centre; you push back by threatening to capture the defender. Centuries of grandmaster play start with this single move.',
      },
      {
        fen: 'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4',
        context: 'After 3.Bb5 a6 — keep the bishop, don’t trade it.',
        expectedUci: 'b5a4',
        expectedSan: 'Ba4',
        hint: 'Retreat along the same diagonal so the bishop still eyes the king’s wing.',
        explanation:
          'Ba4 keeps the long-diagonal pressure alive. Bxc6 would dump your light-squared bishop for a knight and ease Black’s game — strong masters almost always retreat to a4 instead.',
      },
      {
        fen: 'r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5',
        context: 'After 4.Ba4 Nf6 — get the king to safety before opening lines.',
        expectedUci: 'e1g1',
        expectedSan: 'O-O',
        hint: 'Tuck your king away — the centre is about to come alive.',
        explanation:
          'O-O (short castle) gets the king behind a wall of pawns and links the rooks. In open games like the Spanish, the side that castles first usually attacks first.',
      },
      {
        fen: 'r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 4 6',
        context: 'After 5.O-O Be7 — lift a rook to defend e4 and prep d-pawn play.',
        expectedUci: 'f1e1',
        expectedSan: 'Re1',
        hint: 'Bring the rook to a file where Black has nothing to challenge it.',
        explanation:
          'Re1 quietly defends e4 (freeing the knight from sentry duty) and stares down the e-file at Black’s king and bishop. A classic Spanish setup — every piece has a job before the centre opens.',
      },
      {
        fen: 'r1bqk2r/2ppbppp/p1n2n2/1p2p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 w kq - 0 7',
        context: 'After 6.Re1 b5 — Black kicks the bishop. Keep it alive.',
        expectedUci: 'a4b3',
        expectedSan: 'Bb3',
        hint: 'Don’t trade — drop the bishop back where it still eyes the centre.',
        explanation:
          'Bb3 keeps the Spanish bishop pointed at f7 and the long diagonal. Trading it with Bxc6 (dxc6) would hand Black the bishop pair and open the d-file. Strong Spanish play preserves this piece for the squeeze.',
      },
      {
        fen: 'r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 w kq - 0 8',
        context: 'After 7.Bb3 d6 — quietly prepare the central break.',
        expectedUci: 'c2c3',
        expectedSan: 'c3',
        hint: 'Make room for the d-pawn so you can challenge the centre later.',
        explanation:
          'c3 supports a future d4 push and denies the c3-square to Black\'s knight (no jump to b4 attacking the bishop). The Closed Spanish is a long manoeuvring game — small preparations compound into a strong centre.',
      },
      {
        fen: 'r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - - 1 9',
        context: 'After 8.c3 O-O — quiet prophylaxis before d4.',
        expectedUci: 'h2h3',
        expectedSan: 'h3',
        hint: 'Stop Black\'s bishop from coming to g4 and pinning your knight.',
        explanation:
          'h3 denies the g4 square to Black\'s bishop. If you skip it, ...Bg4 pins the f3 knight against the queen, freezing your kingside. Spending one tempo on h3 lets you safely play 10.d4 next.',
      },
      {
        fen: 'r1bqkb1r/pppp1ppp/2n2n2/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
        context: 'After 3.Bb5 Nf6 — Black plays the Berlin Defense. Castle first.',
        expectedUci: 'e1g1',
        expectedSan: 'O-O',
        hint: 'Don\'t commit the bishop yet — castle and let Black show his plan.',
        explanation:
          'The Berlin Defense is famously solid (Kramnik used it to deny Kasparov wins in 2000). 4.O-O is the main reply. If Black grabs with 4...Nxe4, then 5.d4 leads to the famous Berlin Endgame.',
      },
      {
        fen: 'r1bqkb1r/1ppp1ppp/p1n5/4p3/B3n3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 6',
        context: 'After 5.O-O Nxe4 (Open Spanish) — open the centre.',
        expectedUci: 'd2d4',
        expectedSan: 'd4',
        hint: 'Black grabbed a pawn — punish him by ripping open the centre.',
        explanation:
          'The Open Spanish gives White a long-term initiative. 6.d4 opens the e-file and threatens to win the knight back. After 6...b5 7.Bb3 d5 the position becomes sharp but principled play favours White\'s centre.',
      },
    ],
  },
  {
    id: 'queens-gambit',
    name: 'Queen’s Gambit',
    shortName: 'Queen’s Gambit',
    blurb: 'Offer a wing pawn for a stronger centre. The 19th-century classic.',
    flavour: 'Closed · strategic · centre-focused',
    positions: [
      {
        fen: 'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w KQkq d6 0 2',
        context: 'After 1.d4 d5 — offer the gambit.',
        expectedUci: 'c2c4',
        expectedSan: 'c4',
        hint: 'Push a flank pawn forward — if Black takes it, you get the centre.',
        explanation:
          'c4 is the gambit. If Black plays ...dxc4 you get a juicy e2–e4 and a big centre; if Black declines (...e6, ...c6) you keep pressure on d5. Either way, you steer the game your way.',
      },
      {
        fen: 'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
        context: 'After 2...e6 (Queen’s Gambit Declined) — develop with purpose.',
        expectedUci: 'b1c3',
        expectedSan: 'Nc3',
        hint: 'Develop a piece that adds a second attacker on d5.',
        explanation:
          'Nc3 piles up on d5 and develops naturally. Together with c4, you now have two attackers on Black’s central pawn — the strategic engine of the Queen’s Gambit.',
      },
      {
        fen: 'rnbqkb1r/ppp2ppp/4pn2/3p4/2PP4/2N5/PP2PPPP/RNBQKB1R w KQkq - 1 4',
        context: 'After 3...Nf6 — pin the knight that defends d5.',
        expectedUci: 'c1g5',
        expectedSan: 'Bg5',
        hint: 'Develop the dark-squared bishop where it pins something.',
        explanation:
          'Bg5 pins Black’s knight against the queen — that knight can no longer guard d5 freely. This is the textbook Queen’s Gambit Declined setup played for over 150 years.',
      },
      {
        fen: 'rnbqk2r/ppp1bppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR w KQkq - 3 5',
        context: 'After 4.Bg5 Be7 — start the bishop’s diagonal home.',
        expectedUci: 'e2e3',
        expectedSan: 'e3',
        hint: 'A small pawn move that opens a path for your light-squared bishop.',
        explanation:
          'e3 keeps the centre solid and clears the way for Bd3. It is intentionally modest — the Queen’s Gambit is a long-term squeeze, not a forced attack. Next you’ll develop the bishop, castle, and pile up on d5.',
      },
      {
        fen: 'rnbq1rk1/ppp1bppp/4pn2/3p2B1/2PP4/2N1P3/PP3PPP/R2QKBNR w KQ - 1 6',
        context: 'After 5.e3 O-O — develop your last minor piece.',
        expectedUci: 'g1f3',
        expectedSan: 'Nf3',
        hint: 'Bring out the king-side knight to its natural square.',
        explanation:
          'Nf3 finishes minor-piece development. After this you castle and start the slow squeeze on d5 with Bd3, Qc2, Rfd1 — the textbook Queen\'s Gambit Declined formation.',
      },
      {
        fen: 'rnbq1rk1/pp2bppp/2p1pn2/3p2B1/2PP4/2N1PN2/PP3PPP/R2QKB1R w KQ - 0 7',
        context: 'After 6.Nf3 c6 — bring out the light-squared bishop.',
        expectedUci: 'f1d3',
        expectedSan: 'Bd3',
        hint: 'Develop the bishop where it both attacks h7 and supports the centre.',
        explanation:
          'Bd3 eyes h7 (a key attacking square), supports a possible e4 break, and clears f1 for castling next move. The Carlsbad structure is forming — your pieces all aim at Black\'s queenside and the d5 pawn.',
      },
      {
        fen: 'rnbq1rk1/pp2bppp/2p1pn2/6B1/2pP4/2NBPN2/PP3PPP/R2QK2R w KQ - 0 8',
        context: 'After 7.Bd3 dxc4 — Black snaps off your pawn. Take it back.',
        expectedUci: 'd3c4',
        expectedSan: 'Bxc4',
        hint: 'Recapture with the bishop — keep the same active piece on the diagonal.',
        explanation:
          'Bxc4 keeps your bishop on the a2-g8 diagonal eyeing f7. Black has given up the centre fight in exchange for a slight loss of tempo. Your plan stays the same: O-O, Qe2, Rfd1 and slow pressure.',
      },
      {
        fen: 'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
        context: 'After 1.d4 d5 2.c4 c6 (Slav Defense) — natural development.',
        expectedUci: 'g1f3',
        expectedSan: 'Nf3',
        hint: 'Develop a knight and don\'t trade pawns yet.',
        explanation:
          'Nf3 is the main-line Slav response. Black\'s c6 supports d5 with the c-pawn instead of e6 (the QGD), keeping the c8 bishop free. Avoid 3.cxd5 (Exchange Slav — drawish). The game becomes a long manoeuvring battle around the d5 pawn.',
      },
      {
        fen: 'rnbqkbnr/ppp1pppp/8/8/2pP4/8/PP2PPPP/RNBQKBNR w KQkq - 0 3',
        context: 'After 1.d4 d5 2.c4 dxc4 (Queen\'s Gambit Accepted) — grab the centre.',
        expectedUci: 'e2e4',
        expectedSan: 'e4',
        hint: 'Black gave up the centre — claim it all.',
        explanation:
          'e4 builds a massive pawn centre. Black can\'t easily hold the extra pawn (3...b5 4.a4 c6 5.axb5 cxb5 6.Nc3 attacks the pawn chain). Modern theory prefers this aggressive 3.e4 over the calm 3.Nf3.',
      },
    ],
  },
]

export function getOpening(id: string | undefined): Opening | null {
  return OPENINGS.find((o) => o.id === id) ?? null
}
