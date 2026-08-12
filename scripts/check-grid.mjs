/**
 * Grid and type checks — `npm run check:grid`.
 *
 * This pins the central claim of `config/brand.ts`: that the nine-column grid
 * is the grid the *Tools for Change* file was drawn on, not one imposed on it
 * afterwards. Every expectation below is a value measured off the Figma with
 * `absoluteBoundingBox`, and the tolerance is stated per case.
 *
 * If someone later "tidies" the column width to a round number, or reinstates a
 * modular type ladder, these fail — which is the point. The numbers are load
 * bearing and they don't look it.
 */
import assert from 'node:assert/strict'
import {
  BODY_INDENT,
  COLS,
  COL_W,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  GUTTER,
  MARGIN,
  MEASURE,
  PAGE_H,
  PAGE_W,
  TYPE,
  colSpan,
  colX,
} from '../src/config/brand.ts'
import { leafColumnWidth, leafSheet, spreadSheet } from '../src/render/sheet.ts'

const near = (actual, expected, tol, msg) =>
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg}: got ${actual}, expected ${expected} ±${tol}`,
  )

// -- the grid resolves exactly ---------------------------------------------
assert.equal(PAGE_W - MARGIN * 2, MEASURE, 'measure is the page less two margins')
assert.equal(COLS * COL_W + (COLS - 1) * GUTTER, MEASURE, '9 × 51 + 8 × 7 = 515, exactly')
assert.equal(leafColumnWidth(), COL_W, 'derived column width matches the documented 51')

// -- every structural edge in the file lands on a column line ---------------
// Measured from the Figma; tolerance is the drawing slop in the source, not
// slack in the grid. The two exact ones are exact.
const EDGES = [
  ['def-list term width', colSpan(3), 165.1, 2],
  ['def-list def start', colX(5), 291.1, 1.5],
  ['def-list def width', colSpan(4), 223.9, 1.5],
  ['quote / figure inset', colX(1), 58.0, 0.01],
  ['quote / figure width', colSpan(7), 399.0, 0.01],
  ['colophon intro width', colSpan(6), 340, 1],
  ['about-author inset', colX(4), 231.1, 1],
  ['about-author width', colSpan(5), 283.9, 1],
]
for (const [label, actual, measured, tol] of EDGES) near(actual, measured, tol, label)

// -- vertical furniture -----------------------------------------------------
assert.equal(CONTENT_BOTTOM - CONTENT_TOP, 745, 'content band height')
assert.ok(CONTENT_TOP > 37 && CONTENT_BOTTOM < PAGE_H, 'content sits inside the rules')

// -- the sheet maps points to pixels with one uniform scale -----------------
// The old multi-format setup carried separate x and y ratios and needed a test
// to prove they agreed; here it is structural, so this just pins it.
{
  const s = leafSheet(PAGE_W * 2)
  assert.equal(s.s, 2, 'a 2× sheet scales by exactly 2')
  assert.equal(s.pt(PAGE_H), PAGE_H * 2, 'height scales by the same factor as width')
  assert.equal(s.colX(0), MARGIN * 2, 'column 0 starts at the margin')
  near(s.colSpan(9), MEASURE * 2, 1e-9, 'nine columns span the measure')
}

// The cover keeps nine columns and the same gutters across the wider measure.
{
  const s = spreadSheet(PAGE_W * 2)
  near(s.colWPt, (PAGE_W * 2 - MARGIN * 2 - GUTTER * 8) / 9, 1e-9, 'cover column width')
  assert.ok(s.colWPt > COL_W, 'cover columns are wider than leaf columns')
}

// -- type is the measured set, not a ladder ---------------------------------
// Spot-check the sizes that a "tidy up" would most likely round away, and the
// one role whose voice is counter-intuitive.
near(TYPE.chapterTitle.size, 53.8, 0.01, 'chapter title')
near(TYPE.statement.size, 49.3, 0.01, 'statement')
near(TYPE.runningHead.size, 12.6, 0.01, 'running head')
assert.equal(TYPE.chapterTitle.voice, 'text', 'chapter titles are the TEXT voice, not display')
assert.equal(TYPE.runningHead.voice, 'display', 'running heads are the display voice')
assert.equal(BODY_INDENT, 64, 'first-line indent is a flat 64pt, not an em multiple')

// A 1.2 ladder off 12.5 would put step 8 at 53.7477 and step 4 at 25.92. The
// design is close in places and not in others; assert it is NOT a ladder so
// nobody re-derives it.
{
  const ladder = (n) => 12.5 * 1.2 ** n
  assert.ok(
    Math.abs(TYPE.tocChapter.size - ladder(6)) > 0.5,
    'TOC chapter (36) is a round number, not ladder step 6',
  )
  assert.ok(
    Math.abs(TYPE.defTerm.size - ladder(3)) > 0.5,
    'definition term (20) is a round number, not ladder step 3',
  )
}

console.log('check:grid — ok')
