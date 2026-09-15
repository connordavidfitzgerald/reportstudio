import type { CSSProperties } from 'react'
import { fontFor, variantFor } from '../../config/fonts'
import type { TextRegion } from '../../render/compose'

/**
 * The type the caret is laid on, shared by the editor and the hit test.
 *
 * `InlineEditor` sets a transparent `<textarea>` over the painted words; this is
 * the CSS that makes the two agree. It is a module of its own because a *second*
 * thing now needs exactly the same box: working out which character a click
 * landed on (see {@link offsetFromPoint}) means laying out the same string the
 * same way, and a copy of these rules that drifted from the editor's by a
 * quarter of a point would put the caret one character out on long lines.
 */

/** Geometry as percentages of the backing store, which is how the layer works. */
const pct = (v: number, of: number): string => `${(v / of) * 100}%`

export function overlayStyle(
  region: TextRegion,
  /** CSS pixels per design point, from the canvas's displayed size. */
  scale: number,
  /** Backing-store size of the canvas — the units `region.rect` is in. */
  canvas: { w: number; h: number },
  /** The cut to set it in. Mixed runs pick the one the whole field agrees on. */
  variant: { bold?: boolean; italic?: boolean } = {},
): CSSProperties {
  const { rect, style, indent } = region
  const font = fontFor(style.voice, variantFor(!!variant.bold, !!variant.italic))
  return {
    left: pct(rect.x, canvas.w),
    top: pct(rect.y, canvas.h),
    width: pct(rect.w, canvas.w),
    // Exactly the height the painter used, not a minimum.
    //
    // The box has to be the ink, because it is the thing you see: an outline
    // taller than the words reads as the editor disagreeing with the page. It
    // stays right as you type because the region is re-measured on every
    // repaint, so adding a line grows this to match on the same frame rather
    // than the box being sized once on the way in.
    height: pct(Math.max(rect.h, 8), canvas.h),
    fontFamily: `"${font.family}", ${font.fallback}`,
    fontWeight: font.weight,
    fontSize: `${style.size * scale}px`,
    lineHeight: style.lineHeight,
    letterSpacing: `${style.tracking * style.size * scale}px`,
    textIndent: `${indent * scale}px`,
    textAlign: style.align,
    textTransform:
      style.case === 'upper' ? 'uppercase' : style.case === 'lower' ? 'lowercase' : 'none',
  }
}

/** The browser's caret hit test, under either of the two names it has. */
function caretAt(x: number, y: number): { node: Node | null; offset: number } | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
    caretRangeFromPoint?: (x: number, y: number) => Range | null
  }
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (pos) return { node: pos.offsetNode, offset: pos.offset }
  const range = doc.caretRangeFromPoint?.(x, y)
  return range ? { node: range.startContainer, offset: range.startOffset } : null
}

/**
 * Which character of a field a click landed on.
 *
 * ## Why a throwaway element
 *
 * The words on screen are painted on a canvas, and a canvas has no characters
 * to hit-test — it has pixels. The editor's own `<textarea>` does know, but it
 * is not mounted yet at the moment of the click that opens it, and browsers do
 * not let you ask a textarea where a point falls anyway (the hit test stops at
 * the element, not at the text inside it).
 *
 * So this lays the same string out in a plain `<div>`, styled by
 * {@link overlayStyle} and positioned over exactly the same box, asks the
 * browser where the point falls in *that*, and throws it away — all inside one
 * event handler, so it is never painted and nothing flickers. A div is the one
 * thing `caretPositionFromPoint` answers honestly about.
 *
 * Without it, clicking into a paragraph put the caret at the end of it, which
 * is the thing that made typing on the page feel unlike every other editor:
 * you clicked on the word you meant to fix and your next keystroke landed
 * somewhere else entirely.
 *
 * Returns the end of the text when the point is past it, or when the browser
 * declines to answer — the old behaviour, for the cases where there is no
 * better one.
 */
export function offsetFromPoint(opts: {
  /** The `[data-leaf]` element the overlay layer is positioned within. */
  host: HTMLElement
  region: TextRegion
  scale: number
  canvas: { w: number; h: number }
  /** The field's text, exactly as the editor will hold it. */
  text: string
  clientX: number
  clientY: number
}): number {
  const { host, region, scale, canvas, text, clientX, clientY } = opts
  if (!text) return 0

  const mirror = document.createElement('div')
  Object.assign(mirror.style, overlayStyle(region, scale, canvas), {
    position: 'absolute',
    // Above everything else on the page for the instant it exists, so the hit
    // test answers about this text and not about whatever is painted over it.
    zIndex: '2147483647',
    // Free to grow: a field whose text overruns its painted box still has to be
    // hit-testable on the lines that did not fit.
    height: 'auto',
    margin: '0',
    padding: '0',
    border: '0',
    // How a textarea lays its own text out, so the two wrap identically.
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    color: 'transparent',
  } satisfies Partial<CSSStyleDeclaration>)
  mirror.textContent = text
  host.appendChild(mirror)
  try {
    const hit = caretAt(clientX, clientY)
    const node = mirror.firstChild
    if (hit && node && (hit.node === node || hit.node === mirror)) {
      return Math.max(0, Math.min(text.length, hit.node === mirror ? text.length : hit.offset))
    }
    return text.length
  } finally {
    mirror.remove()
  }
}

/**
 * The word around an offset, for a double-click.
 *
 * A double-click on a canvas has to be told what a word is; inside the textarea
 * the browser would have done this itself. The rule is the ordinary one — a run
 * of characters that are not whitespace — and a double-click that lands on the
 * space between two words selects neither rather than both.
 */
export function wordAt(text: string, index: number): { from: number; to: number } {
  const space = /\s/
  const at = Math.max(0, Math.min(text.length, index))
  // Landing just past the end of a word counts as being in it, which is what a
  // double-click on the last letter of a line resolves to.
  const start = at > 0 && (at === text.length || space.test(text[at])) ? at - 1 : at
  if (start < 0 || space.test(text[start] ?? ' ')) return { from: at, to: at }
  let from = start
  let to = start
  while (from > 0 && !space.test(text[from - 1])) from -= 1
  while (to < text.length && !space.test(text[to])) to += 1
  return { from, to }
}
