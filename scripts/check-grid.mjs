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
  GAP,
  COL_W,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  GUTTER,
  ROWS,
  ROW_H,
  ROW_LINES,
  rowY,
  MARGIN,
  MEASURE,
  PAGE_H,
  PAGE_W,
  TYPE,
  colSpan,
  colX,
} from '../src/config/brand.ts'
import { leafColumnWidth, leafSheet, spreadSheet } from '../src/render/sheet.ts'
import { columnSteps, placementAt, resolveBand } from '../src/components/canvas/useBlockDrag.ts'
import { tableColumns } from '../src/render/compose.ts'

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

// -- the display voice is always uppercase ----------------------------------
// Review Condensed is only ever set in caps in the file, and Connor confirmed
// it as a rule. The wordmark is the single exception, because a logo is not
// type — if a second exception ever appears, it should have to be argued for
// here rather than slipped in.
{
  const exempt = new Set(['wordmark'])
  for (const [id, role] of Object.entries(TYPE)) {
    if (role.voice !== 'display' || exempt.has(id)) continue
    assert.equal(role.case, 'upper', `display role "${id}" must be uppercase`)
  }
  assert.equal(TYPE.wordmark.case, undefined, 'the wordmark stays mixed case')
}

// -- swash height is no longer a constant ----------------------------------
// It is taken from the font's own ink extents at render time (see
// `render/text.ts` → `swashMetrics`), which needs a canvas and so cannot be
// asserted here. What can be pinned is the premise that makes it work: the
// display voice is caps-only, so its bar has nothing to cover below the
// baseline. If that ever stops being true, the metric is wrong too.
{
  for (const [id, role] of Object.entries(TYPE)) {
    if (role.voice !== 'display' || id === 'wordmark') continue
    assert.equal(role.case, 'upper', `swash metrics assume display is caps: "${id}"`)
  }
}

console.log('check:grid — ok')

// -- dragging lands on the grid, always ------------------------------------
// The claim: whatever the pointer does, a block comes to rest on the column
// lines above and inside the measure. If this can be made to fail, the editor
// can produce a page the design system cannot describe.
{
  const CSS = 900 // an arbitrary on-screen page width; the answer must not depend on it

  for (const mode of ['columns', 'resize']) {
    for (const edge of mode === 'resize' ? ['left', 'right'] : [undefined]) {
      for (let col0 = 0; col0 < COLS; col0++) {
        for (let span0 = 1; span0 <= COLS - col0; span0++) {
          for (let dx = -2000; dx <= 2000; dx += 37) {
            const steps = columnSteps(dx, CSS, PAGE_W)
            const { col, span } = resolveBand(mode, edge, col0, span0, steps)
            const where = `${mode}/${edge ?? '-'} from ${col0}+${span0} by ${steps}`
            assert.ok(Number.isInteger(col) && Number.isInteger(span), `${where}: whole columns`)
            assert.ok(col >= 0, `${where}: never starts left of the measure`)
            assert.ok(span >= 1, `${where}: never collapses to nothing`)
            assert.ok(col + span <= COLS, `${where}: never hangs off the measure`)
            if (mode === 'columns') assert.equal(span, span0, `${where}: moving does not resize`)
            if (edge === 'right') assert.equal(col, col0, `${where}: the left edge is pinned`)
            if (edge === 'left') assert.equal(col + span, col0 + span0, `${where}: the right edge is pinned`)
          }
        }
      }
    }
  }

  // A resolved run is a run the sheet can actually draw, to the point.
  const sheet = leafSheet(PAGE_W)
  for (let col = 0; col < COLS; col++) {
    for (let span = 1; span <= COLS - col; span++) {
      near(sheet.colX(col), MARGIN + colX(col), 0.001, `column ${col} starts where colX says`)
      near(sheet.colSpan(span), colSpan(span), 0.001, `a ${span}-column run is colSpan(${span})`)
      assert.ok(
        sheet.colX(col) + sheet.colSpan(span) <= MARGIN + MEASURE + 0.001,
        `a ${span}-column run at ${col} fits the measure`,
      )
    }
  }

  // One column of travel is one column of movement, at any page scale — the
  // cover included, whose nine columns are 117.1pt rather than 51.
  for (const [pageWpt, label] of [[PAGE_W, 'a leaf'], [PAGE_W * 2, 'a full-spread cover']]) {
    const pitch = (pageWpt - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS + GUTTER
    const perCol = (CSS / pageWpt) * pitch
    assert.equal(columnSteps(perCol, CSS, pageWpt), 1, `${label}: one pitch is one column`)
    assert.equal(columnSteps(-perCol * 3, CSS, pageWpt), -3, `${label}: and it goes both ways`)
    assert.equal(columnSteps(perCol * 0.4, CSS, pageWpt), 0, `${label}: under half a column does not move`)
  }
}

// -- a table's columns are whole grid columns inside its own run -----------
// `TableBlock.widths` are shares, resolved against whatever the block spans at
// the moment it is painted. The claim is that the resolution is always legal:
// the columns tile the block's run exactly, with none of them empty.
{
  const sheet = leafSheet(PAGE_W)
  const shares = [[1, 1], [2, 1, 1], [3, 2, 1], [1, 1, 1, 1], [5, 1], [0, 1, 1], [1]]

  for (const widths of shares) {
    for (let col = 0; col < COLS; col++) {
      for (let span = 1; span <= COLS - col; span++) {
        const cols = tableColumns({ kind: 'table', widths, rows: [], col, span }, sheet, {
          x: sheet.colX(col),
          y: 0,
          w: sheet.colSpan(span),
          h: 0,
        })
        const where = `[${widths}] in ${span} cols at ${col}`
        assert.equal(cols.length, widths.length, `${where}: one box per column`)
        for (const c of cols) assert.ok(c.w > 0, `${where}: no empty column`)

        if (widths.length <= span) {
          // On the grid: the first starts at the block's own left edge, the
          // last ends at its right, and each boundary is a column line.
          near(cols[0].x, sheet.colX(col), 0.001, `${where}: starts on the block's edge`)
          const last = cols[cols.length - 1]
          near(
            last.x + last.w,
            sheet.colX(col) + sheet.colSpan(span),
            0.001,
            `${where}: ends on the block's edge`,
          )
          for (const c of cols) {
            const at = Math.round((c.x - sheet.colX(0)) / sheet.pt(COL_W + GUTTER))
            near(c.x, sheet.colX(at), 0.001, `${where}: column ${at} is on a column line`)
          }
        }
      }
    }
  }

  // More table columns than grid columns to give them: it stops trying to be on
  // the grid rather than producing a column of nothing.
  const tight = tableColumns({ kind: 'table', widths: [1, 1, 1], rows: [], col: 0, span: 2 }, sheet, {
    x: sheet.colX(0), y: 0, w: sheet.colSpan(2), h: 0,
  })
  assert.equal(tight.length, 3, 'a table narrower than its columns still draws them all')
  for (const c of tight) assert.ok(c.w > 0, 'and none of them is empty')
}

// -- the row grid divides the content band exactly -------------------------
// The horizontal grid is a transcription and the vertical one is an invention,
// so this is the half that has to be checked against itself rather than against
// the Figma: thirteen rows and twelve gutters must fill the band with nothing
// left over, or blocks snapped to the last row hang below the measure.
assert.equal(ROW_LINES.length, ROWS + 1, 'a line per row, plus the foot of the last')
near(rowY(0), CONTENT_TOP, 1e-9, 'row 0 starts at the top of the content band')
near(rowY(ROWS - 1) + ROW_H, CONTENT_BOTTOM, 1e-9, 'the last row ends on the bottom margin')
near(ROWS * ROW_H + (ROWS - 1) * GUTTER, CONTENT_BOTTOM - CONTENT_TOP, 1e-9, '13 × 50.85 + 12 × 7')
near(ROW_H, COL_W, 0.2, 'the module is square: a row is a column on its side')
for (let r = 1; r < ROWS; r++) {
  near(rowY(r) - (rowY(r - 1) + ROW_H), GUTTER, 1e-9, `row ${r} clears row ${r - 1} by a gutter`)
}

// -- a vertical drag always comes to rest on a line ------------------------
// The claim this replaces was that a drag snapped to a 10pt step, which is fine
// arithmetic and no help at all to somebody who does not know where they are
// aiming. The claim now is stronger: whatever the pointer does, the block lands
// on one of a small set of *named* places — a row line, flush under or over a
// neighbour, the bottom margin, or the tight flow position — and never above the
// floor, which is the one thing the compositor would refuse to honour.
{
  const geom = (blocks) => ({
    height: PAGE_H, // backing-store units = points, so the arithmetic is readable
    width: PAGE_W,
    pageWpt: PAGE_W,
    origin: CONTENT_TOP,
    el: null,
    placed: blocks,
  })

  // Three blocks of 100pt, stacked from y=57 with the system 10pt gap between.
  // `tops` pins them, the way a page that has been arranged once is pinned.
  const stack = (tops = [undefined, undefined, undefined]) => {
    const out = []
    let y = CONTENT_TOP
    for (let i = 0; i < 3; i++) {
      if (i > 0) y += GAP.block
      if (tops[i] !== undefined) y = Math.max(y, tops[i])
      out.push({ block: { id: `b${i}`, top: tops[i] }, rect: { x: 0, y, w: 100, h: 100 } })
      y += 100
    }
    return out
  }

  const at = (blocks, id, top) => placementAt(geom(blocks), 0, id, top)

  /** Every place the drag was entitled to choose, given what it resolved to. */
  const linesFor = (blocks, id, p) => {
    const self = blocks.find((b) => b.block.id === id)
    const others = blocks.filter((b) => b.block.id !== id).map((b) => ({ y: b.rect.y, h: b.rect.h }))
    const above = others[p.at - 1]
    const floor = above ? above.y + above.h + GAP.block : CONTENT_TOP
    return {
      floor,
      lines: [
        floor,
        CONTENT_BOTTOM - self.rect.h,
        ...ROW_LINES,
        ...others.flatMap((o) => [o.y + o.h + GAP.block, o.y - self.rect.h - GAP.block]),
      ],
    }
  }

  // Dropped exactly where it already is: no move, and no change of position.
  {
    const s = stack()
    const p = at(s, 'b1', s[1].rect.y)
    assert.equal(p.at, 1, 'a block dropped where it was keeps its place')
    near(p.top, s[1].rect.y, 0.001, 'and is put back exactly where it was')
    near(p.topPx, s[1].rect.y, 0.001, 'and the preview sits exactly on it')
  }

  // The property, swept: wherever the pointer lets go, the answer is a line.
  for (let dy = -300; dy <= 400; dy += 3) {
    const s = stack()
    const p = at(s, 'b1', s[1].rect.y + dy)
    const { floor, lines } = linesFor(s, 'b1', p)
    assert.ok(p.topPx >= floor - 0.001, `a drag of ${dy}pt never lands above the floor`)
    assert.ok(
      lines.some((l) => Math.abs(l - p.topPx) < 0.51),
      `a drag of ${dy}pt lands on a line, not at ${p.topPx.toFixed(2)}`,
    )
    near(p.top, p.topPx, 1e-9, 'and the points it reports are the pixels it previewed')
  }

  // Nudged a couple of points: it goes back where it was rather than drifting.
  // A hand that is not quite still cannot move a block, because the line it is
  // already on stays the nearest one until the pointer is genuinely closer to
  // another. (Two points, not eight: the next row line down here is only 5.7pt
  // away, and taking it at 8pt is the snapping working, not failing.)
  for (const dy of [-2, -1, 0, 1, 2]) {
    const s = stack()
    const p = at(s, 'b1', s[1].rect.y + dy)
    assert.equal(p.at, 1, `a ${dy}pt nudge does not reorder`)
    near(p.top, s[1].rect.y, 0.001, `a ${dy}pt nudge is not a move`)
  }

  // Dragged towards a row line, it takes the row line.
  {
    const s = stack()
    const row = ROW_LINES.find((l) => l > s[1].rect.y + 40)
    const p = at(s, 'b1', row + 4)
    near(p.top, row, 0.001, 'a drop near a row line takes the row line')
  }

  // Dragged towards the foot of the page, it hangs off the bottom margin.
  {
    const s = stack()
    const p = at(s, 'b1', CONTENT_BOTTOM - 100 + 3)
    near(p.top, CONTENT_BOTTOM - 100, 0.001, 'the bottom margin is a place to land')
    near(p.top + s[1].rect.h, CONTENT_BOTTOM, 0.001, 'and the block sits exactly on it')
  }

  // Dragged past the block below it — cleared entirely — reorders instead.
  //
  // "Cleared" is measured against where b2 is actually painted, which is the
  // whole simplification the pins bought: b2 does not move when b1 leaves, so
  // there is no hypothetical page to measure against and the threshold is
  // where it looks like it is.
  {
    const s = stack()
    const cleared = s[2].rect.y + s[2].rect.h
    const p = at(s, 'b1', cleared)
    assert.equal(p.at, 2, 'clearing the block below moves past it')
    near(p.top, cleared + GAP.block, 0.001, 'and sits under it, on the system gap')
  }

  // Not yet cleared: still in place, and lower down the page than it was.
  {
    const s = stack()
    const p = at(s, 'b1', s[2].rect.y + s[2].rect.h - 30)
    assert.equal(p.at, 1, 'short of clearing it, the order does not change')
    assert.ok(p.top > s[1].rect.y, 'and the block has moved down the page')
  }

  // Dragged up off the top: first place, and never above the flow's own start.
  {
    const s = stack()
    const p = at(s, 'b2', CONTENT_TOP - 500)
    assert.equal(p.at, 0, 'dragged above everything, it goes first')
    near(p.top, CONTENT_TOP, 0.001, 'and cannot be dropped above the measure')
  }

  // A block already placed on a line and dropped where it sits keeps its place.
  {
    const s = stack([undefined, ROW_LINES[4], undefined])
    const p = at(s, 'b1', s[1].rect.y)
    near(p.top, ROW_LINES[4], 0.001, 'a placed block survives being dropped in place')
    near(p.topPx, s[1].rect.y, 0.001, 'and the preview does not jump')
  }

  // A block pinned off the row grid — which is what the pins below write, since
  // a block is pinned wherever the flow happened to leave it — is not dragged
  // onto a row line against its will. Picking it up and putting it straight
  // back down is a no-op, because "directly above the block below" is itself
  // one of the lines and it is already on it. The grid is where a drag *ends
  // up*, not a tidy-up that runs on touch.
  {
    const s = stack([undefined, 262, undefined])
    const p = at(s, 'b1', s[1].rect.y)
    near(p.top, 262, 0.001, 'dropped straight back, an off-row block stays put')
    assert.ok(
      !ROW_LINES.some((l) => Math.abs(l - p.top) < 0.001),
      'and is not snapped to a row it was never on',
    )
  }

  // The first block on the page can be pushed down, which is what replaced a
  // spacer at the top of a page.
  {
    const s = stack()
    // Row 1, not row 2: by row 2 the block has cleared the one that was under
    // it, and being pushed that far down the page *is* a reorder.
    const row = ROW_LINES[1]
    const p = at(s, 'b0', row)
    assert.equal(p.at, 0)
    near(p.top, row, 0.001, 'the top of the page can be pushed down to a row')
  }

  // -- and the rest of the page is told to stay put -------------------------
  // The pins are the half of the gesture that stops a drop from moving three
  // other components. Every block that is still in pure flow gets one, at the y
  // it is already painted at; a block that has been placed already knows.
  {
    const s = stack([undefined, undefined, 400])
    const p = at(s, 'b0', ROW_LINES[3])
    assert.deepEqual(
      p.pins.map((x) => x.id),
      ['b1'],
      'only the blocks with nothing pinning them yet are written',
    )
    near(p.pins[0].top, s[1].rect.y, 0.001, 'and each is pinned where it is already painted')
  }
}

console.log('check:grid — the column and row grids resolve, and a drag lands on a line')
