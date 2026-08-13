import { useEffect, useState, type RefObject } from 'react'

/**
 * Contain-fitting a page inside a box, in JS rather than CSS.
 *
 * ## Why not CSS
 *
 * The obvious spelling is `aspect-ratio` plus `max-width` and `max-height`, and
 * it does not work: CSS derives the second axis from the first only while the
 * first is the *definite* one. Give the box a definite height and let
 * `max-width` clamp it — which is exactly what a narrow window does — and the
 * height is not reduced to compensate. The box stops matching its own ratio and
 * everything inside is squashed horizontally.
 *
 * Contain-fit needs both axes free under two independent maxima, which CSS
 * sizing cannot express. So the fit is one number, computed here.
 *
 * ## Why it returns a scale rather than a size
 *
 * The canvas needs three things that must agree exactly: a backing-store size in
 * device pixels, a CSS size, and — for the transparent textarea the caret lives
 * in — how many CSS pixels one design point is worth. Handing back a *scale*
 * lets the caller derive all three from one rounded integer, so they cannot
 * drift apart by half a pixel.
 */

export interface ContainFit {
  /** CSS pixels per design point. Uniform on both axes, by construction. */
  scale: number
  /**
   * The same, for a box of a different shape in the same space.
   *
   * The canvas needs two answers from one measurement — how big a spread would
   * be, and how big a single page would be — because which of them it draws
   * depends on the first. Measuring twice would mean two observers reporting at
   * different moments and a frame where they disagree.
   */
  scaleFor(ptW: number, ptH: number): number
  /** `devicePixelRatio` as of the last measurement. */
  dpr: number
  /** False until a real measurement lands, so nothing paints at zero size. */
  measured: boolean
}

/**
 * The largest uniform scale at which a `ptW × ptH` box fits inside `ref`'s
 * content box.
 *
 * `ResizeObserver`'s `contentRect` already excludes padding, so the observed
 * element can keep its own padding and this still measures the space actually
 * available to the page.
 */
export function useContainFit(
  ref: RefObject<HTMLElement | null>,
  ptW: number,
  ptH: number,
): ContainFit {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null)
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[entries.length - 1].contentRect
      setBox({ w: r.width, h: r.height })
      setDpr(window.devicePixelRatio || 1)
    })
    ro.observe(el)
    // A resize event without a size change still matters: dragging the window
    // to a display with a different pixel ratio re-rasterises everything.
    const onResize = () => setDpr(window.devicePixelRatio || 1)
    window.addEventListener('resize', onResize)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [ref])

  const scaleFor = (w: number, h: number) =>
    box ? Math.max(Math.min(box.w / w, box.h / h), 0) : 0
  return { scale: scaleFor(ptW, ptH), scaleFor, dpr, measured: scaleFor(ptW, ptH) > 0 }
}
