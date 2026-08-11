import { useEffect, useRef, useState } from 'react'
import { useFontsReady } from '../core/hooks/useFontsReady'
import { getFormat } from '../config/formats'
import { useImageCache } from '../doc/imageCache'
import type { Deck, Page } from '../doc/types'
import { deckPages } from '../doc/sections'
import { renderPage } from '../render/renderPage'
import { useDeck } from '../store/useDeck'
import { useRenderAssets } from '../hooks/useRenderAssets'
import type { RenderAssets } from '../render/env'

const THUMB_W = 148

/**
 * One thumbnail.
 *
 * The `lastPage` guard is what makes a 40-page deck usable: every store mutator
 * rebuilds immutably, so an untouched page keeps its object identity and its
 * thumbnail bails out of the redraw entirely. Typing repaints one canvas, not
 * forty. Thumbnails also render at `quality: 'thumb'`, which skips the halftone
 * shader and the paper textures — both are sub-pixel noise at this size.
 */
function Thumb({
  page,
  deck,
  index,
  active,
  assets,
  fontsReady,
  onSelect,
  onDragStart,
  onDrop,
}: {
  page: Page
  deck: Deck
  index: number
  active: boolean
  assets: RenderAssets
  fontsReady: boolean
  onSelect: () => void
  onDragStart: () => void
  onDrop: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  /** Identity of the last thing painted, so an unrelated edit is a no-op. */
  const painted = useRef<{ page: Page; look: string } | null>(null)
  const imageVersion = useImageCache()

  const format = getFormat(deck.format)
  const h = Math.round((THUMB_W * format.h) / format.w)

  // Deck-level state that changes how a thumbnail looks. Paper is deliberately
  // absent: `quality: 'thumb'` doesn't draw it.
  const look = `${deck.paletteId}|${deck.format}|${imageVersion}`

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !fontsReady) return
    // This guard is what makes a 40-page deck usable. Every store mutator
    // rebuilds immutably, so an untouched page keeps its object identity and
    // bails out here — typing repaints one thumbnail, not forty. It has to
    // cover the deck's look too, or a palette change would leave them stale.
    const prev = painted.current
    if (prev && prev.page === page && prev.look === look) return
    painted.current = { page, look }

    canvas.width = THUMB_W * 2
    canvas.height = h * 2
    const ctx = canvas.getContext('2d')!
    renderPage(ctx, page, deck, canvas.width, canvas.height, assets, { quality: 'thumb' })
  }, [page, deck, assets, fontsReady, h, look])

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="flex shrink-0 flex-col items-center gap-1"
    >
      <button
        type="button"
        onClick={onSelect}
        className={`block border ${active ? 'border-black ring-1 ring-black' : 'border-black/30'}`}
        style={{ width: THUMB_W, height: h }}
      >
        <canvas ref={ref} className="block h-full w-full" />
      </button>
      <span className="font-mono text-[10px] text-black/60">{index + 1}</span>
    </div>
  )
}

export function PageStrip() {
  const deck = useDeck((s) => s.deck)
  const currentPageId = useDeck((s) => s.currentPageId)
  const selectPage = useDeck((s) => s.selectPage)
  const addPage = useDeck((s) => s.addPage)
  const duplicatePage = useDeck((s) => s.duplicatePage)
  const removePage = useDeck((s) => s.removePage)
  const reorderPage = useDeck((s) => s.reorderPage)
  const assets = useRenderAssets()
  const fontsReady = useFontsReady()
  const [dragId, setDragId] = useState<string | null>(null)

  return (
    <div className="flex items-end gap-3 border-t border-black bg-white/95 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-end gap-3 overflow-x-auto">
        {deckPages(deck).map((page, i) => (
          <Thumb
            key={page.id}
            page={page}
            deck={deck}
            index={i}
            active={page.id === currentPageId}
            assets={assets}
            fontsReady={fontsReady}
            onSelect={() => selectPage(page.id)}
            onDragStart={() => setDragId(page.id)}
            onDrop={() => {
              if (dragId && dragId !== page.id) reorderPage(dragId, page.id)
              setDragId(null)
            }}
          />
        ))}
      </div>
      <div className="flex shrink-0 flex-col gap-1">
        <button
          type="button"
          className="border border-black px-2 py-1 font-review text-xs uppercase hover:bg-black/5"
          onClick={() => addPage()}
        >
          Add
        </button>
        <button
          type="button"
          className="border border-black px-2 py-1 font-review text-xs uppercase hover:bg-black/5"
          onClick={() => duplicatePage(currentPageId)}
        >
          Duplicate
        </button>
        <button
          type="button"
          disabled={deckPages(deck).length <= 1}
          className="border border-black px-2 py-1 font-review text-xs uppercase hover:bg-black/5 disabled:opacity-40"
          onClick={() => removePage(currentPageId)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
