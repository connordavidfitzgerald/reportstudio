import type { Rect } from '../core/types'
import type { Page, PageElement } from '../doc/types'
import type { Grid } from './grid'

/**
 * How a page is presented to the renderer.
 *
 * The document says what a page *contains*; this says where each thing goes and
 * where it came from. Splitting them is what lets flowed content — whose vertical
 * position is computed, not authored — reach the same `layoutPage` → `drawElement`
 * path as hand-placed content, instead of needing a second renderer that could
 * drift from the first.
 */

/**
 * Where an item came from. The editor branches on this: a flowed element can be
 * selected and edited but not dragged (its position is a return value, not
 * state), furniture can't be touched at all, and free/pinned elements behave as
 * they always have.
 */
export type ItemSource = 'free' | 'pinned' | 'flow' | 'furniture'

/**
 * Geometry for flowed content.
 *
 * Horizontal stays exactly on the grid — a flow region is declared in columns, so
 * every fragment's x and width are grid-exact by construction. Vertical is a
 * continuous fraction of page height, because it has to be: a row on the A4
 * format is ~13.9pt against a 12.5pt body line, and quantising paragraph tops to
 * whole rows is not typesetting.
 *
 * Fractions rather than pixels so a single flow pass at base size serves the
 * preview, a 148px thumbnail and a 2× export alike.
 */
export interface Frame {
  col: number
  colSpan: number
  yFrac: number
  hFrac: number
  /**
   * Sub-column horizontal override, as fractions of page width.
   *
   * The one deliberate exception to "horizontal is grid-exact": a chart bar's
   * width *is* its value, so snapping it to a column line would misreport the
   * data. Nothing else should use this — if a layout wants an off-grid edge for
   * aesthetic reasons, that is what the grid is there to prevent.
   */
  xFrac?: number
  wFrac?: number
}

/** The only place a {@link Frame} becomes pixels. */
export const frameRect = (g: Grid, f: Frame, h: number): Rect => ({
  x: f.xFrac === undefined ? g.colX(f.col) : g.margin + f.xFrac * g.inner.w,
  y: f.yFrac * h,
  w: f.wFrac === undefined ? g.span(f.colSpan) : f.wFrac * g.inner.w,
  h: f.hFrac * h,
})

/**
 * One thing to draw. `boxed` items take their geometry from the element's grid
 * `Box`, exactly as they always have; `framed` items take it from the flow.
 */
export type RenderItem =
  | { kind: 'boxed'; el: PageElement; source: 'free' | 'pinned' | 'furniture' }
  | {
      kind: 'framed'
      el: PageElement
      frame: Frame
      /**
       * Furniture is framed rather than boxed because a 1pt rule is thinner than
       * any grid row — page chrome needs the same continuous vertical axis that
       * flowed content does.
       */
      source: 'flow' | 'furniture'
      /** Flowed items only; furniture belongs to no block. */
      blockId?: string
    }

export interface RenderPage {
  id: string
  /** Per-page palette override; falls back to the deck's. */
  paletteId?: string
  /** Paint order — later items sit on top. */
  items: RenderItem[]
}

/**
 * A hand-composed page as the renderer sees it: every element boxed and free.
 *
 * Memoised on the page's identity, so repeated calls return the same object and
 * `PageStrip`'s "did this page actually change" bail-out keeps working — without
 * it, a strip of forty thumbnails would repaint on every keystroke.
 */
const renderPages = new WeakMap<Page, RenderPage>()

export function toRenderPage(page: Page): RenderPage {
  const cached = renderPages.get(page)
  if (cached) return cached
  const rp: RenderPage = {
    id: page.id,
    paletteId: page.paletteId,
    items: page.elements.map((el) => ({ kind: 'boxed', el, source: 'free' })),
  }
  renderPages.set(page, rp)
  return rp
}
