import type { FormatId, PageFormat } from '../config/formats'
import type { Box, PageElement } from '../doc/types'
import type { Grid } from '../render/grid'

export interface TemplateCtx {
  format: PageFormat
  g: Grid
}

export interface Template {
  id: string
  label: string
  formats: FormatId[]
  /**
   * Returns grid boxes only, never pixels, and reads `g.cols` / `g.rows` rather
   * than hard-coding counts — so one definition serves the 12-column slide and
   * the 6-column report without branching.
   */
  build(ctx: TemplateCtx): PageElement[]
}

/** Shorthand so a template body reads as composition rather than arithmetic. */
export const box = (col: number, row: number, colSpan: number, rowSpan: number): Box => ({
  col,
  row,
  colSpan,
  rowSpan,
})

/** A fraction of the grid, rounded to whole cells and never less than one. */
export const frac = (total: number, f: number): number => Math.max(1, Math.round(total * f))
