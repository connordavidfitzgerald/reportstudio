import { useEffect, useRef, useState } from 'react'
import { useFontsReady } from '../core/hooks/useFontsReady'
import { getFormat } from '../config/formats'
import { useImageCache } from '../doc/imageCache'
import { renderPage } from '../render/renderPage'
import { useDeck, useCurrentPage } from '../store/useDeck'
import { useCanvasEditor } from '../hooks/useCanvasEditor'
import { useDropImage } from '../hooks/useDropImage'
import { usePlacedElements } from '../hooks/usePlacedElements'
import { useRenderAssets } from '../hooks/useRenderAssets'
import { PageOverlay } from './PageOverlay'
import { TextEditor } from './TextEditor'

/**
 * The page preview. The canvas is sized to the format's true pixel dimensions
 * and CSS-scaled down, so pointer coordinates, element rects and the SVG
 * overlay's viewBox all live in one canonical "page pixel" space.
 */
export function PageCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Held in state rather than read from the ref so the editor re-measures once
  // the canvas has actually mounted and has a box to scale against.
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null)

  const page = useCurrentPage()
  const deck = useDeck((s) => s.deck)
  const editingId = useDeck((s) => s.editingId)
  const removeElements = useDeck((s) => s.removeElements)
  const selectedIds = useDeck((s) => s.selectedIds)
  const fontsReady = useFontsReady()
  const assets = useRenderAssets()
  // Bumps whenever an image finishes decoding; in the deps purely to repaint.
  const imageVersion = useImageCache()

  const format = getFormat(deck.format)
  const placed = usePlacedElements(page, deck, assets, fontsReady)
  const { overlay, cursor, handlers } = useCanvasEditor(canvasRef, page, deck, placed)
  const { dropping, handlers: dropHandlers } = useDropImage(canvasRef, page, deck, placed)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !fontsReady) return
    canvas.width = format.w
    canvas.height = format.h
    const ctx = canvas.getContext('2d')!
    renderPage(ctx, page, deck, format.w, format.h, assets, { editingId })
    setCanvasEl(canvas)
  }, [page, deck, format.w, format.h, assets, fontsReady, editingId, imageVersion])

  // Delete/Backspace removes the selection — but never while a caret is in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (!selectedIds.length) return
      e.preventDefault()
      removeElements(page.id, selectedIds)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedIds, page.id, removeElements])

  const editing = editingId ? placed.find((p) => p.el.id === editingId) : null

  return (
    <div className="flex h-full items-center justify-center overflow-hidden p-6">
      <div className="relative" {...dropHandlers}>
        <canvas
          ref={canvasRef}
          {...handlers}
          style={{ width: 'auto', height: 'auto', cursor, touchAction: 'none' }}
          className={`block max-h-[85vh] max-w-full border ${
            dropping ? 'border-2 border-[#FF669E]' : 'border-black'
          }`}
        />
        <PageOverlay format={format} overlay={overlay} />
        {editing && editing.el.kind === 'text' && (
          <TextEditor
            key={editing.el.id}
            placed={editing}
            pageId={page.id}
            canvas={canvasEl}
            shortEdge={Math.min(format.w, format.h)}
          />
        )}
      </div>
    </div>
  )
}
