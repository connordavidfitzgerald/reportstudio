import { GRID_COLUMNS } from '../core/config/constants'
import type { Rect } from '../core/types'
import type { Box } from '../doc/types'

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n))

/**
 * The page grid: `cols` columns and `rows` rows, no margin and no gutter, all
 * derived live from the page dimensions so the same helper serves the preview,
 * a 160px thumbnail and a 2× export.
 *
 * This is the only place grid cells become pixels. Elements store nothing but a
 * {@link Box}, which is what makes an off-grid element unrepresentable rather
 * than merely discouraged.
 */
export function grid(w: number, h: number, cols = GRID_COLUMNS, rows = 12) {
  const colW = w / cols
  const rowH = h / rows
  return {
    w,
    h,
    cols,
    rows,
    colW,
    rowH,
    /** Left x of column index `c` (0-based). */
    colX: (c: number) => c * colW,
    /** Top y of row index `r` (0-based). */
    rowY: (r: number) => r * rowH,
    /** Width spanning `n` columns. */
    span: (n: number) => n * colW,
    /** Height spanning `n` rows. */
    vspan: (n: number) => n * rowH,

    /** A grid box as a pixel rect. */
    rect: (box: Box): Rect => ({
      x: box.col * colW,
      y: box.row * rowH,
      w: box.colSpan * colW,
      h: box.rowSpan * rowH,
    }),

    /** The cell containing a pixel point, clamped into the page. */
    cellAt: (x: number, y: number) => ({
      col: clamp(Math.floor(x / colW), 0, cols - 1),
      row: clamp(Math.floor(y / rowH), 0, rows - 1),
    }),

    /** Whole rows needed to cover `px` of measured height. */
    rowsFor: (px: number) => Math.max(1, Math.ceil(px / rowH - 1e-6)),

    /** Keep a box inside the page without changing its size where possible. */
    clampBox: (box: Box): Box => {
      const colSpan = clamp(box.colSpan, 1, cols)
      const rowSpan = clamp(box.rowSpan, 1, rows)
      return {
        colSpan,
        rowSpan,
        col: clamp(box.col, 0, cols - colSpan),
        row: clamp(box.row, 0, rows - rowSpan),
      }
    },
  }
}

export type Grid = ReturnType<typeof grid>
