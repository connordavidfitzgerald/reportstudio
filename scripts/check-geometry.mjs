/**
 * Page-geometry checks — `npm run check:geometry`.
 *
 * Exercises the two pure modules everything visual is built on: the grid (which
 * now has margins) and `frameRect` (which places flowed content, and is dead code
 * until the flow engine lands — so without this it would sit unverified for two
 * phases and then be debugged through a paginator).
 *
 * The property worth protecting above all others is **scale invariance**: the
 * same document laid out at any canvas size must produce proportionally identical
 * geometry. That is what lets one flow pass at base size serve the preview, a
 * 148px thumbnail and a 2× export, and what stops the editor's hit-testing from
 * drifting away from the paint.
 */
import assert from 'node:assert/strict'
import { grid } from '../src/render/grid.ts'
import { frameRect } from '../src/render/page.ts'

const close = (a, b, msg, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} !== ${b}`)

// The A4 report format, at base render size.
const W = 1240
const H = 1754
const COLS = 12
const ROWS = 55
const MARGIN = (40 / 595) * W // 40pt on a 595pt page

const g = grid(W, H, COLS, ROWS, MARGIN)

// -- the content box ---------------------------------------------------------
close(g.inner.x, MARGIN, 'content box starts at the margin')
close(g.inner.w, W - 2 * MARGIN, 'content box is inset both sides')
close(g.colW, (W - 2 * MARGIN) / COLS, 'columns divide the content box, not the page')
close(g.colX(0), MARGIN, 'column 0 starts at the margin, not at 0')
close(g.colX(COLS), W - MARGIN, 'the last column ends at the right margin')
close(g.rowY(ROWS), H - MARGIN, 'the last row ends at the bottom margin')

// A zero-margin format (the slide) must behave exactly as it did before margins
// existed — full-bleed colour fields depend on column 0 being the page edge.
const bleed = grid(1920, 1080, 12, 12, 0)
close(bleed.colX(0), 0, 'zero margin means column 0 is the page edge')
close(bleed.colX(12), 1920, 'zero margin means the grid spans the full width')

// -- boxes -------------------------------------------------------------------
const box = { col: 2, row: 4, colSpan: 3, rowSpan: 6 }
const r = g.rect(box)
close(r.x, g.colX(2), 'rect x follows colX')
close(r.y, g.rowY(4), 'rect y follows rowY')
close(r.w, g.span(3), 'rect width follows span')
assert.ok(r.x >= MARGIN && r.x + r.w <= W - MARGIN, 'a box stays inside the content box')

// cellAt is the inverse of colX/rowY — the editor maps pointer to cell with it,
// so a mismatch here means you grab a different cell than the one you clicked.
const mid = g.rect({ col: 5, row: 9, colSpan: 1, rowSpan: 1 })
const cell = g.cellAt(mid.x + mid.w / 2, mid.y + mid.h / 2)
assert.deepEqual(cell, { col: 5, row: 9 }, 'cellAt inverts rect')
assert.deepEqual(g.cellAt(0, 0), { col: 0, row: 0 }, 'points in the margin clamp inward')
assert.deepEqual(g.cellAt(W, H), { col: COLS - 1, row: ROWS - 1 }, 'points past the trim clamp')

// clampBox must never produce something outside the grid.
for (const bad of [
  { col: -5, row: -5, colSpan: 3, rowSpan: 3 },
  { col: 99, row: 99, colSpan: 3, rowSpan: 3 },
  { col: 0, row: 0, colSpan: 999, rowSpan: 999 },
]) {
  const c = g.clampBox(bad)
  assert.ok(c.col >= 0 && c.col + c.colSpan <= COLS, `clampBox keeps columns in range: ${JSON.stringify(c)}`)
  assert.ok(c.row >= 0 && c.row + c.rowSpan <= ROWS, `clampBox keeps rows in range: ${JSON.stringify(c)}`)
}

// -- frames (flowed content) -------------------------------------------------
const frame = { col: 0, colSpan: COLS, yFrac: 0.25, hFrac: 0.1 }
const fr = frameRect(g, frame, H)
close(fr.x, MARGIN, 'a full-width frame starts at the left margin')
close(fr.w, W - 2 * MARGIN, 'a full-width frame spans the content box')
close(fr.y, 0.25 * H, 'frame y is a fraction of page height')
close(fr.h, 0.1 * H, 'frame height is a fraction of page height')

// Frames are horizontally on the grid — a half-width frame must land exactly on
// a column line, or flowed text stops aligning with pinned elements.
const half = frameRect(g, { col: 0, colSpan: COLS / 2, yFrac: 0, hFrac: 1 }, H)
close(half.w, g.span(COLS / 2), 'a frame width is exactly a column span')
close(frameRect(g, { col: 6, colSpan: 6, yFrac: 0, hFrac: 1 }, H).x, g.colX(6), 'frame x is a column line')

// -- scale invariance --------------------------------------------------------
// The whole design rests on this: geometry at 2x must be exactly 2x.
for (const scale of [0.1, 0.5, 2, 3.7]) {
  const s = grid(W * scale, H * scale, COLS, ROWS, MARGIN * scale)
  const a = g.rect(box)
  const b = s.rect(box)
  for (const k of ['x', 'y', 'w', 'h']) {
    close(b[k], a[k] * scale, `box ${k} scales by ${scale}`, 1e-6)
  }
  const fa = frameRect(g, frame, H)
  const fb = frameRect(s, frame, H * scale)
  for (const k of ['x', 'y', 'w', 'h']) {
    close(fb[k], fa[k] * scale, `frame ${k} scales by ${scale}`, 1e-6)
  }
}

console.log('geometry ok — grid margins, boxes, frames, and scale invariance')
