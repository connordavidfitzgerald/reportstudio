import type { RenderAssets } from './compose'

/**
 * A 2D context used only for text metrics.
 *
 * Measurement genuinely needs a real context — `measureText` has no offline
 * equivalent — but nothing is ever painted into this one. It is 1×1 because its
 * size is irrelevant to metrics and allocating a full page of backing store to
 * measure a string would be waste repeated on every re-typeset.
 */
let shared: CanvasRenderingContext2D | null = null

export function measureCtx(): CanvasRenderingContext2D {
  if (shared) return shared
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('[measure] 2D context unavailable')
  shared = ctx
  return ctx
}

/**
 * Assets for a measuring pass.
 *
 * Images resolve to null: a measure only needs to know how much room a figure
 * takes, which is its box, not its pixels. Handing it real bitmaps would make
 * measurement depend on decode timing.
 */
export const measuringAssets = (): RenderAssets => ({
  image: () => null,
  overlays: {},
  wordmark: null,
})
