// Catalogue of source books and which to mine for stories.
//
// We register each book once with stable metadata so book filename changes
// (publishers add subtitles, etc.) don't break downstream story IDs.
// EPUB extraction is not yet implemented — those entries are listed but
// skipped by the extract stage.

import { resolve } from 'node:path'
import { BOOKS_DIR } from './paths.js'
import type { BookMeta } from './types.js'

export const BOOKS: BookMeta[] = [
  {
    bookId: 'fischer-teaches',
    title: 'Bobby Fischer Teaches Chess',
    author: 'Bobby Fischer, Stuart Margulies, Don Mosenfelder',
    year: 1966,
    path: resolve(BOOKS_DIR, 'Bobby Fischer Teaches Chess -- Bobby Fischer & Stuart Margulies & Don Mosenfelder -- 2006.pdf'),
    format: 'pdf',
  },
  {
    bookId: 'alfonso-juegos',
    title: 'Libro de los juegos',
    author: 'Alfonso X (Castilla), ed. Raúl Orellana Calderón',
    year: 1283,
    path: resolve(BOOKS_DIR, 'Libro de los juegos_ acedrex, dados e tablas _ ordenamiento -- Rey de Castilla Alfonso X, Raúl Orellana Calderón -- Biblioteca Castro, Madrid, 2007 -- isbn13 9788496452411.pdf'),
    format: 'pdf',
  },
  {
    bookId: 'nimzo-mysystem',
    title: 'My System: A Chess Treatise',
    author: 'Aron Nimzowitsch',
    year: 1925,
    path: resolve(BOOKS_DIR, 'My system_ a chess treatise -- Aron Nimzowitsch, Aron Nimzovich -- 1930-01-01 -- Harcourt, Brace and company.pdf'),
    format: 'pdf',
  },
  {
    bookId: 'ruy-lopez-art',
    title: 'The Art of the Game of Chess',
    author: 'Ruy López, trans. Andrew Soltis & Michael J. McGrath',
    year: 1561,
    path: resolve(BOOKS_DIR, 'The Art of the Game of Chess -- Ruy López; Andrew Soltis; Michael J_ McGrath -- Catholic University of America Press, Washington, D_C_, 2020 -- isbn13 9780813232812.pdf'),
    format: 'pdf',
  },
  // EPUB sources — left here so future `extract.ts` can pick them up
  // once an EPUB reader is added.
  {
    bookId: 'kuljasevic-study',
    title: 'How to Study Chess on Your Own',
    author: 'Davorin Kuljaševic',
    year: 2021,
    path: resolve(BOOKS_DIR, 'How to study chess on your own _ creating a plan that works -- Davorin Kuljasevic -- National Book Network, Lanham, 2021 -- New In Chess -- isbn13 9789056919313.epub'),
    format: 'epub',
  },
  {
    bookId: 'nimzo-praxis',
    title: 'My System & Chess Praxis',
    author: 'Aron Nimzowitsch, ed. Robert Sherwood',
    year: 1930,
    path: resolve(BOOKS_DIR, 'My System & Chess Praxis _ His Landmark Classics in One -- Nimzowitsch, Aron;Sherwood, Robert -- 1st, 2016 -- New in Chess; New In Chess,Csi -- isbn13 9789056916596.epub'),
    format: 'epub',
  },
]
