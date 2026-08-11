import { OUTLINE_COLOR } from '../core/config/constants'
import { getPalette } from '../core/config/palettes'
import type { Palette } from '../core/types'
import type { BgRole, Deck } from '../doc/types'
import type { RenderPage } from './page'
import { getFormat, typeStepFor, type PageFormat } from '../config/formats'
import { grid, type Grid } from './grid'

export interface RenderAssets {
  logo: HTMLImageElement | null
  /** Loaded paper textures keyed by paper id. */
  papers: Record<string, HTMLImageElement | null>
  /** Decoded image for a stored reference, or null while it loads. See `doc/imageCache.ts`. */
  image: (ref: import('../core/imageStore').ImageRef | null) => HTMLImageElement | null
}

/**
 * Thumbnails skip the halftone shader and the paper textures: below ~200px the
 * dots and the grain are sub-pixel noise, so both cost real work to produce
 * something indistinguishable from the plain image — 40 times over, on a strip
 * that repaints while you type.
 */
export type Quality = 'full' | 'thumb'

/** Everything needed to lay out or draw one page. */
export interface PageEnv {
  ctx: CanvasRenderingContext2D
  page: RenderPage
  deck: Deck
  format: PageFormat
  palette: Palette
  g: Grid
  w: number
  h: number
  /** Short edge — every type size and padding is a fraction of it. */
  shortEdge: number
  assets: RenderAssets
  /** >1 when exporting at higher resolution; threaded into the halftone shader. */
  renderScale: number
  quality: Quality
  /**
   * The element currently being edited in the DOM textarea overlay. Its
   * background is still drawn but its glyphs are not — the textarea supplies
   * those, so text is never doubled or half-committed.
   */
  editingId?: string | null
}

export interface PageEnvOptions {
  renderScale?: number
  quality?: Quality
  editingId?: string | null
}

export function buildPageEnv(
  ctx: CanvasRenderingContext2D,
  page: RenderPage,
  deck: Deck,
  w: number,
  h: number,
  assets: RenderAssets,
  opts: PageEnvOptions = {},
): PageEnv {
  const format = getFormat(deck.format)
  return {
    ctx,
    page,
    deck,
    format,
    palette: getPalette(page.paletteId ?? deck.paletteId),
    g: grid(w, h, format.cols, format.rows, format.margin * w),
    w,
    h,
    shortEdge: Math.min(w, h),
    assets,
    renderScale: opts.renderScale ?? 1,
    quality: opts.quality ?? 'full',
    editingId: opts.editingId ?? null,
  }
}

/** Resolve a step on the format's modular scale to pixels at this page size. */
export const sizeOf = (env: PageEnv, step: number): number =>
  env.shortEdge * typeStepFor(env.format, step)

/** Resolve a palette role to a colour. `none` means "draw no background". */
export function colorOf(env: PageEnv, role: BgRole): string | null {
  switch (role) {
    case 'outline':
      return OUTLINE_COLOR
    case 'secondary':
      return env.palette.secondaryBg
    case 'highlight':
      return env.palette.highlight
    case 'background':
      return env.palette.background
    case 'none':
      return null
  }
}
