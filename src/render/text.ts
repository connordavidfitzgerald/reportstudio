import type { Rect, TextAlign } from './types'
import { fontFor, fontString, variantFor } from '../config/fonts'
import { ink, SWASH_PAD_X, SWASH_PAD_Y, type InkAlphaId, type TypeRole } from '../config/brand'
import type { Sheet } from './sheet'

/**
 * Text setting.
 *
 * Everything here works in *pixels* — a {@link Sheet} has already converted the
 * point sizes in `config/brand.ts`. Nothing in this module knows about blocks or
 * documents; it sets runs of type into boxes, and that is all.
 */

export interface TextStyle {
  voice: 'display' | 'text'
  /** Points. */
  size: number
  lineHeight: number
  /** Em. */
  tracking: number
  case?: 'upper' | 'lower'
  alpha: InkAlphaId
  align: TextAlign
  /**
   * Which cut of the voice to set in. Set per *segment* by the inline painter
   * when a field carries marks; absent everywhere else, which is why an
   * unmarked run produces byte-identical draw ops to the one before rich text
   * existed.
   */
  bold?: boolean
  italic?: boolean
}

/** Build a style from a named role, with per-use overrides. */
export const styleFor = (
  role: TypeRole & { size?: number },
  over: Partial<TextStyle> = {},
): TextStyle => ({
  voice: role.voice,
  size: role.size ?? 12,
  lineHeight: role.lineHeight,
  tracking: role.tracking,
  case: role.case,
  alpha: role.alpha ?? 'body',
  align: 'left',
  ...over,
})

/** Apply a style's font and tracking to a context. Returns the pixel size. */
export function applyFont(ctx: CanvasRenderingContext2D, sheet: Sheet, style: TextStyle): number {
  const px = sheet.pt(style.size)
  ctx.font = fontString(fontFor(style.voice, variantFor(style.bold, style.italic)), px)
  // Canvas letterSpacing is a CSS length, and it affects measureText too — which
  // is exactly why it has to be set before any measuring, not just before
  // drawing. Body copy carries 1% tracking; dropping it makes every measured
  // width disagree with what lands on the page.
  ;(ctx as unknown as { letterSpacing: string }).letterSpacing = `${style.tracking * px}px`
  return px
}

/** Apply a style's `case` transform. */
export const cased = (text: string, style: TextStyle): string =>
  style.case === 'upper' ? text.toUpperCase() : style.case === 'lower' ? text.toLowerCase() : text

/** Line advance in pixels. */
export const lineAdvance = (sheet: Sheet, style: TextStyle): number =>
  sheet.pt(style.size) * style.lineHeight

/**
 * Distance from the top of a line box down to the alphabetic baseline.
 *
 * Figma centres the glyph box inside the line box rather than hanging it from
 * the ascender, so a 90% line height crops symmetrically top and bottom. This
 * reproduces that; hanging from the ascender instead would push every tight-led
 * heading in the document down by a couple of points.
 *
 * Assumes `applyFont` has already run.
 */
export function baselineOffset(ctx: CanvasRenderingContext2D, sheet: Sheet, style: TextStyle): number {
  const m = ctx.measureText('Hg')
  const ascent = m.fontBoundingBoxAscent
  const descent = m.fontBoundingBoxDescent
  const box = lineAdvance(sheet, style)
  return (box - (ascent + descent)) / 2 + ascent
}

/**
 * One wrapped line, and whether it opens a paragraph.
 *
 * The flag is carried rather than recomputed because a paragraph indent belongs
 * to the first line of *each* paragraph — that is what Figma's `paragraphIndent`
 * means, and what book setting requires. Testing "is this line index 0" would
 * indent only the first paragraph of a multi-paragraph block.
 */
export interface WrappedLine {
  text: string
  opensPara: boolean
}

/**
 * Greedy wrap to a pixel width, honouring explicit newlines.
 *
 * Assumes `applyFont` has already run — measurement and drawing must share one
 * font state, or the wrap won't match what is painted.
 */
export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  /** Indent applied to the opening line of each paragraph. */
  indent = 0,
  /**
   * The style, so the run's `case` is applied *before* wrapping.
   *
   * It has to happen here rather than at draw time: uppercasing changes every
   * measured width, so a line wrapped in mixed case and drawn in caps would
   * overrun its measure. Optional only so the handful of callers that pass
   * already-cased single lines don't have to.
   */
  style?: TextStyle,
): WrappedLine[] {
  const out: WrappedLine[] = []
  const source = style ? cased(text, style) : text
  for (const para of source.split('\n')) {
    if (para.trim() === '') {
      out.push({ text: '', opensPara: true })
      continue
    }
    const words = para.split(/\s+/).filter(Boolean)
    let line = ''
    let opensPara = true
    for (const word of words) {
      const limit = maxWidth - (opensPara ? indent : 0)
      const next = line ? `${line} ${word}` : word
      if (line && ctx.measureText(next).width > limit) {
        out.push({ text: line, opensPara })
        opensPara = false
        line = word
      } else {
        line = next
      }
    }
    out.push({ text: line, opensPara })
  }
  return out
}

/** Height of a wrapped run, in pixels. */
export const linesHeight = (sheet: Sheet, style: TextStyle, count: number): number =>
  count * lineAdvance(sheet, style)

/**
 * Largest size (in points) at which `text` fits `maxWidth` on one line.
 *
 * Used by the cover title and the chart's percentages, which the file sizes
 * optically rather than to a step — 71.2 and 74.4 on the same plate, depending
 * on digit count.
 */
export function fitSize(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  style: TextStyle,
  text: string,
  maxWidth: number,
  ceiling: number,
): number {
  let lo = 1
  let hi = ceiling
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2
    applyFont(ctx, sheet, { ...style, size: mid })
    if (ctx.measureText(text).width <= maxWidth) lo = mid
    else hi = mid
  }
  applyFont(ctx, sheet, { ...style, size: lo })
  return lo
}

/** Where a line starts, given the box and the alignment. */
export function alignX(x: number, boxW: number, lineW: number, align: TextAlign): number {
  if (align === 'center') return x + (boxW - lineW) / 2
  if (align === 'right') return x + boxW - lineW
  return x
}

/**
 * Paint a wrapped run and return the height consumed.
 *
 * Draws left-aligned at explicit x positions rather than using `ctx.textAlign`,
 * because the swash geometry has to agree with the glyph positions exactly and
 * a recorded op carries its own origin.
 */
export function drawLines(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  style: TextStyle,
  lines: WrappedLine[],
  box: Rect,
  indent = 0,
): number {
  applyFont(ctx, sheet, style)
  const advance = lineAdvance(sheet, style)
  const base = baselineOffset(ctx, sheet, style)
  ctx.save()
  ctx.fillStyle = ink(style.alpha)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  lines.forEach((line, i) => {
    if (line.text === '') return
    const dx = line.opensPara ? indent : 0
    const w = ctx.measureText(line.text).width
    const x = alignX(box.x + dx, box.w - dx, w, style.align)
    ctx.fillText(line.text, x, box.y + i * advance + base)
  })
  ctx.restore()
  return lines.length * advance
}

/**
 * How tall a swash is and where it sits, relative to the baseline.
 *
 * Taken from the font's own ink extents rather than a fraction of the em, so
 * the bar actually hugs the letterforms:
 *
 *   display  cap height of "H" — the face is always set in caps, so there is
 *            nothing below the baseline to cover
 *   text     ascender to descender of "Hxp", since mixed-case runs have both
 *
 * Measuring a fixed reference string rather than the line itself is deliberate:
 * per-line metrics would make the bars in one paragraph different heights
 * depending on whether that line happened to contain a descender.
 *
 * Assumes `applyFont` has already run for this style.
 */
export function swashMetrics(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  style: TextStyle,
): { rise: number; height: number } {
  const m = ctx.measureText(style.voice === 'display' ? 'H' : 'Hxp')
  const pad = sheet.pt(style.size) * SWASH_PAD_Y
  const rise = m.actualBoundingBoxAscent + pad
  const drop = (style.voice === 'display' ? 0 : m.actualBoundingBoxDescent) + pad
  return { rise, height: rise + drop }
}

/**
 * The rectangles behind a run of text on a swash.
 *
 * The swash hugs each wrapped line rather than boxing the paragraph — that is
 * what gives the statements and TOC rows their ragged right edge.
 */
export function swashRects(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  style: TextStyle,
  lines: WrappedLine[],
  box: Rect,
): Rect[] {
  applyFont(ctx, sheet, style)
  const advance = lineAdvance(sheet, style)
  const base = baselineOffset(ctx, sheet, style)
  const { rise, height } = swashMetrics(ctx, sheet, style)
  const pad = sheet.pt(SWASH_PAD_X)
  const out: Rect[] = []
  lines.forEach((line, i) => {
    if (line.text.trim() === '') return
    const w = ctx.measureText(line.text).width
    const x = alignX(box.x, box.w, w, style.align)
    out.push({ x: x - pad, y: box.y + i * advance + base - rise, w: w + pad * 2, h: height })
  })
  return out
}

/** Paint swash rectangles. */
export function drawSwash(ctx: CanvasRenderingContext2D, rects: Rect[], fill: string): void {
  ctx.save()
  ctx.fillStyle = fill
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.restore()
}
