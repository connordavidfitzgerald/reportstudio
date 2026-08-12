import type { Rect } from './types'
import { ink, SWASH_HEIGHT, SWASH_PAD_X } from '../config/brand'
import type { Sheet } from './sheet'
import { alignX, applyFont, baselineOffset, cased, lineAdvance, type TextStyle } from './text'

/**
 * Inline layout: a line of type made of runs that don't all look the same.
 *
 * Three places in the design need this and none of them can be done with a
 * plain wrapped run:
 *
 *   - the exec-summary statement, where "21 ORGANIZERS" sits on a swash and the
 *     words around it don't, at a different ink alpha;
 *   - TOC sub-rows, where "(campaigns/actions)" is set at 14 against the row's
 *     18 and has to sit on the same baseline;
 *   - resource links, where only the link text is underlined.
 *
 * Doing these as separate text blocks positioned by hand would put the same
 * geometry in two places and let them drift apart. Instead the segments flow as
 * one line and each carries its own paint.
 */

export interface Segment {
  text: string
  /** Sits on the spread's swash colour. */
  swash?: boolean
  underline?: boolean
  /** Point size override; defaults to the run's style. */
  size?: number
  /** Ink alpha override. */
  alpha?: TextStyle['alpha']
}

interface Part extends Segment {
  /** X offset from the line's left edge. */
  x: number
  w: number
}

export interface InlineLine {
  parts: Part[]
  width: number
}

/**
 * Wrap segments into lines, breaking at word boundaries across segment edges.
 *
 * Adjacent words from the same segment stay in one part so a line is a handful
 * of draw calls rather than one per word.
 */
export function layoutInline(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  style: TextStyle,
  segments: Segment[],
  maxWidth: number,
): InlineLine[] {
  // Tokenise into words tagged with their segment, keeping the spaces that
  // separate them so a segment boundary mid-phrase doesn't glue words together.
  const tokens: { word: string; seg: Segment }[] = []
  for (const seg of segments) {
    const words = cased(seg.text, style).split(/(\s+)/).filter((s) => s !== '')
    for (const word of words) tokens.push({ word, seg })
  }

  const widthOf = (word: string, seg: Segment): number => {
    applyFont(ctx, sheet, { ...style, size: seg.size ?? style.size })
    return ctx.measureText(word).width
  }

  const lines: InlineLine[] = []
  let parts: Part[] = []
  let x = 0

  const flush = () => {
    // Drop trailing whitespace so alignment and swash widths ignore it.
    while (parts.length && parts[parts.length - 1].text.trim() === '') {
      x -= parts[parts.length - 1].w
      parts.pop()
    }
    if (parts.length) lines.push({ parts, width: x })
    parts = []
    x = 0
  }

  for (const { word, seg } of tokens) {
    if (word === '\n') {
      flush()
      continue
    }
    const w = widthOf(word, seg)
    const blank = word.trim() === ''
    if (!blank && x + w > maxWidth && parts.length) flush()
    // A space that would open a line is dropped rather than indenting it.
    if (blank && parts.length === 0) continue
    const last = parts[parts.length - 1]
    if (
      last &&
      last.swash === seg.swash &&
      last.underline === seg.underline &&
      last.size === seg.size &&
      last.alpha === seg.alpha
    ) {
      last.text += word
      last.w += w
    } else {
      parts.push({ ...seg, text: word, x, w })
    }
    x += w
  }
  flush()
  return lines
}

export const inlineHeight = (sheet: Sheet, style: TextStyle, lines: InlineLine[]): number =>
  lines.length * lineAdvance(sheet, style)

/**
 * Swash rectangles for the parts that asked for one.
 *
 * Contiguous swashed parts on a line merge into a single bar — otherwise
 * "21 ORGANIZERS" would paint as two abutting rectangles with a hairline seam
 * where the sub-pixel edges meet.
 */
export function inlineSwashRects(
  sheet: Sheet,
  style: TextStyle,
  lines: InlineLine[],
  box: Rect,
  /** From {@link inlineBaseline}; the draw pass must be given the same value. */
  base: number,
): Rect[] {
  const advance = lineAdvance(sheet, style)
  const h = sheet.pt(style.size) * SWASH_HEIGHT
  const pad = sheet.pt(SWASH_PAD_X)
  const out: Rect[] = []

  lines.forEach((line, i) => {
    const originX = alignX(box.x, box.w, line.width, style.align)
    let run: { from: number; to: number } | null = null
    const close = () => {
      if (!run) return
      out.push({
        x: originX + run.from - pad,
        y: box.y + i * advance + base - h,
        w: run.to - run.from + pad * 2,
        h,
      })
      run = null
    }
    for (const p of line.parts) {
      if (p.swash && p.text.trim() !== '') {
        if (run && Math.abs(run.to - p.x) < 0.5) run.to = p.x + p.w
        else {
          close()
          run = { from: p.x, to: p.x + p.w }
        }
      } else if (p.swash) {
        // A swashed space between two swashed words keeps the bar continuous.
        if (run) run.to = p.x + p.w
      } else {
        close()
      }
    }
    close()
  })
  return out
}

/**
 * The baseline offset for a run, which the swash pass and the draw pass must
 * agree on exactly — a disagreement of a point puts every bar off its cap line.
 *
 * Both take it as an argument rather than recomputing it, because it depends on
 * the font currently applied to the context and the two passes interleave with
 * other drawing.
 */
export function inlineBaseline(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  style: TextStyle,
): number {
  applyFont(ctx, sheet, style)
  return baselineOffset(ctx, sheet, style)
}

/** Paint inline lines at the baseline from {@link inlineBaseline}. */
export function drawInline(
  ctx: CanvasRenderingContext2D,
  sheet: Sheet,
  style: TextStyle,
  lines: InlineLine[],
  box: Rect,
  base: number,
): number {
  const advance = lineAdvance(sheet, style)
  ctx.save()
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  lines.forEach((line, i) => {
    const originX = alignX(box.x, box.w, line.width, style.align)
    const y = box.y + i * advance + base
    for (const p of line.parts) {
      if (p.text.trim() === '') continue
      applyFont(ctx, sheet, { ...style, size: p.size ?? style.size })
      ctx.fillStyle = ink(p.alpha ?? style.alpha)
      ctx.fillText(p.text, originX + p.x, y)
      if (p.underline) {
        const t = Math.max(1, sheet.pt(0.6))
        ctx.fillRect(originX + p.x, y + sheet.pt(1.6), p.w, t)
      }
    }
  })
  ctx.restore()
  return lines.length * advance
}
