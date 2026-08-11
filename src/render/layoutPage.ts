import { HEADER_MAX_RATIO, PAD_RATIO } from '../core/config/constants'
import { fontString, HEADER_FONT, SECONDARY_FONT } from '../core/config/fonts'
import {
  headerCapAscent,
  measureFittedParagraphsBox,
  measureParagraph,
} from '../core/elements'
import { fitHeader } from '../core/text/autofit'
import type { Rect } from '../core/types'
import type { PageElement, TextElement } from '../doc/types'
import { sizeOf, type PageEnv } from './env'
import { frameRect, type ItemSource } from './page'

/**
 * One element resolved to pixels.
 *
 * `cellRect` is the grid box it was given; `rect` is what actually gets painted.
 * They differ for auto-height text (which is as tall as it measures, not as tall
 * as its box) and for a logo (as wide as its aspect ratio). Handles snap to
 * `cellRect`; hit-testing uses `rect`, so you can always grab what you can see.
 */
export interface Placed {
  el: PageElement
  cellRect: Rect
  rect: Rect
  /** Text only: everything the draw pass would otherwise have to re-derive. */
  text?: TextLayout
  /** Where this came from — what the editor branches on. See `render/page.ts`. */
  source: ItemSource
  /** Flowed items only: the content block this fragment belongs to. */
  blockId?: string
}

export interface TextLayout {
  /** Resolved font size in page pixels. */
  size: number
  /** Lines as they will be drawn (header only; other variants wrap internally). */
  lines: string[]
  /** Header only: vertical advance per line. */
  lineAdvance: number
  /** Measured height of the drawn block. */
  height: number
  /** Measured width of the drawn block, which for fitted text is the widest badge. */
  width: number
}

const isText = (el: PageElement): el is TextElement => el.kind === 'text'

/** Greedy word wrap at a fixed size — the header path, which never autofits width. */
function wrapAt(
  ctx: CanvasRenderingContext2D,
  text: string,
  size: number,
  maxWidth: number,
): string[] {
  ctx.font = fontString(HEADER_FONT, size)
  const out: string[] = []
  for (const seg of text.split('\n')) {
    const words = seg.split(/\s+/).filter(Boolean)
    if (!words.length) {
      out.push('')
      continue
    }
    let cur = ''
    for (const word of words) {
      const trial = cur ? `${cur} ${word}` : word
      if (cur && ctx.measureText(trial.toUpperCase()).width > maxWidth) {
        out.push(cur)
        cur = word
      } else {
        cur = trial
      }
    }
    if (cur) out.push(cur)
  }
  return out.length ? out : ['']
}

/** Measure one text element inside a box of `boxW` pixels. */
export function measureText(env: PageEnv, el: TextElement, boxW: number): TextLayout {
  const { ctx } = env
  const pad = env.shortEdge * PAD_RATIO

  if (el.variant === 'header') {
    // `autoFit` solves the size so the widest line fills the box — the poster's
    // signature behaviour, and the one deliberate escape from the discrete scale.
    const rawLines = el.text.split('\n')
    const size = el.autoFit
      ? fitHeader(
          ctx,
          rawLines,
          HEADER_FONT,
          boxW,
          pad,
          undefined,
          env.shortEdge * HEADER_MAX_RATIO,
        ).size
      : sizeOf(env, el.step)
    const lines = el.autoFit ? rawLines : wrapAt(ctx, el.text, size, boxW - pad * 2)
    const lineAdvance = headerCapAscent(ctx, size) + 2 * pad
    let width = 0
    ctx.font = fontString(HEADER_FONT, size)
    for (const l of lines) {
      width = Math.max(width, ctx.measureText(l.toUpperCase()).width + pad * 2)
    }
    return { size, lines, lineAdvance, height: lines.length * lineAdvance, width }
  }

  const size = sizeOf(env, el.step)

  if (el.variant === 'paragraph') {
    const { lines, height } = measureParagraph(ctx, el.text, size, boxW, pad)
    return { size, lines, lineAdvance: size, height, width: boxW }
  }

  // `badge` and `plain` both stack per-line fitted boxes; `plain` just skips the fill.
  const box = measureFittedParagraphsBox(
    ctx,
    [{ text: el.text, style: 'fitted', side: el.align }],
    size,
    boxW,
    pad,
  )
  ctx.font = fontString(SECONDARY_FONT, size)
  return { size, lines: [], lineAdvance: size, height: box.h, width: box.w }
}

/** Where a measured block of `height` sits inside a box of `boxH`. */
function offsetFor(vAlign: TextElement['vAlign'], boxH: number, height: number): number {
  if (vAlign === 'top') return 0
  if (vAlign === 'bottom') return boxH - height
  return (boxH - height) / 2
}

/**
 * Resolve every item on a page to pixels.
 *
 * Pure, and deliberately separate from painting: the editor gets its hit-test
 * geometry by calling this directly, so what you can click is by construction
 * what got drawn. The poster app achieved the same guarantee with a `collect`
 * callback threaded through the draw functions — unnecessary once geometry is
 * something a function returns rather than a side effect of painting.
 *
 * Boxed and framed items differ only in where their rectangle comes from; text
 * measurement, alignment and drawing are identical afterwards. That is the whole
 * point — flowed content is not a second rendering path.
 */
export function layoutPage(env: PageEnv): Placed[] {
  const { g } = env
  return env.page.items.map((item) => {
    const { el, source } = item
    const blockId = item.kind === 'framed' ? item.blockId : undefined

    // A framed item's vertical placement is already decided by the flow, so its
    // height is authoritative and `autoHeight` does not apply — the paginator
    // measured it to work out where the next thing goes.
    const framed = item.kind === 'framed'
    const cellRect = framed ? frameRect(g, item.frame, env.h) : g.rect(el.box)

    if (isText(el)) {
      const text = measureText(env, el, cellRect.w)
      // An auto-height box is as tall as its content, snapped up to whole rows so
      // it still reads as a grid box; a fixed one keeps the height the user set.
      const boxH = framed ? cellRect.h : el.autoHeight ? g.vspan(g.rowsFor(text.height)) : cellRect.h
      const rect: Rect = {
        x: cellRect.x,
        y: cellRect.y + offsetFor(framed ? 'top' : el.vAlign, boxH, text.height),
        w: text.width || cellRect.w,
        h: text.height,
      }
      // Fitted text is only as wide as its widest line; align it within the box.
      if (el.align === 'center') rect.x = cellRect.x + (cellRect.w - rect.w) / 2
      else if (el.align === 'right') rect.x = cellRect.x + cellRect.w - rect.w
      return { el, cellRect: { ...cellRect, h: boxH }, rect, text, source, blockId }
    }

    return { el, cellRect, rect: cellRect, source, blockId }
  })
}
