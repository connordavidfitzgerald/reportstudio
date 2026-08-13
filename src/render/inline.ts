import type { Rect } from './types'
import { ink, SWASH_PAD_X } from '../config/brand'
import type { Sheet } from './sheet'
import {
  alignX,
  applyFont,
  baselineOffset,
  cased,
  lineAdvance,
  swashMetrics,
  type TextStyle,
} from './text'

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
  /** Set in the bold / italic cut of the run's voice. */
  bold?: boolean
  italic?: boolean
  /**
   * The link this run points at.
   *
   * Nothing in the canvas painter uses it — a link is drawn as an underline
   * like any other. It is carried so the PDF exporter can turn the run's box
   * into a real annotation, which is the only place a URL can be *followed*.
   */
  href?: string
  /** Point size override; defaults to the run's style. */
  size?: number
  /** Ink alpha override. */
  alpha?: TextStyle['alpha']
  /**
   * Which document field this run came from.
   *
   * Purely a label — it changes nothing about how the run is set. It exists so
   * the editor can find where a field ended up after wrapping: a resources row
   * puts a link and its note on one flowed line, and putting a caret in the
   * right half of it means knowing which parts belong to which.
   */
  id?: string
}

interface Part extends Segment {
  /** X offset from the line's left edge. */
  x: number
  w: number
}

export interface InlineLine {
  parts: Part[]
  width: number
  /**
   * This line opens a paragraph, and so takes the first-line indent.
   *
   * Carried rather than inferred from the index for the same reason
   * `WrappedLine` carries it: the indent belongs to the first line of *each*
   * paragraph, not to the first line of the block.
   */
  opensPara: boolean
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
  opts: {
    /**
     * First-line indent, in pixels, applied to the opening line of each
     * paragraph. Only honoured for left-aligned runs: with the indent baked
     * into the line's width, a centred line would be pushed off-centre by it.
     */
    indent?: number
  } = {},
): InlineLine[] {
  const indent = style.align === 'left' ? (opts.indent ?? 0) : 0

  // Tokenise into words tagged with their segment, keeping the spaces that
  // separate them so a segment boundary mid-phrase doesn't glue words together.
  // Newlines are split out as tokens of their own: they arrive inside runs of
  // whitespace like `'\n\n'` or `' \n'`, and testing a token for equality with
  // '\n' silently misses both.
  const tokens: { word: string; seg: Segment }[] = []
  for (const seg of segments) {
    const words = cased(seg.text, style)
      .replace(/\r\n?/g, '\n')
      .split(/(\n|[^\S\n]+)/)
      .filter((s) => s !== '')
    for (const word of words) tokens.push({ word, seg })
  }

  const widthOf = (word: string, seg: Segment): number => {
    applyFont(ctx, sheet, {
      ...style,
      size: seg.size ?? style.size,
      bold: seg.bold ?? style.bold,
      italic: seg.italic ?? style.italic,
    })
    return ctx.measureText(word).width
  }

  const lines: InlineLine[] = []
  let parts: Part[] = []
  let x = 0
  /** The next line to be flushed opens a paragraph. True for the first. */
  let opensPara = true

  const flush = (endsPara = false) => {
    // Drop trailing whitespace so alignment and swash widths ignore it.
    while (parts.length && parts[parts.length - 1].text.trim() === '') {
      x -= parts[parts.length - 1].w
      parts.pop()
    }
    if (parts.length) lines.push({ parts, width: x, opensPara })
    else if (endsPara) lines.push({ parts: [], width: 0, opensPara })
    parts = []
    x = 0
    // A wrapped line continues its paragraph; one ended by a newline starts a
    // new one.
    opensPara = endsPara
  }

  for (const { word, seg } of tokens) {
    if (word === '\n') {
      flush(true)
      continue
    }
    const w = widthOf(word, seg)
    const blank = word.trim() === ''
    const limit = maxWidth - (parts.length === 0 && opensPara ? indent : opensPara ? indent : 0)
    if (!blank && x + w > limit && parts.length) flush()
    // A space that would open a line is dropped rather than indenting it.
    if (blank && parts.length === 0) continue
    const last = parts[parts.length - 1]
    if (
      last &&
      last.swash === seg.swash &&
      last.underline === seg.underline &&
      last.bold === seg.bold &&
      last.italic === seg.italic &&
      last.size === seg.size &&
      last.alpha === seg.alpha &&
      last.href === seg.href
    ) {
      last.text += word
      last.w += w
    } else {
      parts.push({ ...seg, text: word, x, w })
    }
    x += w
  }
  flush()

  // The indent is folded into the parts' offsets rather than handled at draw
  // time, so `drawInline`, `inlineSwashRects` and `segmentRect` all keep working
  // off `originX + p.x` and none of them needs to know indents exist.
  if (indent) {
    for (const line of lines) {
      if (!line.opensPara) continue
      for (const part of line.parts) part.x += indent
      line.width += indent
    }
  }
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
  /** From {@link swashMetrics}, so the bar hugs the letterforms. */
  metrics: { rise: number; height: number },
): Rect[] {
  const advance = lineAdvance(sheet, style)
  const { rise, height: h } = metrics
  const pad = sheet.pt(SWASH_PAD_X)
  const out: Rect[] = []

  lines.forEach((line, i) => {
    const originX = alignX(box.x, box.w, line.width, style.align)
    let run: { from: number; to: number } | null = null
    const close = () => {
      if (!run) return
      out.push({
        x: originX + run.from - pad,
        y: box.y + i * advance + base - rise,
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
): { base: number; metrics: { rise: number; height: number } } {
  applyFont(ctx, sheet, style)
  return { base: baselineOffset(ctx, sheet, style), metrics: swashMetrics(ctx, sheet, style) }
}

/**
 * Where a tagged segment ended up, as one box covering every part of it.
 *
 * Mirrors {@link drawInline}'s geometry exactly — same advance, same
 * `alignX` — because it is answering "where did you draw this?" and any
 * independent guess would drift the moment either changed.
 *
 * A run that wrapped across lines returns the box enclosing all of it, which is
 * the right anchor for a caret even though it is wider than the ink.
 */
export function segmentRect(
  sheet: Sheet,
  style: TextStyle,
  lines: InlineLine[],
  box: Rect,
  id: string,
): Rect | null {
  const advance = lineAdvance(sheet, style)
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity

  lines.forEach((line, i) => {
    const originX = alignX(box.x, box.w, line.width, style.align)
    for (const p of line.parts) {
      if (p.id !== id || p.text.trim() === '') continue
      x0 = Math.min(x0, originX + p.x)
      x1 = Math.max(x1, originX + p.x + p.w)
      y0 = Math.min(y0, box.y + i * advance)
      y1 = Math.max(y1, box.y + (i + 1) * advance)
    }
  })

  return x1 > x0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null
}

/**
 * Where each linked run ended up, so the PDF can turn it into an annotation.
 *
 * Mirrors {@link drawInline}'s geometry exactly — same advance, same `alignX` —
 * for the same reason {@link segmentRect} does: it is answering "where did you
 * draw this?", and any independent guess would drift the moment either changed.
 *
 * One rect per part rather than one per link: a link that wraps is two boxes on
 * the page, and a single box enclosing both would make the whitespace between
 * the lines clickable.
 */
export function inlineLinkRects(
  sheet: Sheet,
  style: TextStyle,
  lines: InlineLine[],
  box: Rect,
): { href: string; rect: Rect }[] {
  const advance = lineAdvance(sheet, style)
  const out: { href: string; rect: Rect }[] = []
  lines.forEach((line, i) => {
    const originX = alignX(box.x, box.w, line.width, style.align)
    for (const p of line.parts) {
      if (!p.href || p.text.trim() === '') continue
      out.push({
        href: p.href,
        rect: { x: originX + p.x, y: box.y + i * advance, w: p.w, h: advance },
      })
    }
  })
  return out
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
      // The cut has to be re-applied per part, and with the same expression the
      // measuring pass used: a part measured in bold and drawn in the roman
      // would be laid out at one width and painted at another.
      applyFont(ctx, sheet, {
        ...style,
        size: p.size ?? style.size,
        bold: p.bold ?? style.bold,
        italic: p.italic ?? style.italic,
      })
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
