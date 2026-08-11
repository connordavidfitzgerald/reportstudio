import { useMemo } from 'react'
import { getFormat } from '../config/formats'
import type { Deck, Page } from '../doc/types'
import { buildPageEnv, type RenderAssets } from '../render/env'
import { layoutPage, type Placed } from '../render/layoutPage'

/**
 * A scratch context used only for text measurement. `measureText` needs a
 * context, not pixels, so this stays 1×1 forever — the layout math is driven by
 * the width/height arguments passed to `buildPageEnv`, never by the canvas size.
 */
let scratch: CanvasRenderingContext2D | null = null
function scratchCtx(): CanvasRenderingContext2D {
  if (!scratch) {
    const c = document.createElement('canvas')
    c.width = 1
    c.height = 1
    scratch = c.getContext('2d')!
  }
  return scratch
}

/**
 * Every element on a page resolved to pixels, at the format's *base* size.
 *
 * Pinning this to base pixels rather than the preview's on-screen size gives the
 * editor, the SVG overlay's viewBox and the pointer mapping one shared
 * coordinate space, so none of them can drift from each other or from the paint.
 */
export function usePlacedElements(
  page: Page,
  deck: Deck,
  assets: RenderAssets,
  fontsReady: boolean,
): Placed[] {
  return useMemo(() => {
    if (!fontsReady) return []
    const f = getFormat(deck.format)
    const env = buildPageEnv(scratchCtx(), page, deck, f.w, f.h, assets)
    return layoutPage(env)
  }, [page, deck, assets, fontsReady])
}
