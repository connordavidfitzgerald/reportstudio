import { useMemo } from 'react'
import { getFormat } from '../config/formats'
import type { Deck } from '../doc/types'
import type { RenderPage } from '../render/page'
import { buildPageEnv, type RenderAssets } from '../render/env'
import { measureCtx } from '../render/measureCtx'
import { layoutPage, type Placed } from '../render/layoutPage'

/**
 * Every element on a page resolved to pixels, at the format's *base* size.
 *
 * Pinning this to base pixels rather than the preview's on-screen size gives the
 * editor, the SVG overlay's viewBox and the pointer mapping one shared
 * coordinate space, so none of them can drift from each other or from the paint.
 */
export function usePlacedElements(
  page: RenderPage,
  deck: Deck,
  assets: RenderAssets,
  fontsReady: boolean,
): Placed[] {
  return useMemo(() => {
    if (!fontsReady) return []
    const f = getFormat(deck.format)
    const env = buildPageEnv(measureCtx(), page, deck, f.w, f.h, assets)
    return layoutPage(env)
  }, [page, deck, assets, fontsReady])
}
