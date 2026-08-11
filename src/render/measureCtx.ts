import type { RenderAssets } from './env'

/**
 * The shared scratch context used for text measurement.
 *
 * `measureText` needs a context, not pixels, so this stays 1×1 forever — all
 * layout math is driven by the width and height arguments passed to
 * `buildPageEnv`, never by the canvas size. One module-level instance so
 * pagination, the editor's hit-test geometry and the exporter all measure
 * against the same object and cannot disagree.
 */
let scratch: CanvasRenderingContext2D | null = null

export function measureCtx(): CanvasRenderingContext2D {
  if (!scratch) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    scratch = c.getContext('2d')!
  }
  return scratch
}

/**
 * Assets for a measuring-only pass. Pagination needs a `PageEnv`, but measuring
 * text never touches the logo, the papers or a decoded image — so handing it
 * empty assets is honest rather than a stub, and avoids making page derivation
 * depend on load order.
 */
const EMPTY_ASSETS: RenderAssets = { logo: null, papers: {}, image: () => null }
export const renderAssetsForMeasuring = (): RenderAssets => EMPTY_ASSETS
