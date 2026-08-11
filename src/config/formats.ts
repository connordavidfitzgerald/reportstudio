import { DEFAULT_HALFTONE, TYPE_RATIO } from '../core/config/constants'
import type { HalftoneParams } from '../core/types'

export type FormatId = 'slide' | 'letter'

export interface PageFormat {
  id: FormatId
  label: string
  /** Base render resolution. All geometry is a fraction of these, so any export scale works. */
  w: number
  h: number
  cols: number
  rows: number
  /** PDF page size in points (1pt = 1/72in). */
  ptW: number
  ptH: number
  /**
   * Step 0 of the modular scale, as a fraction of the short edge. The *ratio* is
   * the brand's (1.25, shared); only the base is per-format. See `sizeOf`.
   */
  typeBase: number
  halftone: HalftoneParams
}

/**
 * ## Columns
 *
 * 12 for slides and 6 for reports. Both divide by 2 and 3, so the two-up and
 * three-up compositions a deck needs constantly — three stats, three TOC
 * columns, a two-thirds/one-third split — land on exact column lines. The
 * poster's 10 has no thirds and would have forced every three-up layout into a
 * lopsided 3/3/4.
 *
 * No margin and no gutter, same as the poster: full-bleed colour fields running
 * to the page edge are the brand look, and a gutter would put a background-
 * coloured sliver between two blocks that are meant to butt together.
 *
 * ## Rows
 *
 * New here. The poster's grid is columns-only because its layouts owned the
 * vertical axis themselves; placing elements by hand makes vertical position
 * user data, so it needs the same discretisation or "always snaps" is only half
 * true.
 *
 * The slide is 12 × 12, which makes every cell 160 × 90 — a 16:9 miniature of
 * the page itself. The report is 6 × 18: a portrait page carries far more
 * vertical content than horizontal, so rows are deliberately finer than columns
 * (a row is ~0.61in, roughly three lines of body copy).
 */
export const PAGE_FORMATS: PageFormat[] = [
  {
    id: 'slide',
    label: 'Presentation',
    // 13.333 × 7.5in at 144dpi — standard widescreen. Cell: 160 × 90.
    w: 1920,
    h: 1080,
    cols: 12,
    rows: 12,
    ptW: 960,
    ptH: 540,
    // step 0 = 28px = 14pt, read at a distance.
    typeBase: 0.026,
    halftone: { ...DEFAULT_HALFTONE, dotScale: 3 },
  },
  {
    id: 'letter',
    label: 'Report',
    // US Letter at 150dpi, so a 2× export is a true 300dpi. Cell: 212.5 × 91.67.
    w: 1275,
    h: 1650,
    cols: 6,
    rows: 18,
    ptW: 612,
    ptH: 792,
    // step 0 = 20.8px = 10pt, read in the hand. The poster's 0.035 would be 21pt here.
    typeBase: 0.0163,
    halftone: { ...DEFAULT_HALFTONE, dotScale: 3.5 },
  },
]

export const getFormat = (id: FormatId): PageFormat =>
  PAGE_FORMATS.find((f) => f.id === id) ?? PAGE_FORMATS[0]

/**
 * The modular type scale, re-based per format. The ladder and its 1.25 ratio are
 * the brand's; only step 0 moves, because "3.5% of the short edge" is correct
 * for a poster read on a phone and absurd (21pt body copy) on a printed page.
 *
 *   step  slide     letter
 *     0   14.0pt    10.0pt   body / caption
 *     1   17.5pt    12.5pt   label, page number
 *     2   21.9pt    15.6pt   lede
 *     4   34.2pt    24.4pt   subhead
 *     6   53.4pt    38.1pt   slide headline / chapter title
 *     8   83.5pt    59.6pt   title slide / cover
 */
export const typeStepFor = (format: PageFormat, step: number): number =>
  format.typeBase * TYPE_RATIO ** step
