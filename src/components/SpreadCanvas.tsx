import { useEffect, useRef } from 'react'
import { PAGE_H, PAGE_W } from '../config/brand'
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
 * will be read. Each leaf is its own canvas at its own true pixel size, CSS-
 * scaled down together — so the pair share one scale and the gutter between them
 * is a real 0pt butt join rather than a CSS gap pretending to be one.
 *
 * The cover is the exception: one canvas across the full 1190.
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

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !ready) return
    const w = leaf.full ? PAGE_W * 2 : PAGE_W
    canvas.width = w
    canvas.height = PAGE_H
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { overflow } = renderLeaf(ctx, leaf, deck, w, assets, { index })
    canvas.dataset.overflow = overflow ? 'true' : 'false'
  }, [leaf, deck, assets, ready, index, imageVersion])

  return (
    <canvas
      ref={ref}
      onClick={onSelect}
      // The height is what's constrained, since two A4 leaves side by side are
      // always wider than they are tall.
      className={`block h-auto max-h-[82vh] w-auto max-w-full cursor-pointer outline-offset-2 ${
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
    <div className="flex h-full items-center justify-center overflow-auto p-6">
      {/* No gap: facing pages meet at the spine, as they do bound. */}
      <div className="flex items-start">
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
            {spread.right && (
              <LeafCanvas
                {...shared}
                leaf={spread.right}
                index={spread.index + 1}
                selected={leafIndex === spread.index + 1}
                onSelect={() => selectLeaf(spread.index + 1)}
              />
            )}
          </>
        )}
      </div>
    </div>
  )
}
