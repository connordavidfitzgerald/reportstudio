import { BLOCK_GAP, BODY_INDENT_EM, MARGIN, TYPE } from '../config/brand'
import { getFormat, typeStepFor, type PageFormat } from '../config/formats'
import { PAD_RATIO } from '../core/config/constants'
import { measureParagraph } from '../core/elements'
import type { Block, BlockId } from '../doc/blocks'
import { isSplittable, keepsWithNext } from '../doc/blocks'
import { t, type Lang } from '../doc/localized'
import type { FlowSection } from '../doc/sections'
import type { BgRole, Deck, PageElement, TextElement } from '../doc/types'
import { buildPageEnv, type PageEnv, type RenderAssets } from './env'
import { measureText } from './layoutPage'
import type { Frame, RenderItem, RenderPage } from './page'
import { grid } from './grid'
import type { Override } from '../doc/overrides'

/**
 * Pagination: a stream of blocks in, a list of pages out.
 *
 * The one structural rule is that **nothing here is stored**. Pages are derived
 * from `section.blocks` on demand, so an edit anywhere upstream simply produces
 * different pages, and no part of the document can go stale relative to another.
 *
 * Blocks compile to ordinary `PageElement`s placed with {@link Frame}s, so
 * flowed content is measured and drawn by exactly the same code as hand-placed
 * content. This file decides *what goes where and where things break*; it does
 * not know how to draw anything.
 */

/** One element within a compiled block, positioned relative to the block's top. */
interface Part {
  el: PageElement
  col: number
  colSpan: number
  /** Sub-column override — chart bars only. See {@link Frame}. */
  xFrac?: number
  wFrac?: number
  dy: number
  h: number
}

/** A block compiled to drawable parts, with its total height. */
interface Piece {
  parts: Part[]
  height: number
}

/**
 * How a splittable block can be cut.
 *
 * `unitHeights` are the pieces the paginator may break between — lines for a
 * paragraph, items for a list, rows for a definition list. `make` rebuilds the
 * block from a slice of them.
 */
interface SplitPlan {
  unitHeights: number[]
  make: (from: number, to: number) => Block
}

const EMPTY_BOX = { col: 0, row: 0, colSpan: 1, rowSpan: 1 }

// ---------------------------------------------------------------------------
// Compiling
// ---------------------------------------------------------------------------

interface Ctx {
  env: PageEnv
  format: PageFormat
  lang: Lang
  /** Content column width in page pixels. */
  width: number
  gap: number
}

const textEl = (
  id: string,
  text: string,
  step: number,
  opts: Partial<TextElement> = {},
): TextElement => ({
  kind: 'text',
  id,
  box: EMPTY_BOX,
  text,
  variant: 'paragraph',
  step,
  align: 'left',
  vAlign: 'top',
  bg: 'none',
  autoHeight: true,
  ...opts,
})

/** Height of a text element laid out in `w` pixels. */
const heightOf = (cx: Ctx, el: TextElement, w: number): number =>
  measureText(cx.env, el, w).height

const px = (cx: Ctx, step: number): number =>
  cx.env.shortEdge * typeStepFor(cx.format, step)

/** A first-line indent, as spaces sized to the body em. */
const INDENT = ' '.repeat(Math.round(BODY_INDENT_EM * 2))

/** One full-width part, the common case. */
const full = (cx: Ctx, el: PageElement, h: number, dy = 0): Part => ({
  el,
  col: 0,
  colSpan: cx.format.cols,
  dy,
  h,
})

function compile(cx: Ctx, block: Block): Piece {
  const { width, format } = cx
  const L = (v: Parameters<typeof t>[0]): string => t(v, cx.lang)

  switch (block.kind) {
    case 'heading': {
      const el = textEl(block.id, L(block.text), TYPE.chapterTitle.step, { variant: 'plain' })
      const h = heightOf(cx, el, width)
      return { parts: [full(cx, el, h)], height: h }
    }
    case 'subhead': {
      // The ruled band: rule, caps label, rule.
      const label = textEl(block.id, L(block.text).toUpperCase(), TYPE.subhead.step, {
        variant: 'plain',
      })
      const labelH = heightOf(cx, label, width)
      const ruleH = Math.max(1, format.w / 1190)
      const pad = px(cx, TYPE.subhead.step) * 0.4
      const rule = (n: string, dy: number): Part =>
        full(cx, { kind: 'block', id: `${block.id}-${n}`, box: EMPTY_BOX, bg: 'ink' }, ruleH, dy)
      return {
        parts: [rule('r1', 0), full(cx, label, labelH, ruleH + pad), rule('r2', ruleH + pad + labelH + pad)],
        height: ruleH * 2 + pad * 2 + labelH,
      }
    }
    case 'lede': {
      const el = textEl(block.id, L(block.text), TYPE.lede.step)
      const h = heightOf(cx, el, width)
      return { parts: [full(cx, el, h)], height: h }
    }
    case 'para': {
      const el = textEl(
        block.id,
        (block.indent === false ? '' : INDENT) + L(block.text),
        TYPE.body.step,
      )
      const h = heightOf(cx, el, width)
      return { parts: [full(cx, el, h)], height: h }
    }
    case 'list': {
      const cols = block.columns ?? 1
      const colW = width / cols
      const items = block.items.map((i) => `•  ${L(i)}`)
      if (cols === 1) {
        const el = textEl(block.id, items.join('\n'), TYPE.body.step)
        const h = heightOf(cx, el, width)
        return { parts: [full(cx, el, h)], height: h }
      }
      // Two columns, filled down then across, as the open-codes page does.
      const half = Math.ceil(items.length / 2)
      const span = Math.floor(format.cols / 2)
      const left = textEl(`${block.id}-l`, items.slice(0, half).join('\n'), TYPE.body.step)
      const right = textEl(`${block.id}-r`, items.slice(half).join('\n'), TYPE.body.step)
      const lh = heightOf(cx, left, colW)
      const rh = heightOf(cx, right, colW)
      return {
        parts: [
          { el: left, col: 0, colSpan: span, dy: 0, h: lh },
          { el: right, col: span, colSpan: format.cols - span, dy: 0, h: rh },
        ],
        height: Math.max(lh, rh),
      }
    }
    case 'quote':
    case 'statement': {
      const text =
        block.kind === 'quote' && block.attribution
          ? `${L(block.text)}\n— ${L(block.attribution)}`
          : L(block.text)
      // The display voice on a swash — the same notched treatment as the poster.
      const el = textEl(block.id, text, TYPE.lede.step, { variant: 'header', bg: 'highlight' })
      const h = heightOf(cx, el, width)
      return { parts: [full(cx, el, h)], height: h }
    }
    case 'defList': {
      const termSpan = Math.round(format.cols * 5 / 12)
      const defSpan = format.cols - termSpan
      const termW = (width * termSpan) / format.cols
      const defW = (width * defSpan) / format.cols
      const ruleH = Math.max(1, format.w / 1190)
      const pad = px(cx, TYPE.body.step) * 0.5
      const parts: Part[] = []
      let y = 0
      for (const [i, row] of block.rows.entries()) {
        const term = textEl(`${block.id}-t${i}`, L(row.term).toUpperCase(), TYPE.body.step, {
          variant: 'plain',
        })
        const def = textEl(`${block.id}-d${i}`, L(row.def), TYPE.body.step)
        const th = heightOf(cx, term, termW)
        const dh = heightOf(cx, def, defW)
        parts.push(
          full(cx, { kind: 'block', id: `${block.id}-r${i}`, box: EMPTY_BOX, bg: 'ink' }, ruleH, y),
        )
        parts.push({ el: term, col: 0, colSpan: termSpan, dy: y + ruleH + pad, h: th })
        parts.push({ el: def, col: termSpan, colSpan: defSpan, dy: y + ruleH + pad, h: dh })
        y += ruleH + pad + Math.max(th, dh) + pad
      }
      return { parts, height: y }
    }
    case 'links': {
      const parts: Part[] = []
      const title = textEl(`${block.id}-h`, L(block.title), TYPE.deck.step, { variant: 'plain' })
      let y = heightOf(cx, title, width)
      parts.push(full(cx, title, y))
      for (const [i, item] of block.items.entries()) {
        y += cx.gap
        const label = textEl(`${block.id}-a${i}`, L(item.label), TYPE.body.step, {
          variant: 'plain',
        })
        const lh = heightOf(cx, label, width)
        parts.push(full(cx, label, lh, y))
        y += lh
        if (item.note) {
          const note = textEl(`${block.id}-n${i}`, L(item.note), TYPE.body.step)
          const nh = heightOf(cx, note, width)
          parts.push(full(cx, note, nh, y))
          y += nh
        }
      }
      return { parts, height: y }
    }
    case 'figure': {
      const aspect = block.aspect ?? 0.62
      const imgH = width * aspect
      const parts: Part[] = [
        full(
          cx,
          {
            kind: 'image',
            id: block.id,
            box: EMPTY_BOX,
            imageRef: block.imageRef,
            halftone: block.halftone ? cx.format.halftone : null,
          },
          imgH,
        ),
      ]
      let y = imgH
      const caption = [block.caption && L(block.caption), block.credit && L(block.credit)]
        .filter(Boolean)
        .join('  ·  ')
      if (caption) {
        y += cx.gap * 0.5
        const el = textEl(`${block.id}-c`, caption, TYPE.caption.step)
        const h = heightOf(cx, el, width)
        parts.push(full(cx, el, h, y))
        y += h
      }
      return { parts, height: y }
    }
    case 'chart': {
      const max = block.max ?? Math.max(...block.series.map((s) => s.value), 1)
      // Bars occupy the left half; the number and its labels sit to the right.
      const barZone = 0.5
      const numStep = TYPE.statNumber.step - 2
      const rowH = px(cx, numStep) * 1.5
      const parts: Part[] = []
      let y = 0
      for (const [i, s] of block.series.entries()) {
        const frac = Math.max(0, Math.min(1, s.value / max)) * barZone
        parts.push({
          el: {
            kind: 'block',
            id: `${block.id}-b${i}`,
            box: EMPTY_BOX,
            bg: `chart${(i % 6) + 1}` as BgRole,
          },
          col: 0,
          colSpan: cx.format.cols,
          // A bar's width IS its value, so it is placed proportionally.
          xFrac: 0,
          wFrac: frac,
          dy: y,
          h: rowH * 0.78,
        })
        const num = textEl(
          `${block.id}-v${i}`,
          `${s.value}${block.unit ?? ''}`,
          numStep,
          { variant: 'plain' },
        )
        const numH = heightOf(cx, num, width * (1 - barZone))
        const labelText = [L(s.label), s.sublabel && L(s.sublabel)].filter(Boolean).join('\n')
        const label = textEl(`${block.id}-l${i}`, labelText, TYPE.caption.step)
        const labH = heightOf(cx, label, width * (1 - barZone))
        parts.push({
          el: num,
          col: 0,
          colSpan: cx.format.cols,
          xFrac: barZone + 0.02,
          wFrac: 1 - barZone - 0.02,
          dy: y,
          h: numH,
        })
        parts.push({
          el: label,
          col: 0,
          colSpan: cx.format.cols,
          xFrac: barZone + 0.02,
          wFrac: 1 - barZone - 0.02,
          dy: y + numH,
          h: labH,
        })
        y += Math.max(rowH, numH + labH) + cx.gap
      }
      return { parts, height: Math.max(0, y - cx.gap) }
    }
  }
}

// ---------------------------------------------------------------------------
// Splitting
// ---------------------------------------------------------------------------

/** How a block may be cut, or null when it is atomic. */
function splitPlan(cx: Ctx, block: Block): SplitPlan | null {
  if (!isSplittable(block)) return null
  const { width } = cx

  if (block.kind === 'para') {
    const el = textEl(block.id, (block.indent === false ? '' : INDENT) + t(block.text, cx.lang), TYPE.body.step)
    const size = px(cx, TYPE.body.step)
    // Same padding `measureText` applies, or the per-line estimate is short.
    const pad = cx.env.shortEdge * PAD_RATIO
    const { lines, height } = measureParagraph(cx.env.ctx, el.text, size, width, pad)
    if (lines.length < 2) return null
    const per = height / lines.length
    return {
      unitHeights: lines.map(() => per),
      // A continuation never re-indents: its first line is the middle of a
      // sentence, not the start of a paragraph.
      make: (from, to) => ({ ...block, text: lines.slice(from, to).join('\n'), indent: from === 0 ? block.indent : false }),
    }
  }

  if (block.kind === 'list') {
    if (block.items.length < 2 || (block.columns ?? 1) > 1) return null
    const heights = block.items.map(
      (i) => heightOf(cx, textEl('m', `•  ${t(i, cx.lang)}`, TYPE.body.step), width),
    )
    return {
      unitHeights: heights,
      make: (from, to) => ({ ...block, items: block.items.slice(from, to) }),
    }
  }

  if (block.kind === 'defList') {
    if (block.rows.length < 2) return null
    const heights = block.rows.map(
      (_, i) => compile(cx, { ...block, rows: [block.rows[i]] }).height,
    )
    return {
      unitHeights: heights,
      make: (from, to) => ({ ...block, rows: block.rows.slice(from, to) }),
    }
  }

  // links: the title stays with the head.
  if (block.kind !== 'links' || block.items.length < 2) return null
  const whole = compile(cx, block).height
  const first = compile(cx, { ...block, items: block.items.slice(0, 1) }).height
  const per = (whole - first) / Math.max(1, block.items.length - 1)
  return {
    unitHeights: block.items.map((_, i) => (i === 0 ? first : per)),
    make: (from, to) => ({
      ...block,
      title: from === 0 ? block.title : '',
      items: block.items.slice(from, to),
    }),
  }
}

/** Minimum units a split may leave behind or carry forward. */
const ORPHANS = 2
const WIDOWS = 2

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface FlowOptions {
  /** Page number of the section's first page, for the folio. */
  startFolio?: number
  lang?: Lang
}

/**
 * Typeset a section into pages.
 *
 * Greedy with break penalties rather than Knuth–Plass: an editorial report wants
 * predictable breaks it can override, not globally optimal ones it cannot
 * explain. Headings hold onto what follows; paragraphs, lists and definition
 * lists split with orphan and widow control; everything else is atomic.
 */
/**
 * A horizontal band a pinned element occupies on a given page, which flowed text
 * must not run into.
 */
interface Obstruction {
  page: number
  top: number
  bottom: number
}

interface Pass {
  pages: RenderPage[]
  /** Page index (within the section) of each block's first fragment. */
  blockPage: Map<BlockId, number>
}

function flowPass(
  section: FlowSection,
  deck: Deck,
  metrics: CanvasRenderingContext2D,
  assets: RenderAssets,
  opts: FlowOptions,
  obstructions: Obstruction[],
): Pass {
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
  const headBand = env.shortEdge * typeStepFor(format, TYPE.runningHead.step) * 2.4
  const top = margin + headBand
  const bottom = format.h - margin
  const width = format.w - margin * 2
  const cx: Ctx = { env, format, lang: opts.lang ?? 'en', width, gap }

  const pages: RenderPage[] = []
  const blockPage = new Map<BlockId, number>()
  let items: RenderItem[] = []

  /**
   * The usable vertical band on a page, after any pinned obstruction.
   *
   * A band at the top pushes content down; one at the bottom stops it short.
   * Deliberately not a shaped runaround — the brand has none.
   */
  const regionOf = (page: number): { top: number; bottom: number } => {
    let a = top
    let b = bottom
    for (const o of obstructions) {
      if (o.page !== page) continue
      const midway = (o.top + o.bottom) / 2 < (top + bottom) / 2
      if (midway) a = Math.max(a, o.bottom)
      else b = Math.min(b, o.top)
    }
    return { top: a, bottom: b }
  }

  let region = regionOf(0)
  let cursor = region.top

  const flush = (): void => {
    pages.push({
      id: `${section.id}#${pages.length}`,
      paletteId: section.paletteId,
      items: [...furniture(env, section, (opts.startFolio ?? 1) + pages.length, format, cx.lang), ...items],
    })
    items = []
    region = regionOf(pages.length)
    cursor = region.top
  }

  const place = (piece: Piece, blockId: BlockId): void => {
    if (!blockPage.has(blockId)) blockPage.set(blockId, pages.length)
    for (const part of piece.parts) {
      items.push({
        kind: 'framed',
        el: part.el,
        blockId,
        source: 'flow',
        frame: {
          col: part.col,
          colSpan: part.colSpan,
          xFrac: part.xFrac,
          wFrac: part.wFrac,
          yFrac: (cursor + part.dy) / format.h,
          hFrac: part.h / format.h,
        },
      })
    }
    cursor += piece.height + gap
  }

  const queue: Block[] = [...section.blocks]

  while (queue.length) {
    const block = queue.shift()!

    if (block.breakBefore && items.length) flush()

    const piece = compile(cx, block)
    const room = region.bottom - cursor

    if (piece.height <= room) {
      // Fits. Hold a heading back if nothing could follow it on this page.
      if (keepsWithNext(block) && queue.length && cursor + piece.height + gap >= region.bottom && items.length) {
        flush()
        place(compile(cx, block), block.id)
      } else {
        place(piece, block.id)
      }
      continue
    }

    const plan = splitPlan(cx, block)
    let fits = 0
    if (plan) {
      let acc = 0
      for (const h of plan.unitHeights) {
        if (acc + h > room) break
        acc += h
        fits++
      }
      if (fits < ORPHANS || plan.unitHeights.length - fits < WIDOWS) fits = 0
    }

    if (plan && fits > 0) {
      // Confirm the *compiled* head fits rather than trusting the per-unit
      // estimate. Estimates are approximations by nature — a paragraph's fixed
      // ascent/descent overhead does not divide evenly by line count — and an
      // unverified one puts content past the bottom margin, which looks like a
      // slightly full page rather than a bug.
      let head = plan.make(0, fits)
      let headPiece = compile(cx, head)
      while (headPiece.height > room && fits > ORPHANS) {
        fits--
        head = plan.make(0, fits)
        headPiece = compile(cx, head)
      }
      if (headPiece.height <= room && plan.unitHeights.length - fits >= WIDOWS) {
        place(headPiece, block.id)
        flush()
        queue.unshift(plan.make(fits, plan.unitHeights.length))
        continue
      }
      // Shrinking it far enough would leave an orphan; move the whole block on.
    }

    // Atomic, or not worth splitting: move it to a fresh page. If it cannot fit
    // on an empty page either, place it anyway — overflowing beats looping.
    if (items.length) {
      flush()
      queue.unshift(block)
    } else {
      place(piece, block.id)
      flush()
    }
  }

  if (items.length || !pages.length) flush()
  return { pages, blockPage }
}

/**
 * Typeset a section, honouring its overrides.
 *
 * Pinned elements create a circularity: a pin's page depends on where its anchor
 * block landed, and where blocks land depends on the space a pin takes up.
 * Resolved by bounded iteration, the way InDesign and TeX's page builder do —
 * flow unobstructed, resolve the pins, re-flow with those obstructions, and stop
 * when the assignment stops changing or after {@link MAX_PASSES}. Freezing on
 * non-convergence is deterministic, which matters more than being optimal.
 */
const MAX_PASSES = 3

export function flowSection(
  section: FlowSection,
  deck: Deck,
  metrics: CanvasRenderingContext2D,
  assets: RenderAssets,
  opts: FlowOptions = {},
): RenderPage[] {
  const overrides = section.overrides ?? []
  const format = getFormat(deck.format)
  const g = grid(format.w, format.h, format.cols, format.rows, format.margin * format.w)

  let pass = flowPass(section, deck, metrics, assets, opts, [])
  if (!overrides.length) return pass.pages

  const pinsOf = (p: Pass): { ov: Override; page: number }[] =>
    overrides.flatMap((ov) => {
      const page =
        ov.anchor.at === 'ordinal' ? ov.anchor.ordinal : p.blockPage.get(ov.anchor.blockId)
      return page === undefined || page < 0 ? [] : [{ ov, page }]
    })

  let resolved = pinsOf(pass)
  for (let i = 1; i < MAX_PASSES; i++) {
    const obstructions = resolved.flatMap(({ ov, page }) => {
      if (ov.kind !== 'pin' || ov.obstruct !== 'band') return []
      const r = g.rect(ov.element.box)
      return [{ page, top: r.y, bottom: r.y + r.h }]
    })
    const next = flowPass(section, deck, metrics, assets, opts, obstructions)
    const nextResolved = pinsOf(next)
    const stable =
      nextResolved.length === resolved.length &&
      nextResolved.every((r, j) => r.page === resolved[j].page)
    pass = next
    resolved = nextResolved
    if (stable) break
  }

  // Apply the resolved overrides onto their pages.
  for (const { ov, page } of resolved) {
    const target = pass.pages[Math.min(page, pass.pages.length - 1)]
    if (!target) continue
    if (ov.kind === 'pin') {
      target.items = [...target.items, { kind: 'boxed', el: ov.element, source: 'pinned' }]
    } else if (ov.paletteId) {
      const from = ov.scope === 'from' ? page : -1
      for (const [i, pg] of pass.pages.entries()) {
        if (i === page || (from >= 0 && i >= from)) pg.paletteId = ov.paletteId
      }
    }
  }

  return pass.pages
}

/**
 * Overrides that no longer resolve to a page — their anchor block is gone.
 *
 * Surfaced in the UI rather than deleted. See `doc/overrides.ts`.
 */
export function orphanedOverrides(
  section: FlowSection,
  deck: Deck,
  metrics: CanvasRenderingContext2D,
  assets: RenderAssets,
  opts: FlowOptions = {},
): Override[] {
  const overrides = section.overrides ?? []
  if (!overrides.length) return []
  const { blockPage } = flowPass(section, deck, metrics, assets, opts, [])
  return overrides.filter(
    (ov) => ov.anchor.at === 'block' && blockPage.get(ov.anchor.blockId) === undefined,
  )
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
  lang: Lang,
): RenderItem[] {
  const margin = MARGIN * format.w
  const headSize = env.shortEdge * typeStepFor(format, TYPE.runningHead.step)
  const ruleH = Math.max(1, format.w / 1190)

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

  return [
    text('runhead', t(section.title, lang).toUpperCase(), 'left', margin),
    text('folio', String(folio), 'right', margin),
    rule('rule-top', margin + headSize * 1.4),
    rule('rule-bottom', format.h - margin),
  ]
}
