import { DEFAULT_HALFTONE, TYPE_RATIO } from '../core/config/constants'
import type { HalftoneParams } from '../core/types'
import { BASELINE, MARGIN, TYPE_RATIO as REPORT_TYPE_RATIO, TYPE_BASE_PT } from './brand'

export type FormatId = 'slide' | 'letter' | 'a4'

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
   * Step 0 of the modular scale, as a fraction of the short edge.
   */
  typeBase: number
  /**
   * Ladder ratio. Per-format since the report redesign measured at 1.2 while the
   * poster-derived slide formats are 1.25 — see `config/brand.ts`.
   */
  typeRatio: number
  halftone: HalftoneParams
  /**
   * Page margin as a fraction of page width, uniform on all four sides. Zero for
   * the slide formats, where full-bleed colour fields running to the trim are the
   * whole look. The report has real margins: the colour field is the page
   * background rather than an element, so bleed and margins coexist.
   */
  margin: number
  /**
   * Vertical rhythm for flowed content, as a fraction of page width. Only the
   * report sets this — it is what keeps type on facing pages registered to the
   * same lines. Undefined means "no flow, place by row".
   */
  baseline?: number
  /** Pages are composed and viewed two-up, as facing pages. */
  spread?: boolean
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
    typeRatio: TYPE_RATIO,
    halftone: { ...DEFAULT_HALFTONE, dotScale: 3 },
    margin: 0,
  },
  {
    id: 'a4',
    label: 'Report',
    // A4 at 150dpi, so a 2× export is a true 300dpi. Content box 515 × 762pt.
    w: 1240,
    h: 1754,
    // 12 columns across the 515pt content box. Halves, thirds, quarters and the
    // 5/7 term|definition split of the definition-list pages all land on lines.
    cols: 12,
    // Whole baselines in the content box (762 / 13.9). Rows exist for *pinned*
    // elements only — flowed content advances by `baseline` directly, so the
    // 0.4% between rowH and the baseline never accumulates in running text.
    rows: 55,
    ptW: 595,
    ptH: 842,
    // step 0 = 12.5pt body copy, read in the hand.
    typeBase: TYPE_BASE_PT / 595,
    typeRatio: REPORT_TYPE_RATIO,
    halftone: { ...DEFAULT_HALFTONE, dotScale: 3.5 },
    margin: MARGIN,
    baseline: BASELINE,
    spread: true,
  },
  {
    id: 'letter',
    label: 'Report (Letter, superseded)',
    // US Letter at 150dpi. Predates the A4 redesign — kept so the existing
    // `templates/report.ts` still resolves. New work should use 'a4'.
    w: 1275,
    h: 1650,
    cols: 6,
    rows: 18,
    ptW: 612,
    ptH: 792,
    typeBase: 0.0163,
    typeRatio: TYPE_RATIO,
    halftone: { ...DEFAULT_HALFTONE, dotScale: 3.5 },
    margin: 0,
  },
]

export const getFormat = (id: FormatId): PageFormat =>
  PAGE_FORMATS.find((f) => f.id === id) ?? PAGE_FORMATS[0]

/**
 * The modular type scale, re-based *and* re-ratioed per format. Step 0 moves
 * because "3.5% of the short edge" is right for a poster read on a phone and
 * absurd (21pt body copy) on a printed page; the ratio moves because the report
 * redesign measured at 1.2 where the poster is 1.25.
 *
 *   step  slide (1.25)   a4 (1.2)
 *     0   14.0pt         12.5pt   body / sub-head / running head
 *     2   21.9pt         18.0pt   lede
 *     4   34.2pt         25.9pt   deck / definition
 *     8   83.5pt         53.7pt   chapter title
 *    10    —             77.4pt   stat number (ceiling; the role auto-fits)
 *
 * The a4 column reproduces the source file exactly — see `config/brand.ts`.
 */
export const typeStepFor = (format: PageFormat, step: number): number =>
  format.typeBase * format.typeRatio ** step
