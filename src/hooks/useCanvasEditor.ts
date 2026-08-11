import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { getFormat } from '../config/formats'
import { createElement, defaultBox } from '../doc/defaults'
import type { Box, Deck, Page } from '../doc/types'
import type { Rect } from '../core/types'
import { grid } from '../render/grid'
import {
  CURSORS,
  handleAt,
  hitTest,
  marquee,
  rectBetween,
  type Handle,
} from '../render/hitTest'
import type { Placed } from '../render/layoutPage'
import { useDeck } from '../store/useDeck'

/** Pointer slop before a press becomes a drag, matching the poster's feel. */
const DRAG_THRESHOLD = 6
/** How close to a handle counts as grabbing it, in page pixels. */
const HANDLE_GRAB_RATIO = 0.012

export interface EditorOverlay {
  /** Painted rects of the current selection, with handles. */
  selection: Rect[]
  /** Where the gesture would land if released now. */
  ghost: Rect[] | null
  marquee: Rect | null
  /** Grid lines, shown only during a gesture. */
  showGrid: boolean
}

type Gesture =
  | { kind: 'none' }
  /** Pressed but not yet past the drag threshold. `id: null` = pressed empty canvas. */
  | { kind: 'pending'; x0: number; y0: number; id: string | null }
  | { kind: 'move'; x0: number; y0: number; boxes: Record<string, Box> }
  | { kind: 'resize'; handle: Handle; id: string; box: Box }
  | { kind: 'marquee'; x0: number; y0: number }

export function useCanvasEditor(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  page: Page,
  deck: Deck,
  placed: Placed[],
) {
  const selectedIds = useDeck((s) => s.selectedIds)
  const select = useDeck((s) => s.select)
  const setElementBoxes = useDeck((s) => s.setElementBoxes)
  const setElement = useDeck((s) => s.setElement)
  const addElement = useDeck((s) => s.addElement)
  const beginEdit = useDeck((s) => s.beginEdit)
  const endEdit = useDeck((s) => s.endEdit)
  const editingId = useDeck((s) => s.editingId)
  const tool = useDeck((s) => s.tool)
  const setTool = useDeck((s) => s.setTool)

  const [gesture, setGesture] = useState<Gesture>({ kind: 'none' })
  const [cursor, setCursor] = useState('default')
  const [ghost, setGhost] = useState<Rect[] | null>(null)
  const [band, setBand] = useState<Rect | null>(null)
  const gestureRef = useRef<Gesture>({ kind: 'none' })

  const format = getFormat(deck.format)
  const g = grid(format.w, format.h, format.cols, format.rows)
  const grab = format.w * HANDLE_GRAB_RATIO

  /** Client coordinates → page pixels. Handles the canvas' CSS downscale. */
  const toPage = useCallback(
    (e: { clientX: number; clientY: number }) => {
      const canvas = canvasRef.current
      if (!canvas) return { x: 0, y: 0 }
      const r = canvas.getBoundingClientRect()
      return {
        x: ((e.clientX - r.left) / r.width) * format.w,
        y: ((e.clientY - r.top) / r.height) * format.h,
      }
    },
    [canvasRef, format.w, format.h],
  )

  const byId = useCallback((id: string) => placed.find((p) => p.el.id === id), [placed])
  const selection = selectedIds.map(byId).filter((p): p is Placed => !!p)

  const setBoth = (next: Gesture) => {
    gestureRef.current = next
    setGesture(next)
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (editingId) endEdit()
    const { x, y } = toPage(e)
    e.currentTarget.setPointerCapture(e.pointerId)

    // The text tool always creates, whatever is underneath — same as Figma's T.
    if (tool === 'text') {
      select([])
      setBoth({ kind: 'pending', x0: x, y0: y, id: null })
      return
    }

    // A handle on an already-selected element wins over anything beneath it.
    for (const p of selection) {
      const h = handleAt(p.cellRect, x, y, grab)
      if (h) {
        setBoth({ kind: 'resize', handle: h, id: p.el.id, box: p.el.box })
        return
      }
    }

    const hit = hitTest(placed, x, y)
    if (!hit) {
      // Undecided until the pointer moves: a press that goes nowhere creates a
      // text box (click to type), a press that drags becomes a marquee.
      select([])
      setBoth({ kind: 'pending', x0: x, y0: y, id: null })
      return
    }

    const already = selectedIds.includes(hit.el.id)
    const ids = e.shiftKey
      ? already
        ? selectedIds.filter((id) => id !== hit.el.id)
        : [...selectedIds, hit.el.id]
      : already
        ? selectedIds
        : [hit.el.id]
    select(ids)
    setBoth({ kind: 'pending', x0: x, y0: y, id: hit.el.id })
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toPage(e)
    const cur = gestureRef.current

    if (cur.kind === 'none') {
      // Hover feedback only.
      if (tool === 'text') return setCursor('text')
      for (const p of selection) {
        const h = handleAt(p.cellRect, x, y, grab)
        if (h) return setCursor(CURSORS[h])
      }
      setCursor(hitTest(placed, x, y) ? 'move' : 'default')
      return
    }

    if (cur.kind === 'pending') {
      if (Math.hypot(x - cur.x0, y - cur.y0) < DRAG_THRESHOLD) return
      if (cur.id === null) {
        // With the text tool a drag is still just a placement, not a marquee.
        if (tool === 'text') return
        setBoth({ kind: 'marquee', x0: cur.x0, y0: cur.y0 })
        return
      }
      const boxes: Record<string, Box> = {}
      for (const p of selection) boxes[p.el.id] = p.el.box
      setBoth({ kind: 'move', x0: cur.x0, y0: cur.y0, boxes })
      return
    }

    if (cur.kind === 'move') {
      // The delta is measured in whole cells, so there is no sub-cell state to
      // snap *from* — an off-grid position is simply never constructed.
      const dCol = Math.round((x - cur.x0) / g.colW)
      const dRow = Math.round((y - cur.y0) / g.rowH)
      setGhost(
        Object.values(cur.boxes).map((b) =>
          g.rect(g.clampBox({ ...b, col: b.col + dCol, row: b.row + dRow })),
        ),
      )
      return
    }

    if (cur.kind === 'resize') {
      setGhost([g.rect(resizeBox(cur.box, cur.handle, x, y, g))])
      return
    }

    if (cur.kind === 'marquee') setBand(rectBetween(cur.x0, cur.y0, x, y))
  }

  const onPointerUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const { x, y } = toPage(e)
    const cur = gestureRef.current
    e.currentTarget.releasePointerCapture(e.pointerId)

    if (cur.kind === 'pending') {
      if (cur.id === null) {
        // Click to type — but only with the text tool active, so a click on
        // empty canvas in pointer mode is unambiguously "deselect". Committing
        // the box empty removes it again (see `endEdit`), so a mis-click with
        // the text tool still leaves nothing behind.
        if (tool === 'text') {
          const el = createElement('text', defaultBox(deck.format, 'text', g.cellAt(x, y)))
          addElement(page.id, el, 'element:add-text')
          beginEdit(el.id)
          // One box per click; drop back to the pointer so the next click selects.
          setTool('pointer')
        }
      } else {
        const hit = hitTest(placed, x, y)
        if (hit?.el.kind === 'text') beginEdit(hit.el.id)
      }
    } else if (cur.kind === 'move') {
      const dCol = Math.round((x - cur.x0) / g.colW)
      const dRow = Math.round((y - cur.y0) / g.rowH)
      if (dCol || dRow) {
        const next: Record<string, Box> = {}
        for (const [id, b] of Object.entries(cur.boxes)) {
          next[id] = g.clampBox({ ...b, col: b.col + dCol, row: b.row + dRow })
        }
        setElementBoxes(page.id, next)
      }
    } else if (cur.kind === 'resize') {
      setElementBoxes(page.id, { [cur.id]: resizeBox(cur.box, cur.handle, x, y, g) })
      // Dragging a text box's top or bottom edge is the user taking ownership of
      // its height; it stops tracking the measured content from then on.
      const el = byId(cur.id)?.el
      if (el?.kind === 'text' && el.autoHeight && /^[ns]/.test(cur.handle)) {
        setElement(page.id, cur.id, { autoHeight: false }, 'element:box')
      }
    } else if (cur.kind === 'marquee' && band) {
      select(marquee(placed, band).map((p) => p.el.id))
    }

    setBoth({ kind: 'none' })
    setGhost(null)
    setBand(null)
  }

  const overlay: EditorOverlay = {
    selection: selection.map((p) => p.cellRect),
    ghost,
    marquee: band,
    showGrid: gesture.kind === 'move' || gesture.kind === 'resize',
  }

  return {
    overlay,
    cursor,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  }
}

/** Move one edge (or corner) to the nearest grid line, keeping the other fixed. */
function resizeBox(
  box: Box,
  handle: Handle,
  x: number,
  y: number,
  g: ReturnType<typeof grid>,
): Box {
  let { col, row, colSpan, rowSpan } = box
  const right = col + colSpan
  const bottom = row + rowSpan

  if (handle.includes('w')) {
    col = Math.min(right - 1, Math.max(0, Math.round(x / g.colW)))
    colSpan = right - col
  } else if (handle.includes('e')) {
    colSpan = Math.max(1, Math.min(g.cols - col, Math.round(x / g.colW) - col))
  }

  if (handle.startsWith('n')) {
    row = Math.min(bottom - 1, Math.max(0, Math.round(y / g.rowH)))
    rowSpan = bottom - row
  } else if (handle.startsWith('s')) {
    rowSpan = Math.max(1, Math.min(g.rows - row, Math.round(y / g.rowH) - row))
  }

  return g.clampBox({ col, row, colSpan, rowSpan })
}
