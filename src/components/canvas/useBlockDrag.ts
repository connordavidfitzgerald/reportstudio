import { create } from 'zustand'
import {
  COLS,
  COL_W,
  CONTENT_BOTTOM,
  GAP,
  GUTTER,
  MARGIN,
  PAGE_H,
  PAGE_W,
  ROW_LINES,
  SPREAD_W,
} from '../../config/brand'
import { DROP_CLEARANCE } from '../../doc/blocks'
import type { PlacedBlock } from '../../render/compose'

/**
 * Dragging a component around the page.
 *
 * ## Nothing here reaches the document
 *
 * `doc/blocks.ts` is emphatic that a block "never says what vertical position
 * it has: that is the compositor's return value". Dragging does not change
 * that. A vertical drag resolves to an *index* and a horizontal one to a
 * `col`/`span` — the two things a block has always had — and the gesture itself
 * lives entirely in this store, which is deliberately not `useDeck`: every
 * mutator there snapshots the whole document onto the undo stack, and a drag
 * that pushed sixty snapshots between picking a block up and putting it down
 * would make undo useless.
 *
 * So the document is written exactly once, on drop. One gesture is one undo.
 *
 * ## Why the leaves publish their geometry here
 *
 * A drag can end on the facing page, and the two pages are separate components
 * that each know only their own rects. Rather than lift all of that state into
 * the spread, each `LeafCanvas` registers what it painted and where, and the
 * gesture reads whichever leaf the pointer is actually over. The alternative —
 * hit-testing the DOM for a drop target — would work for the page but not for
 * the *boundary between two blocks*, which only exists in these rects.
 */

/** What one leaf painted, and where on screen it is. */
export interface LeafGeom {
  /** Every block, in backing-store units, as the compositor placed it. */
  placed: PlacedBlock[]
  /** Backing-store size, which is the coordinate system `placed` is in. */
  width: number
  height: number
  /** The page's own width in points: a leaf is 595, a full-spread cover 1190. */
  pageWpt: number
  /** Where the flow starts on this leaf, in backing-store units. */
  origin: number
  el: HTMLElement
}

/**
 * How far the pointer must travel before a press becomes a drag.
 *
 * Every block on the page is also a click target — one click selects, a second
 * puts a caret in — so a press that moves three pixels because a hand is not
 * perfectly still has to stay a click. Below this the gesture is `pending` and
 * commits to nothing.
 */
const THRESHOLD = 4

/**
 * How decisively sideways a drag must be to mean columns rather than order.
 *
 * Not 1: a diagonal drag is almost always somebody aiming up or down the page
 * and drifting, so the horizontal reading has to be asked for. Resolved once,
 * at the moment the threshold is crossed, and then held for the rest of the
 * gesture — a mode that flips as the hand wobbles is unusable.
 */
const SIDEWAYS = 1.6

export type DragMode = 'pending' | 'reorder' | 'columns' | 'resize'

/**
 * Where a vertical drag would put the block.
 *
 * ## One number in, three answers out
 *
 * The gesture produces exactly one thing — a proposed top edge — and this turns
 * it into the insertion index, the top edge the block will actually be given,
 * and the pins that keep the rest of the page still. There is no mode to choose
 * and no modifier to hold: drag a little and the block finds the nearest line,
 * drag past a neighbour entirely and the order changes instead.
 *
 * ## Why `top` and not a gap
 *
 * It used to be `gapBefore`, extra room before the block, which the flow then
 * carried down into everything after it — so putting the second component where
 * you wanted it moved the first one. See {@link import('../../doc/blocks').Block.top}
 * for why that had to go.
 *
 * `pins` is the other half of standing still. Removing the dragged block from
 * the stack would let everything below it flow *up*; pinning those blocks at the
 * y they are already painted at means the thing you dropped is the only thing
 * that moves. They are written in the same commit, so it is still one undo.
 */
export interface Placement {
  leafIndex: number
  /** Insertion index among the other blocks on that leaf. */
  at: number
  /** The block's top edge, in page points, on one of the lines the drag offered. */
  top: number
  /** Where the block would sit, in that leaf's backing-store units — for the preview. */
  topPx: number
  /**
   * Blocks already on the destination leaf that must be told where they are.
   *
   * Only the ones with nothing pinning them yet: a block that has been dragged
   * before already knows, and rewriting it would be noise in the diff.
   */
  pins: { id: string; top: number }[]
}

export interface Drag {
  blockId: string
  /** The leaf the block started on. */
  fromLeaf: number
  mode: DragMode
  /** Which edge is being pulled, for a resize. */
  edge?: 'left' | 'right'
  /** The block's column run when the gesture began. */
  col0: number
  span0: number
  /** Client coordinates: where the press landed, and where the pointer is now. */
  startX: number
  startY: number
  x: number
  y: number
  /**
   * Client pixels between the block's painted top edge and where it was grabbed.
   *
   * Carried so the block tracks the pointer from wherever it was picked up,
   * rather than jumping its own top to the cursor. It is also what makes a drag
   * onto the facing page mean anything: the proposed top is the pointer less
   * this, and that works the same on a page the gesture did not start on.
   */
  grabDY: number
  /** Resolved live: where a drop would put the block. Null until it means something. */
  target: Placement | null
  /** Resolved live: the column run a drop would set. */
  band: { col: number; span: number } | null
}

interface DragState {
  geom: Record<number, LeafGeom>
  register(index: number, geom: LeafGeom): void
  forget(index: number): void

  drag: Drag | null
  begin(d: Omit<Drag, 'mode' | 'x' | 'y' | 'target' | 'band'> & { mode?: DragMode }): void
  move(x: number, y: number): void
  /** The finished gesture, or null if it never became one. Clears either way. */
  end(): Drag | null
  cancel(): void

  /**
   * True from the end of a real drag until the click it caused is swallowed.
   *
   * A pointerup is followed by a click, and the block under the pointer is also
   * a selection target — so without this, letting go of a block you had just
   * dragged somewhere else would immediately also toggle its selection off.
   */
  suppress: boolean
  consumeSuppress(): boolean
}

/** The column pitch of a page, in points. Wider on a full-spread cover. */
const pitchPt = (pageWpt: number): number => {
  if (pageWpt === PAGE_W) return COL_W + GUTTER
  // Derived the way `render/sheet.ts` derives it, so the cover's nine stretched
  // columns snap to the lines that are actually painted on it.
  const colW = (pageWpt - MARGIN * 2 - GUTTER * (COLS - 1)) / COLS
  return colW + GUTTER
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/**
 * How many whole columns a sideways travel of `dx` CSS pixels amounts to.
 *
 * Measured from where the gesture started rather than accumulated event by
 * event, so a slow drag and a fast one over the same distance land on the same
 * column and nothing rounds its way adrift over a long gesture.
 */
export const columnSteps = (dx: number, cssWidth: number, pageWpt: number): number =>
  Math.round(dx / ((cssWidth / pageWpt) * pitchPt(pageWpt)))

/**
 * The column run a gesture resolves to, given how far it has travelled.
 *
 * Pure, and exported, because this is the claim `scripts/check-grid.mjs` pins:
 * whatever the pointer does, the answer is a run that lies on the column lines
 * `config/brand.ts` describes and fits inside the measure. A block that ends up
 * half a column wide, or hanging off the right edge, is the failure this
 * prevents.
 */
export function resolveBand(
  mode: 'columns' | 'resize',
  edge: 'left' | 'right' | undefined,
  col0: number,
  span0: number,
  steps: number,
): { col: number; span: number } {
  if (mode === 'columns') {
    // Moving: the width is fixed, so the run slides until its right edge meets
    // the measure. It never narrows to keep going.
    return { col: clamp(col0 + steps, 0, COLS - span0), span: span0 }
  }
  if (edge === 'right') {
    return { col: col0, span: clamp(span0 + steps, 1, COLS - col0) }
  }
  // Pulling the left edge pins the right one, so the run grows leftwards.
  const right = col0 + span0
  const col = clamp(col0 + steps, 0, right - 1)
  return { col, span: right - col }
}

/** The leaf under a client point, if the pointer is over one at all. */
function leafAt(geom: Record<number, LeafGeom>, x: number, y: number): [number, LeafGeom] | null {
  for (const [key, g] of Object.entries(geom)) {
    const box = g.el.getBoundingClientRect()
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) return [Number(key), g]
  }
  return null
}

/**
 * How close the pointer counts as "the same place" when two snap lines coincide.
 *
 * Backing-store units are device pixels, so this is about a hair on screen. It
 * exists only to break ties deterministically — a row line and the foot of a
 * block are very often within a rounding error of each other, and preferring
 * whichever `Math.min` happened to see first made the preview flicker between
 * two identical answers.
 */
const TIE = 0.5

/**
 * Resolve a proposed top edge into an index, a snapped top, and the pins.
 *
 * ## The page you can see is the page you will get
 *
 * This used to have to answer every question about a *hypothetical* page: the
 * one where the dragged block has already been removed and everything below it
 * has flowed up by that block's height. That is gone, because the flow-up is
 * gone — `pins` holds the rest of the leaf where it is. So the rects this reads
 * are the rects the drop produces, and the promise it makes is one
 * `scripts/check-editing.mjs` can assert in its strong form: the y resolved
 * here is the y the painter paints.
 *
 * ## Clearing, not crossing
 *
 * A block moves past a neighbour when it has cleared that neighbour's *bottom*,
 * not when it has crossed its midpoint. Midpoints are the right rule when the
 * only question is "before or after", and the wrong one here: passing halfway
 * down a block means you want to sit beside it, which is not a thing this
 * layout does — whereas clearing it entirely can only mean you want to be below
 * it. It also keeps the preview honest, since the block is never drawn
 * overlapping one it has not passed.
 *
 * ## Where it is allowed to come to rest
 *
 * Not anywhere. The candidates are:
 *
 *   - every row line of the {@link ROW_LINES} grid, which is the vertical half
 *     of the Swiss grid and the reason a page arranged by somebody with no
 *     opinion about vertical rhythm still has one;
 *   - the foot of each other block plus `DROP_CLEARANCE`, i.e. tucked directly
 *     under it at the spacing the stack would have used anyway;
 *   - the head of each other block less this block's height and the same
 *     clearance — the mirror of that, directly above;
 *   - the bottom margin, less this block's height, so something can be hung off
 *     the foot of the page;
 *   - and the floor itself, which is where the flow would have put it.
 *
 * The nearest one wins outright. There is no radius and no free-form fallback:
 * "somewhat freeform" is exactly the behaviour this replaces, because a block
 * left 4pt off a line is a mistake nobody can see until it prints.
 *
 * Every candidate is also capped at the bottom margin: a block cannot be put
 * anywhere that would hang its foot past `CONTENT_BOTTOM`, however far down the
 * page the pointer goes. The margin is the page, not a suggestion.
 *
 * Candidates below the floor are dropped rather than clamped. The floor is
 * where the block above ends, and the compositor takes `max(flow, top)` — so a
 * candidate under it would be a promise the painter quietly declines to keep,
 * and the preview would sit somewhere the block does not land.
 */
export function placementAt(
  g: LeafGeom,
  leafIndex: number,
  blockId: string,
  /** The block's proposed top edge, in this leaf's backing-store units. */
  top: number,
  /**
   * The block's own height, for a drag that has left the page it started on.
   *
   * Two of the snap lines are measured from the *foot* of the block — the
   * bottom margin, and sitting directly above a neighbour — so they need a
   * height, and a block arriving from the facing page is not in this leaf's
   * rects to be measured. The caller reads it off the leaf the drag started on.
   * Ignored when the block is on this page, which measures itself.
   */
  fromH = 0,
): Placement {
  const px = (v: number) => (v / PAGE_H) * g.height
  const pt = (v: number) => (v / g.height) * PAGE_H

  const self = g.placed.find((p) => p.block.id === blockId)
  const selfH = self?.rect.h ?? fromH
  const clearance = px(DROP_CLEARANCE)

  // The other blocks, exactly where they are painted — because that is exactly
  // where they will still be. This used to have to predict the page closing up
  // behind the block as it left, and shift everything below it up by the
  // block's height plus the system gap before asking any question of it. The
  // pins removed the need: nothing flows up any more, so what is on screen is
  // what the drop will produce, and the resolver can read the screen.
  const others = g.placed
    .filter((p) => p.block.id !== blockId)
    .map((p) => ({ block: p.block, y: p.rect.y, h: p.rect.h }))

  let at = 0
  while (at < others.length && others[at].y + others[at].h <= top) at += 1

  // The lowest edge the painter would accept: the foot of whatever ends up
  // above, plus the system gap, or the flow's own start for a block landing
  // first on the page.
  const above = others[at - 1]
  const floor = above ? above.y + above.h + px(GAP.block) : g.origin

  // The lowest top edge that still leaves the whole block inside the type area.
  // Everything the gesture is offered is measured against this as well as the
  // floor: the bottom margin is not a guideline the drag may overshoot, so a
  // row line low enough to hang the block's foot off the page is simply not one
  // of the places it can come to rest.
  const ceiling = px(CONTENT_BOTTOM) - selfH

  const candidates = [
    floor,
    ceiling,
    ...ROW_LINES.map(px),
    ...others.flatMap((o) => [o.y + o.h + clearance, o.y - selfH - clearance]),
  ].filter((c) => c >= floor - TIE && c <= ceiling + TIE)

  let topPx = floor
  let best = Infinity
  for (const c of candidates) {
    const d = Math.abs(c - top)
    if (d < best - TIE) {
      best = d
      topPx = c
    }
  }
  // A block taller than the room left below the one above it has no legal
  // resting place at all, and there is nothing honest to do but leave it where
  // the flow puts it — the overflow note is what speaks to that. The floor wins
  // over the ceiling either way, because the painter takes `max(flow, top)` and
  // a top above the floor is a promise it would quietly decline to keep.
  topPx = Math.max(Math.min(topPx, ceiling), floor)

  return {
    leafIndex,
    at,
    top: pt(topPx),
    topPx,
    // Everything else on the leaf that is still in pure flow, told where it
    // already is. Read off `g.placed` rather than `others` so the values are
    // the page as painted, not the page with the drag's shift applied to it.
    pins: g.placed
      .filter((p) => p.block.id !== blockId && p.block.top === undefined)
      .map((p) => ({ id: p.block.id, top: pt(p.rect.y) })),
  }
}

export const useBlockDrag = create<DragState>()((set, get) => ({
  geom: {},
  register: (index, geom) => set((s) => ({ geom: { ...s.geom, [index]: geom } })),
  forget: (index) =>
    set((s) => {
      if (!(index in s.geom)) return s
      const next = { ...s.geom }
      delete next[index]
      return { geom: next }
    }),

  drag: null,

  begin: (d) =>
    set({
      drag: { ...d, mode: d.mode ?? 'pending', x: d.startX, y: d.startY, target: null, band: null },
    }),

  move: (x, y) => {
    const { drag, geom } = get()
    if (!drag) return

    const dx = x - drag.startX
    const dy = y - drag.startY

    let mode = drag.mode
    if (mode === 'pending') {
      if (Math.hypot(dx, dy) < THRESHOLD) {
        set({ drag: { ...drag, x, y } })
        return
      }
      mode = Math.abs(dx) > Math.abs(dy) * SIDEWAYS ? 'columns' : 'reorder'
    }

    const source = geom[drag.fromLeaf]
    if (!source) return

    // Client pixels to whole columns. Taken from the *start* of the gesture
    // rather than accumulated per event, so the block never drifts a column
    // away from where the pointer says it is.
    const box = source.el.getBoundingClientRect()
    const steps = columnSteps(dx, box.width, source.pageWpt)

    let target: Drag['target'] = null
    let band: Drag['band'] = null

    if (mode === 'reorder') {
      const over = leafAt(geom, x, y)
      if (over) {
        const [index, g] = over
        const box = g.el.getBoundingClientRect()
        // The pointer, less where the block was grabbed, in that leaf's units.
        const top = ((y - drag.grabDY - box.top) / box.height) * g.height
        // The block's height, taken from the page it started on, for a drag
        // that has crossed the spine — see `placementAt`.
        const fromH = source.placed.find((p) => p.block.id === drag.blockId)?.rect.h ?? 0
        target = placementAt(g, index, drag.blockId, top, fromH)
      }
    } else {
      band = resolveBand(mode, drag.edge, drag.col0, drag.span0, steps)
    }

    set({ drag: { ...drag, mode, x, y, target, band } })
  },

  end: () => {
    const { drag } = get()
    const real = drag && drag.mode !== 'pending' ? drag : null
    set({ drag: null, suppress: !!real })
    return real
  },

  cancel: () => set({ drag: null, suppress: false }),

  suppress: false,
  consumeSuppress: () => {
    if (!get().suppress) return false
    set({ suppress: false })
    return true
  },
}))

/** The page width in points for a leaf, matching `render/sheet.ts`. */
export const pageWidthPt = (full: boolean | undefined): number => (full ? SPREAD_W : PAGE_W)
