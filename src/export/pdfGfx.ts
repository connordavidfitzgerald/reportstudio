import { BlendMode, rgb, type Color } from 'pdf-lib'
import type { Rect } from '../render/types'
import type { Point } from '../render/record'

/**
 * Colour and coordinate helpers for the vector PDF painter.
 */

export interface Paint {
  color: Color
  /** Combined alpha: the colour's own, times the context's `globalAlpha`. */
  opacity: number
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const RGBA = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)$/i

/**
 * Parse the colour strings the draw code produces.
 *
 * Only the two forms it actually emits are accepted — brand hexes and the
 * `rgba(0, 0, 0, 0.7)` ink. Anything else throws: a silently-black fill in an
 * export is much worse than a failed export, because nobody notices until the
 * report is out.
 */
export function parseColor(css: string, alpha = 1): Paint {
  const hex = HEX.exec(css)
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].replace(/./g, (c) => c + c) : hex[1]
    const n = parseInt(h, 16)
    return { color: rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255), opacity: alpha }
  }
  const m = RGBA.exec(css)
  if (m) {
    const a = m[4] === undefined ? 1 : Number(m[4])
    return {
      color: rgb(Number(m[1]) / 255, Number(m[2]) / 255, Number(m[3]) / 255),
      opacity: a * alpha,
    }
  }
  throw new Error(`[pdf] unsupported colour "${css}" — add it to parseColor()`)
}

/** Canvas composite operations, mapped to PDF blend modes. */
const BLEND: Partial<Record<GlobalCompositeOperation, BlendMode>> = {
  'source-over': BlendMode.Normal,
  multiply: BlendMode.Multiply,
  screen: BlendMode.Screen,
  overlay: BlendMode.Overlay,
  darken: BlendMode.Darken,
  lighten: BlendMode.Lighten,
  'color-dodge': BlendMode.ColorDodge,
  'color-burn': BlendMode.ColorBurn,
  'hard-light': BlendMode.HardLight,
  'soft-light': BlendMode.SoftLight,
  difference: BlendMode.Difference,
  exclusion: BlendMode.Exclusion,
}

export function blendOf(composite: GlobalCompositeOperation): BlendMode {
  const b = BLEND[composite]
  if (!b) throw new Error(`[pdf] composite operation "${composite}" has no PDF equivalent`)
  return b
}

/**
 * The canvas → PDF coordinate transform.
 *
 * Canvas is y-down in page pixels; PDF is y-up in points. `scale` is uniform —
 * every format's `ptW/w` equals its `ptH/h`, which is worth keeping true.
 */
export class PdfSpace {
  readonly scale: number
  readonly ptH: number

  constructor(pxW: number, ptW: number, ptH: number) {
    this.scale = ptW / pxW
    this.ptH = ptH
  }

  x = (px: number): number => px * this.scale
  /** A y in canvas space, as a PDF y. */
  y = (py: number): number => this.ptH - py * this.scale
  len = (px: number): number => px * this.scale

  /** A canvas rect as pdf-lib rectangle options (which anchor bottom-left). */
  rect(r: Rect): { x: number; y: number; width: number; height: number } {
    return {
      x: this.x(r.x),
      y: this.y(r.y + r.h),
      width: this.len(r.w),
      height: this.len(r.h),
    }
  }
}

/**
 * Closed rings as an SVG path.
 *
 * Coordinates stay in *canvas* space: `drawSvgPath` is given `x: 0, y: ptH` and
 * `scale`, so it applies the y-flip itself. Keeping the flip in one place beats
 * pre-transforming every point and getting one of them backwards.
 */
export function ringsToPath(rings: Point[][]): string {
  const parts: string[] = []
  for (const ring of rings) {
    if (!ring.length) continue
    parts.push(`M ${fmt(ring[0].x)} ${fmt(ring[0].y)}`)
    for (let i = 1; i < ring.length; i++) parts.push(`L ${fmt(ring[i].x)} ${fmt(ring[i].y)}`)
    parts.push('Z')
  }
  return parts.join(' ')
}

/** Trim float noise — these strings go into the file verbatim. */
const fmt = (n: number): string => (Math.round(n * 1000) / 1000).toString()
