import { useEffect, useRef, type RefObject } from 'react'

/**
 * Close-on-outside-click and close-on-Escape, over one shared overlay stack.
 *
 * ## Why the stack is shared
 *
 * A dropdown can open inside a dialog, and every overlay listens to the window,
 * so without an order one Escape would close both. `Modal` used to keep its own
 * private stack for exactly this reason; the moment a second kind of overlay
 * existed, one stack stopped being enough. Both now register here, so "innermost
 * open thing" means the same to all of them.
 *
 * Dismissal is on mousedown rather than click, because a gesture that starts
 * inside the popover and ends outside it — dragging a slider, sweeping a text
 * selection — is not someone asking to close it.
 */

const stack: symbol[] = []

/**
 * Is anything overlaying the page — a dialog, a menu, a popover?
 *
 * Asked by the window-level shortcuts, which must not act on the document
 * behind an open dialog: Backspace with a confirmation on screen should be
 * doing nothing, not deleting the component underneath it.
 */
export const overlayOpen = (): boolean => stack.length > 0

/** True when `id` is the innermost open overlay. */
export const isTopmost = (id: symbol): boolean => stack[stack.length - 1] === id

/** Register as an overlay for as long as this component is mounted. */
export function useOverlayStack(): symbol {
  const me = useRef<symbol>(null)
  me.current ??= Symbol('overlay')
  const id = me.current
  useEffect(() => {
    stack.push(id)
    return () => {
      const at = stack.indexOf(id)
      if (at >= 0) stack.splice(at, 1)
    }
  }, [id])
  return id
}

/** Dismiss when Escape is pressed or the pointer goes down outside `ref`. */
export function useDismiss(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  const id = useOverlayStack()
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!isTopmost(id)) return
      const el = ref.current
      if (el && !el.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTopmost(id)) {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [ref, onClose, id])
}
