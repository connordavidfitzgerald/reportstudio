import type { Rect } from '../core/types'
import type { Placed } from './layoutPage'

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export const CURSORS: Record<Handle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
}

export const pointInRect = (x: number, y: number, r: Rect): boolean =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h

/** The point a handle sits at on a rect. */
export function handlePoint(r: Rect, h: Handle): { x: number; y: number } {
  const x = h.includes('w') ? r.x : h.includes('e') ? r.x + r.w : r.x + r.w / 2
  const y = h.startsWith('n') ? r.y : h.startsWith('s') ? r.y + r.h : r.y + r.h / 2
  return { x, y }
}

/**
 * The topmost element under a point. Walks in reverse because array order is
 * paint order, so the last element drawn is the one you see and should grab.
 */
export function hitTest(placed: Placed[], x: number, y: number): Placed | null {
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i]
    if (p.el.locked) continue
    // Hit-test the painted rect, not the grid box: what you can see is what you
    // can grab, even where an auto-height text block is shorter than its cell.
    if (pointInRect(x, y, p.rect)) return p
  }
  return null
}

/** The resize handle within `grab` pixels of a point, if any. */
export function handleAt(rect: Rect, x: number, y: number, grab: number): Handle | null {
  for (const h of HANDLES) {
    const pt = handlePoint(rect, h)
    if (Math.abs(x - pt.x) <= grab && Math.abs(y - pt.y) <= grab) return h
  }
  return null
}

/** Every element whose painted rect intersects a marquee. */
export function marquee(placed: Placed[], r: Rect): Placed[] {
  return placed.filter(
    (p) =>
      !p.el.locked &&
      p.rect.x < r.x + r.w &&
      p.rect.x + p.rect.w > r.x &&
      p.rect.y < r.y + r.h &&
      p.rect.y + p.rect.h > r.y,
  )
}

/** Normalise a drag between two points into a positive-extent rect. */
export function rectBetween(x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  }
}
