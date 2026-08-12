import { useEffect, useRef } from 'react'
import { PAGE_H, PAGE_W } from '../config/brand'
import type { Deck, Leaf } from '../doc/types'
import { renderLeaf } from '../render/leaf'
import type { RenderAssets } from '../render/compose'
import { useFontsReady } from '../hooks/useFontsReady'
import { useRenderAssets } from '../hooks/useRenderAssets'
import { useDeck } from '../store/useDeck'

const THUMB_W = 74

function Thumb({
  leaf,
  index,
  deck,
  assets,
  ready,
  active,
}: {
  leaf: Leaf
  index: number
  deck: Deck
  assets: RenderAssets
  ready: boolean
  active: boolean
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const selectLeaf = useDeck((s) => s.selectLeaf)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !ready) return
    // Thumbnails are rasterised at device resolution too — on a 2x display a
    // 74px backing store upscaled to 148 device pixels is exactly as soft as
    // the main canvas was.
    const dpr = window.devicePixelRatio || 1
    const w = Math.round((leaf.full ? THUMB_W * 2 : THUMB_W) * dpr)
    canvas.width = w
    canvas.height = Math.round(THUMB_W * dpr * (PAGE_H / PAGE_W))
    canvas.style.width = `-epx`
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    // `thumb` skips the overlays — grain at 74px is invisible and not free.
    renderLeaf(ctx, leaf, deck, w, assets, { index, quality: 'thumb' })
  }, [leaf, deck, assets, ready, index])

  return (
    <button
      type="button"
      onClick={() => selectLeaf(index)}
      className="flex shrink-0 flex-col items-center gap-1"
      title={`Page ${index + 1}`}
    >
      <canvas ref={ref} className={`block border ${active ? 'border-[#FF669E]' : 'border-black/20'}`} />
      <span className="text-[9px] text-black/45">{index + 1}</span>
    </button>
  )
}

/**
 * The page strip.
 *
 * Leaves are shown in pairs with a hairline between spreads, so the pairing the
 * spread view uses is legible here too — otherwise moving a page would shuffle
 * every subsequent recto with no visible reason.
 */
export function SpreadStrip() {
  const deck = useDeck((s) => s.deck)
  const leafIndex = useDeck((s) => s.leafIndex)
  const addLeaf = useDeck((s) => s.addLeaf)
  const duplicateLeaf = useDeck((s) => s.duplicateLeaf)
  const removeLeaf = useDeck((s) => s.removeLeaf)
  const ready = useFontsReady()
  const assets = useRenderAssets()

  return (
    <div className="flex items-end gap-2 overflow-x-auto border-t border-black p-2">
      {deck.leaves.map((leaf, i) => (
        <div key={leaf.id} className="flex items-end gap-2">
          <Thumb
            leaf={leaf}
            index={i}
            deck={deck}
            assets={assets}
            ready={ready}
            active={i === leafIndex}
          />
          {/* Spine marker: after a full leaf, or after every odd page. */}
          {(leaf.full || i % 2 === 0) && i < deck.leaves.length - 1 && (
            <span className="mb-4 h-14 w-px bg-black/15" />
          )}
        </div>
      ))}

      <div className="ml-2 flex shrink-0 flex-col gap-1">
        <button
          type="button"
          onClick={() => addLeaf()}
          className="border border-black px-2 py-1 text-[10px] uppercase hover:bg-black hover:text-white"
        >
          + Page
        </button>
        <button
          type="button"
          onClick={() => duplicateLeaf(leafIndex)}
          className="border border-black/30 px-2 py-1 text-[10px] uppercase hover:bg-black hover:text-white"
        >
          Duplicate
        </button>
        <button
          type="button"
          onClick={() => removeLeaf(leafIndex)}
          disabled={deck.leaves.length <= 1}
          className="border border-black/30 px-2 py-1 text-[10px] uppercase disabled:opacity-30 hover:bg-black hover:text-white"
        >
          Delete
        </button>
      </div>
    </div>
  )
}
