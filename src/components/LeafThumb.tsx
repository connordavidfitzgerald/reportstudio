import { useEffect, useRef } from 'react'
import { PAGE_H, PAGE_W } from '../config/brand'
import { useImageCache } from '../doc/imageCache'
import type { Deck, Leaf } from '../doc/types'
import { renderLeaf } from '../render/leaf'
import { useFontsReady } from '../hooks/useFontsReady'
import { useRenderAssets } from '../hooks/useRenderAssets'

/**
 * One page, small.
 *
 * The same painters that draw the spread, at a fraction of the size — which is
 * what makes a thumbnail worth showing at all: it is the page, not a diagram of
 * one. Used by the page strip and by the template picker, so that choosing a
 * template means looking at what it produces rather than reading its name.
 *
 * Rasterised at device resolution for the same reason the main canvas is: a
 * 74px backing store upscaled to 148 device pixels is exactly as soft there as
 * it would be at full size.
 */
export function LeafThumb({
  leaf,
  deck,
  width,
  index = 0,
  className = '',
}: {
  leaf: Leaf
  deck: Deck
  /** CSS width in px. A full-spread leaf is drawn at twice this. */
  width: number
  index?: number
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const ready = useFontsReady()
  const assets = useRenderAssets()
  const imageVersion = useImageCache()

  const cssWidth = leaf.full ? width * 2 : width

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !ready) return
    const dpr = window.devicePixelRatio || 1
    const w = Math.round(cssWidth * dpr)
    canvas.width = w
    canvas.height = Math.round(width * dpr * (PAGE_H / PAGE_W))
    canvas.style.width = `${cssWidth}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // `thumb` skips the overlays — grain at this size is invisible and not free.
    renderLeaf(ctx, leaf, deck, w, assets, { index, quality: 'thumb' })
  }, [leaf, deck, assets, ready, index, imageVersion, cssWidth, width])

  return <canvas ref={ref} className={`block ${className}`} />
}
