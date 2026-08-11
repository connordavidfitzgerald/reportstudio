import { BODY_INDENT_EM, BLOCK_GAP, MARGIN, TYPE } from '../config/brand'
import { getFormat, typeStepFor, type PageFormat } from '../config/formats'
import { measureParagraph } from '../core/elements'
import type { Block } from '../doc/blocks'
import { isSplittable, keepsWithNext } from '../doc/blocks'
import type { FlowSection } from '../doc/sections'
import type { Deck, PageElement, TextElement } from '../doc/types'
import { buildPageEnv, type PageEnv, type RenderAssets } from './env'
import { measureText } from './layoutPage'
import type { Frame, RenderItem, RenderPage } from './page'

/**
 * Pagination: a stream of blocks in, a list of pages out.
 *
 * The one structural rule is that **nothing here is stored**. Pages are derived
 * from `section.blocks` on demand, so an edit anywhere upstream simply produces
 * different pages, and no part of the document can go stale relative to another.
 *
 * Blocks compile to ordinary `PageElement`s and are placed with {@link Frame}s,
 * which means flowed content is measured and drawn by exactly the same code as
 * hand-placed content. This file decides *where things break*; it does not know
 * how to draw anything.
 */

/** A block compiled to something drawable, with its measured height. */
interface Piece {
  el: PageElement
  blockId: string
  height: number
  keepWithNext: boolean
  /** Remaining text if this piece is the head of a split block. */
  rest?: Block
}

// ---------------------------------------------------------------------------
// Compiling blocks to elements
// ---------------------------------------------------------------------------

const EMPTY_BOX = { col: 0, row: 0, colSpan: 1, rowSpan: 1 }

/**
 * The type role each block kind uses. Sizes are steps on the brand ladder, never
 * raw pixels, so the same blocks typeset correctly at any page size.
 */
function textFor(block: Block, format: PageFormat): TextElement {
  const base = {
    kind: 'text' as const,
    id: block.id,
    box: EMPTY_BOX,
    align: 'left' as const,
    vAlign: 'top' as const,
    autoHeight: true,
  }
  switch (block.kind) {
    case 'heading':
      return { ...base, text: block.text, variant: 'plain', step: TYPE.chapterTitle.step, bg: 'none' }
    case 'subhead':
      return { ...base, text: block.text.toUpperCase(), variant: 'plain', step: TYPE.subhead.step, bg: 'none' }
    case 'lede':
      return { ...base, text: block.text, variant: 'paragraph', step: TYPE.lede.step, bg: 'none' }
    case 'para':
      return {
        ...base,
        // The indent is real text rather than a layout offset because
        // `drawParagraph` wraps the string it is given; an offset would only
        // move the whole block.
        text: (block.indent === false ? '' : indentFor(block, format)) + block.text,
        variant: 'paragraph',
        step: TYPE.body.step,
        bg: 'none',
      }
    case 'list':
      return {
        ...base,
        text: block.items.map((i) => `•  ${i}`).join('\n'),
        variant: 'paragraph',
        step: TYPE.body.step,
        bg: 'none',
      }
    case 'quote':
      return {
        ...base,
        text: block.attribution ? `${block.text}\n— ${block.attribution}` : block.text,
        variant: 'badge',
        step: TYPE.lede.step,
        bg: 'highlight',
      }
  }
}

/** A first-line indent, as spaces sized to the body em. */
function indentFor(_block: Block, _format: PageFormat): string {
  return ' '.repeat(Math.round(BODY_INDENT_EM * 2))
}

/** Replace a splittable block's content with whatever is left over. */
function withText(block: Block, lines: string[]): Block {
  if (block.kind === 'list') return { ...block, items: lines }
  const text = lines.join('\n')
  // A continuation never re-indents: the first line of the tail is the middle of
  // a sentence, not the start of a paragraph.
  return block.kind === 'para' ? { ...block, text, indent: false } : { ...block, text }
}

/** The lines a splittable block wrapped into, for deciding where to break it. */
function linesOf(env: PageEnv, block: Block, el: TextElement, width: number): string[] {
  if (block.kind === 'list') return block.items
  const size = env.shortEdge * typeStepFor(env.format, el.step)
  return measureParagraph(env.ctx, el.text, size, width, 0).lines
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** Minimum lines a split may leave behind or carry forward. */
const ORPHANS = 2
const WIDOWS = 2

export interface FlowOptions {
  /** Page number of the section's first page, for the folio. */
  startFolio?: number
}

/**
 * Typeset a section into pages.
 *
 * Greedy with break penalties rather than Knuth–Plass: an editorial report wants
 * predictable breaks it can override, not globally optimal ones it cannot
 * explain. Headings hold onto what follows; paragraphs and lists split with
 * orphan and widow control; everything else is atomic.
 */
export function flowSection(
  section: FlowSection,
  deck: Deck,
  metrics: CanvasRenderingContext2D,
  assets: RenderAssets,
  opts: FlowOptions = {},
): RenderPage[] {
  const format = getFormat(deck.format)
  const env = buildPageEnv(
    metrics,
    { id: section.id, paletteId: section.paletteId, items: [] },
    deck,
    format.w,
    format.h,
    assets,
  )

  const margin = MARGIN * format.w
  const gap = BLOCK_GAP * format.w
  // The band the running head and its rule occupy, below which content starts.
  const headBand = env.shortEdge * typeStepFor(format, TYPE.runningHead.step) * 2.4
  const top = margin + headBand
  const bottom = format.h - margin
  const width = format.w - margin * 2

  const pages: RenderPage[] = []
  let items: RenderItem[] = []
  let cursor = top

  const flush = (): void => {
    pages.push({
      id: `${section.id}#${pages.length}`,
      paletteId: section.paletteId,
      items: [...furniture(env, section, (opts.startFolio ?? 1) + pages.length, format), ...items],
    })
    items = []
    cursor = top
  }

  const place = (piece: Piece): void => {
    items.push({
      kind: 'framed',
      el: piece.el,
      blockId: piece.blockId,
      source: 'flow',
      frame: {
        col: 0,
        colSpan: format.cols,
        yFrac: cursor / format.h,
        hFrac: piece.height / format.h,
      },
    })
    cursor += piece.height + gap
  }

  const queue: Block[] = [...section.blocks]

  while (queue.length) {
    const block = queue.shift()!
    const el = textFor(block, format)
    const measured = measureText(env, el, width)
    const height = measured.height
    const room = bottom - cursor

    if (block.breakBefore && items.length) flush()

    if (height <= room) {
      // Fits. Hold a heading back if nothing can follow it on this page.
      if (keepsWithNext(block) && queue.length && bottom - (cursor + height + gap) <= 0 && items.length) {
        flush()
      }
      place({ el, blockId: block.id, height, keepWithNext: keepsWithNext(block) })
      continue
    }

    if (!isSplittable(block)) {
      // Atomic and too tall: move it to a fresh page, or accept the overflow if
      // it cannot fit on one at all. Overflowing beats looping forever.
      if (items.length) {
        flush()
        queue.unshift(block)
      } else {
        place({ el, blockId: block.id, height, keepWithNext: false })
        flush()
      }
      continue
    }

    // Split: fit as many whole lines as the remaining room allows.
    const lines = linesOf(env, block, el, width)
    const perLine = height / Math.max(1, lines.length)
    const fits = Math.floor(room / perLine)

    if (fits < ORPHANS || lines.length - fits < WIDOWS) {
      // Not enough of it would stay behind (or carry forward) to be worth
      // splitting — move the whole block on.
      if (items.length) {
        flush()
        queue.unshift(block)
      } else {
        place({ el, blockId: block.id, height, keepWithNext: false })
        flush()
      }
      continue
    }

    const head = withText(block, lines.slice(0, fits))
    const tail = withText(block, lines.slice(fits))
    const headEl = textFor(head, format)
    place({
      el: headEl,
      blockId: block.id,
      height: measureText(env, headEl, width).height,
      keepWithNext: false,
    })
    flush()
    queue.unshift(tail)
  }

  if (items.length || !pages.length) flush()
  return pages
}

// ---------------------------------------------------------------------------
// Page furniture
// ---------------------------------------------------------------------------

/**
 * Running head, folio and the two hairline rules.
 *
 * Rebuilt per page rather than stored: it is a function of where the page landed,
 * so keeping it in the document would mean a folio that goes stale the moment
 * anything upstream reflows. Marked `locked` so hit-testing skips it — this is
 * chrome, not content.
 */
function furniture(
  env: PageEnv,
  section: FlowSection,
  folio: number,
  format: PageFormat,
): RenderItem[] {
  const margin = MARGIN * format.w
  const width = format.w - margin * 2
  const headSize = env.shortEdge * typeStepFor(format, TYPE.runningHead.step)
  const ruleH = Math.max(1, format.w / 1190) // 1pt at the reference page

  const frame = (y: number, h: number): Frame => ({
    col: 0,
    colSpan: format.cols,
    yFrac: y / format.h,
    hFrac: h / format.h,
  })

  const text = (id: string, s: string, align: 'left' | 'right', y: number): RenderItem => ({
    kind: 'framed',
    source: 'furniture',
    frame: frame(y, headSize * 1.2),
    el: {
      kind: 'text',
      id: `${id}@${folio}`,
      box: EMPTY_BOX,
      locked: true,
      text: s,
      variant: 'plain',
      step: TYPE.runningHead.step,
      align,
      vAlign: 'top',
      bg: 'none',
      autoHeight: false,
    },
  })

  const rule = (id: string, y: number): RenderItem => ({
    kind: 'framed',
    source: 'furniture',
    frame: frame(y, ruleH),
    el: { kind: 'block', id: `${id}@${folio}`, box: EMPTY_BOX, locked: true, bg: 'ink' },
  })

  void width
  return [
    text('runhead', section.title?.toUpperCase() ?? '', 'left', margin),
    text('folio', String(folio), 'right', margin),
    rule('rule-top', margin + headSize * 1.4),
    rule('rule-bottom', format.h - margin),
  ]
}
