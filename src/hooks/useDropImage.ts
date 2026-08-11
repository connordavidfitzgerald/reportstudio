import { useCallback, useEffect, useState } from 'react'
import { putImageBlob } from '../core/imageStore'
import { getFormat } from '../config/formats'
import { createElement, defaultBox } from '../doc/defaults'
import { preload } from '../doc/imageCache'
import type { Deck } from '../doc/types'
import type { RenderPage } from '../render/page'
import { grid } from '../render/grid'
import { hitTest } from '../render/hitTest'
import type { Placed } from '../render/layoutPage'
import { useDeck } from '../store/useDeck'

/**
 * Drag an image file onto the canvas to place it, Google-Slides style.
 *
 * Dropping onto an existing image replaces its source in place; dropping onto
 * empty canvas creates a new element anchored at that grid cell. The file is
 * decoded *before* it reaches the store, so the first paint after a drop already
 * has pixels rather than flashing an empty box.
 */
export function useDropImage(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  page: RenderPage,
  deck: Deck,
  placed: Placed[],
) {
  const addElement = useDeck((s) => s.addElement)
  const setElement = useDeck((s) => s.setElement)
  const [dropping, setDropping] = useState(false)

  const format = getFormat(deck.format)

  // Without this, a file dropped just outside the canvas navigates the tab away
  // from the app — and takes any unsaved work with it.
  useEffect(() => {
    const swallow = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDropping(true)
  }, [])

  const onDragLeave = useCallback(() => setDropping(false), [])

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      setDropping(false)
      const canvas = canvasRef.current
      if (!canvas) return

      const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))
      if (!files.length) return

      const r = canvas.getBoundingClientRect()
      const x = ((e.clientX - r.left) / r.width) * format.w
      const y = ((e.clientY - r.top) / r.height) * format.h
      const g = grid(format.w, format.h, format.cols, format.rows, format.margin * format.w)
      const cell = g.cellAt(x, y)

      const target = hitTest(placed, x, y)

      for (const [i, file] of files.entries()) {
        const ref = await putImageBlob(file)
        if (!ref) {
          console.warn('[drop] could not store image — IndexedDB unavailable')
          return
        }
        await preload(ref)

        if (i === 0 && target?.el.kind === 'image') {
          setElement(page.id, target.el.id, { imageRef: ref }, 'element:image')
          continue
        }
        // Extra files cascade by one cell so they don't land in a single stack.
        const box = g.clampBox({
          ...defaultBox(deck.format, 'image', cell),
          col: cell.col + i,
          row: cell.row + i,
        })
        addElement(
          page.id,
          createElement('image', box, { imageRef: ref, halftone: { ...format.halftone } }),
          'element:add-image',
        )
      }
    },
    [canvasRef, format, deck.format, page.id, placed, addElement, setElement],
  )

  return { dropping, handlers: { onDragOver, onDragLeave, onDrop } }
}
