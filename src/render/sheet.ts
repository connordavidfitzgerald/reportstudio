import type { Rect } from './types'
import {
  COLS,
  GUTTER,
  MARGIN,
  MEASURE,
  PAGE_H,
  PAGE_W,
  SPREAD_W,
  CONTENT_TOP,
  CONTENT_BOTTOM,
} from '../config/brand'

/**
 * The one place points become pixels.
 *
 * `config/brand.ts` is entirely in points at the A4 page, because that is what
 * makes it checkable against the Figma file. A sheet carries the single scale
 * factor that maps those points onto whatever canvas is being painted — the
 * live spread, a thumbnail, a 2× export — so no geometry anywhere else has to
 * know what resolution it is running at.
 *
 * Because the scale is uniform and applied once, a page cannot end up subtly
 * stretched on one axis. The old multi-format setup could: it carried separate
 * `ptW/w` and `ptH/h` ratios and needed a test to prove they agreed.
 */
export interface Sheet {
  /** Pixels per point. */
  readonly s: number
  /** Canvas size of this sheet, in pixels. */
  readonly w: number
  readonly h: number
  /** Points → pixels. */
  pt(v: number): number
  /** The content box, in pixels. */
  readonly content: Rect
  /** Number of columns. */
  readonly cols: number
  /** Left edge of column `c` (0-based) in pixels, measured from the page edge. */
  colX(c: number): number
  /** Width of a run of `n` columns in pixels, gutters included. */
  colSpan(n: number): number
  /** Column width in points — 51 on a leaf, wider on the full-spread cover. */
  readonly colWPt: number
}

interface SheetSpec {
  /** Page width in points: one leaf, or the full spread for a cover. */
  widthPt: number
  /** Canvas width in pixels. */
  widthPx: number
}

function makeSheet({ widthPt, widthPx }: SheetSpec): Sheet {
  const s = widthPx / widthPt
  const measurePt = widthPt - MARGIN * 2
  // Derived rather than stated so the full-spread cover gets a real 9-column
  // grid too. On a leaf this comes out at exactly 51: (515 − 56) / 9.
  const colWPt = (measurePt - GUTTER * (COLS - 1)) / COLS
  const pt = (v: number) => v * s

  return {
    s,
    w: widthPx,
    h: pt(PAGE_H),
    pt,
    content: {
      x: pt(MARGIN),
      y: pt(CONTENT_TOP),
      w: pt(measurePt),
      h: pt(CONTENT_BOTTOM - CONTENT_TOP),
    },
    cols: COLS,
    colX: (c) => pt(MARGIN + c * (colWPt + GUTTER)),
    colSpan: (n) => pt(n * colWPt + (n - 1) * GUTTER),
    colWPt,
  }
}

/**
 * A single A4 leaf. `widthPx` is whatever the caller is painting into — pass
 * `PAGE_W` for 1:1, `PAGE_W * 2` for a 288dpi export, ~150 for a thumbnail.
 */
export const leafSheet = (widthPx: number = PAGE_W): Sheet =>
  makeSheet({ widthPt: PAGE_W, widthPx })

/**
 * The full 1190pt spread, as one canvas.
 *
 * Only the cover composes across the gutter; every other spread is two leaves
 * laid out independently and shown side by side. Its nine columns are 117.1pt
 * rather than 51 — the same grid stretched to the wider measure, keeping the
 * 40pt margins and 7pt gutters.
 */
export const spreadSheet = (widthPx: number = SPREAD_W): Sheet =>
  makeSheet({ widthPt: SPREAD_W, widthPx })

/** Verify the leaf grid still resolves to the documented 51pt column. */
export const leafColumnWidth = (): number => (MEASURE - GUTTER * (COLS - 1)) / COLS
