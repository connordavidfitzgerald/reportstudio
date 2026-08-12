import { useEffect, useRef, useState } from 'react'
import { PAGE_H, PAGE_W, SPREAD_W } from '../config/brand'
import { useImageCache } from '../doc/imageCache'
import type { Deck, Leaf } from '../doc/types'
import { deckSpreads } from '../doc/types'
import { renderLeaf } from '../render/leaf'
import type { RenderAssets } from '../render/compose'
import { useFontsReady } from '../hooks/useFontsReady'
import { useRenderAssets } from '../hooks/useRenderAssets'
import { useDeck } from '../store/useDeck'

/**
 * The spread view.
 *
 * Two A4 leaves side by side, which is how the document was designed and how it
 * will be read. The cover is the exception: one canvas across the full 1190.
 *
 * ## Why the sizing is done in JS
 *
 * A canvas has an intrinsic size (its backing store) *and* a CSS size, and
 * letting CSS scale the first to the second is what makes canvas text look
 * soft: on a 2× display, a 595-wide backing store painted into ~1040 device
 * pixels is being upscaled by nearly two, so every stem is resampled.
 *
 * So the CSS size is decided first — by the flex row, from the available height
 * — and the backing store is then sized to match it *in device pixels*. Text is
 * rasterised at exactly the resolution it will be displayed at, which is the
 * only way it comes out crisp. It also means zooming the browser or dragging
 * the window re-renders at the new resolution rather than resampling.
 */

interface LeafCanvasProps {
  leaf: Leaf
  index: number
  deck: Deck
  assets: RenderAssets
  ready: boolean
  selected: boolean
  onSelect: () => void
}

function LeafCanvas({ leaf, index, deck, assets, ready, selected, onSelect }: LeafCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const imageVersion = useImageCache()
  /** CSS width of the canvas, in device pixels. Set by the observer below. */
  const [devicePx, setDevicePx] = useState(0)

  // Track the size the layout actually gave us. There is no circularity here:
  // the canvas is `width: 100%` of a flex child, so its CSS size comes from the
  // row, never from its own backing store.
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const measure = () => {
      const cssWidth = canvas.getBoundingClientRect().width
      if (cssWidth > 0) setDevicePx(Math.round(cssWidth * (window.devicePixelRatio || 1)))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(canvas)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !ready || !devicePx) return
    canvas.width = devicePx
    canvas.height = Math.round(devicePx * (PAGE_H / (leaf.full ? SPREAD_W : PAGE_W)))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingQuality = 'high'
    const { overflow } = renderLeaf(ctx, leaf, deck, devicePx, assets, { index })
    canvas.dataset.overflow = overflow ? 'true' : 'false'
  }, [leaf, deck, assets, ready, index, imageVersion, devicePx])

  return (
    <canvas
      ref={ref}
      onClick={onSelect}
      style={{ aspectRatio: `${leaf.full ? SPREAD_W : PAGE_W} / ${PAGE_H}` }}
      className={`block h-full w-full min-w-0 cursor-pointer outline-offset-2 ${
        selected ? 'outline outline-2 outline-[#FF669E]' : 'outline outline-1 outline-black/20'
      }`}
    />
  )
}

export function SpreadCanvas() {
  const deck = useDeck((s) => s.deck)
  const leafIndex = useDeck((s) => s.leafIndex)
  const selectLeaf = useDeck((s) => s.selectLeaf)
  const ready = useFontsReady()
  const assets = useRenderAssets()

  const spreads = deckSpreads(deck)
  const spread = spreads.find((s) =>
    s.kind === 'full' ? s.index === leafIndex : s.index === leafIndex || s.index + 1 === leafIndex,
  )

  if (!spread) return null

  const shared = { deck, assets, ready }

  return (
    <div className="flex h-full items-center justify-center overflow-hidden p-6">
      {/*
        The stage fixes the spread's aspect and lets height drive width, so the
        pair always fits. Leaves are flex children with no gap — facing pages
        meet at the spine, as they do bound.
      */}
      <div
        className="flex max-h-full max-w-full items-start"
        style={{ aspectRatio: `${SPREAD_W} / ${PAGE_H}`, height: '100%' }}
      >
        {spread.kind === 'full' ? (
          <LeafCanvas
            {...shared}
            leaf={spread.leaf}
            index={spread.index}
            selected={leafIndex === spread.index}
            onSelect={() => selectLeaf(spread.index)}
          />
        ) : (
          <>
            <LeafCanvas
              {...shared}
              leaf={spread.left}
              index={spread.index}
              selected={leafIndex === spread.index}
              onSelect={() => selectLeaf(spread.index)}
            />
            {spread.right ? (
              <LeafCanvas
                {...shared}
                leaf={spread.right}
                index={spread.index + 1}
                selected={leafIndex === spread.index + 1}
                onSelect={() => selectLeaf(spread.index + 1)}
              />
            ) : (
              // Hold the spine in place on an odd last page, so the verso
              // doesn't drift to the middle of the stage.
              <div className="h-full w-full" />
            )}
          </>
        )}
      </div>
    </div>
  )
}
