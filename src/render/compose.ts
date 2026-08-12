import type { Rect } from './types'
import type { ImageRef } from '../doc/imageStore'
import {
  BODY_INDENT,
  BODY_SIZE,
  CHART,
  CHART_COLORS,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  FOOT_RULE_Y,
  GAP,
  HEAD_RULE_Y,
  MARGIN,
  PAGE_H,
  RULE_WEIGHT,
  RUNNING_HEAD_Y,
  RUNNING_TEXT,
  SET_TEXT,
  SPREAD_W,
  SURFACES,
  TYPE,
  ink,
  swashFor,
  typeRole,
} from '../config/brand'
import type { Block } from '../doc/blocks'
import type { Deck, Leaf } from '../doc/types'
import { t as resolve, type Lang } from '../doc/localized'
import {
  drawInline,
  inlineBaseline,
  inlineSwashRects,
  layoutInline,
  type Segment,
} from './inline'
import { createRecorder } from './record'
import { measureCtx } from './measureCtx'
import type { Sheet } from './sheet'
import {
  applyFont,
  drawLines,
  drawSwash,
  fitSize,
  lineAdvance,
  styleFor,
  swashRects,
  wrapText,
  type TextStyle,
} from './text'

/**
 * Composition: stacking blocks down a leaf and painting them.
 *
 * ## One pass, not two
 *
 * Each painter draws its block and returns the height it used, and the stacker
 * advances by that. There is deliberately no separate measure pass: a measure
 * that disagreed with the paint would put the rest of the page in the wrong
 * place, and keeping two implementations honest is exactly the problem
 * `render/record.ts` exists to avoid. When a height is needed *without* pixels —
 * pagination, overflow checks — the same painters run against a recorder and the
 * ops are discarded. See {@link measureBlocks}.
 */

export interface RenderAssets {
  image(ref: ImageRef | null): HTMLImageElement | null
  overlays: Record<string, HTMLImageElement | null>
}

export interface LeafEnv {
  ctx: CanvasRenderingContext2D
  sheet: Sheet
  leaf: Leaf
  deck: Deck
  lang: Lang
  assets: RenderAssets
  /** Thumbnails skip the overlays: sub-pixel grain costs real work to be invisible. */
  quality: 'full' | 'thumb'
  /** Printed folio, or null on covers and bare plates. */
  folio: number | null
}

export interface PlacedBlock {
  block: Block
  rect: Rect
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const boxFor = (env: LeafEnv, block: Block, y: number): Rect => ({
  x: env.sheet.colX(block.col ?? 0),
  y,
  w: env.sheet.colSpan(block.span ?? env.sheet.cols - (block.col ?? 0)),
  h: 0,
})

const bodyStyle = (env: LeafEnv, over: Partial<TextStyle> = {}): TextStyle => ({
  voice: 'text',
  size: BODY_SIZE[env.leaf.bodySize],
  lineHeight: RUNNING_TEXT.lineHeight,
  tracking: RUNNING_TEXT.tracking,
  alpha: 'body',
  align: 'left',
  ...over,
})

const text = (env: LeafEnv, t: Parameters<typeof resolve>[0]): string => resolve(t, env.lang)

/** A hairline at `y`, spanning the box. */
function rule(env: LeafEnv, box: Rect, y: number): number {
  const h = Math.max(1, env.sheet.pt(RULE_WEIGHT))
  env.ctx.save()
  env.ctx.fillStyle = ink('body')
  env.ctx.fillRect(box.x, y, box.w, h)
  env.ctx.restore()
  return h
}

/** Cover-fit an image into a rect around a focal point. */
function drawImage(env: LeafEnv, img: HTMLImageElement | null, r: Rect, focus = { x: 0.5, y: 0.5 }): void {
  if (!img || !img.width || !img.height) {
    // A placeholder rather than nothing: an un-decoded image that painted
    // invisibly would look like a layout bug rather than a missing asset.
    env.ctx.save()
    env.ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
    env.ctx.fillRect(r.x, r.y, r.w, r.h)
    env.ctx.restore()
    return
  }
  const scale = Math.max(r.w / img.width, r.h / img.height)
  const w = img.width * scale
  const h = img.height * scale
  const x = r.x + (r.w - w) * focus.x
  const y = r.y + (r.h - h) * focus.y
  env.ctx.save()
  env.ctx.beginPath()
  env.ctx.rect(r.x, r.y, r.w, r.h)
  env.ctx.clip()
  env.ctx.drawImage(img, x, y, w, h)
  env.ctx.restore()
}

// ---------------------------------------------------------------------------
// Block painters
// ---------------------------------------------------------------------------

/**
 * Paint one block into `box` and return the height it used.
 *
 * Every painter is responsible for its own internal spacing and nothing else —
 * the gap *between* blocks belongs to the stacker.
 */
interface PaintOpts {
  /** This block opens the page and hangs off the running-head rule. */
  hangs?: boolean
  /**
   * Height left on the leaf below this block's top, in pixels.
   *
   * Only the chart uses it, and only to shrink. Most blocks must *not* respond
   * to it — a paragraph that reflowed to fit the space left would silently
   * change its type size depending on what happened to sit above it.
   */
  avail?: number
  /** Height awarded to a `'fill'` spacer. */
  fill?: number
}

function paintBlock(env: LeafEnv, block: Block, box: Rect, opts: PaintOpts = {}): number {
  const { ctx, sheet } = env

  switch (block.kind) {
    case 'heading': {
      const style = styleFor(TYPE.chapterTitle)
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, 0, style), box)
    }

    case 'deck': {
      const style = styleFor(TYPE.chapterDeck)
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, 0, style), box)
    }

    case 'sectionHeading': {
      const style = styleFor(TYPE.sectionHeading)
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, 0, style), box)
    }

    case 'para': {
      const style = bodyStyle(env, block.size ? { size: BODY_SIZE[block.size] } : {})
      const indent = block.indent === false ? 0 : sheet.pt(BODY_INDENT)
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, indent, style), box, indent)
    }

    case 'quote': {
      const style = bodyStyle(env, {
        size: BODY_SIZE.m,
        lineHeight: SET_TEXT.lineHeight,
        tracking: SET_TEXT.tracking,
      })
      applyFont(ctx, sheet, style)
      let h = drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, 0, style), box)
      if (block.attribution) {
        const attr = styleFor(TYPE.caption, { alpha: 'muted' })
        applyFont(ctx, sheet, attr)
        h += sheet.pt(GAP.tight)
        h += drawLines(ctx, sheet, attr, wrapText(ctx, `— ${text(env, block.attribution)}`, box.w, 0, attr), {
          ...box,
          y: box.y + h,
        })
      }
      return h
    }

    case 'subhead': {
      // rule / 5.2pt / label / rule, 23.2pt overall — measured on the
      // methodology plate, where three of these divide the page.
      const style = styleFor(TYPE.subhead)
      const top = rule(env, box, box.y)
      const labelY = box.y + sheet.pt(5.2)
      applyFont(ctx, sheet, style)
      drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, 0, style), { ...box, y: labelY })
      const h = sheet.pt(23.2)
      rule(env, box, box.y + h)
      return h + top
    }

    case 'rule':
      return rule(env, box, box.y)

    case 'spacer':
      return block.height === 'fill' ? (opts.fill ?? 0) : sheet.pt(block.height)

    case 'statement': {
      const style = styleFor(TYPE.statement, { alpha: 'strong' })
      const raw = text(env, block.text)
      const segs = splitHighlights(raw, block.highlights ?? [])
      const lines = layoutInline(ctx, sheet, style, segs, box.w)
      const base = inlineBaseline(ctx, sheet, style)
      drawSwash(ctx, inlineSwashRects(sheet, style, lines, box, base), swashFor(env.leaf.surface))
      let h = drawInline(ctx, sheet, style, lines, box, base)
      if (block.note) {
        const note = styleFor(TYPE.statementNote)
        h += sheet.pt(GAP.block)
        applyFont(ctx, sheet, note)
        h += drawLines(ctx, sheet, note, wrapText(ctx, text(env, block.note), box.w, 0, note), {
          ...box,
          y: box.y + h,
        })
      }
      return h
    }

    case 'quoteOverlay': {
      const style = styleFor(TYPE.quoteOverlay, { align: 'center' })
      applyFont(ctx, sheet, style)
      const lines = wrapText(ctx, text(env, block.text), box.w, 0, style)
      drawSwash(ctx, swashRects(ctx, sheet, style, lines, box), swashFor(env.leaf.surface))
      return drawLines(ctx, sheet, style, lines, box)
    }

    case 'defList': {
      const term = styleFor(TYPE.defTerm)
      const def = styleFor(TYPE.defBody)
      // Term in columns 0–2, definition in 5–8: the widest split in the design,
      // and what makes these pages read as a glossary rather than a table.
      const termW = sheet.colSpan(3)
      const defX = sheet.colX(5)
      const defW = sheet.colSpan(4)
      let y = box.y
      block.rows.forEach((row, i) => {
        if (i > 0) y += sheet.pt(GAP.defRow)
        // A list that opens a page hangs off the running-head rule instead of
        // drawing its own — see `hangsFromHeadRule`. Without this the page gets
        // two hairlines 20pt apart and the first term sits low.
        if (i === 0 && opts.hangs) y += sheet.pt(GAP.tight)
        else {
          y += rule(env, box, y)
          y += sheet.pt(GAP.tight)
        }
        applyFont(ctx, sheet, term)
        const termH = drawLines(ctx, sheet, term, wrapText(ctx, text(env, row.term), termW, 0, term), {
          x: box.x,
          y,
          w: termW,
          h: 0,
        })
        applyFont(ctx, sheet, def)
        const defH = drawLines(ctx, sheet, def, wrapText(ctx, text(env, row.def), defW, 0, def), {
          x: defX,
          y,
          w: defW,
          h: 0,
        })
        y += Math.max(termH, defH)
      })
      return y - box.y
    }

    case 'bulletList': {
      const style = bodyStyle(env, { lineHeight: SET_TEXT.lineHeight })
      const cols = block.columns ?? 1
      const colW = cols === 2 ? (box.w - sheet.pt(GAP.block)) / 2 : box.w
      const perCol = Math.ceil(block.items.length / cols)
      const indent = sheet.pt(12)
      let maxH = 0
      for (let c = 0; c < cols; c += 1) {
        let y = box.y
        for (const item of block.items.slice(c * perCol, (c + 1) * perCol)) {
          const x = box.x + c * (colW + sheet.pt(GAP.block))
          applyFont(ctx, sheet, style)
          drawLines(ctx, sheet, style, [{ text: '•', opensPara: true }], { x, y, w: indent, h: 0 })
          y += drawLines(ctx, sheet, style, wrapText(ctx, text(env, item), colW - indent, 0, style), {
            x: x + indent,
            y,
            w: colW - indent,
            h: 0,
          })
        }
        maxH = Math.max(maxH, y - box.y)
      }
      return maxH
    }

    case 'links': {
      const style = styleFor(TYPE.link)
      let y = box.y
      for (const item of block.items) {
        const segs: Segment[] = [{ text: text(env, item.label), underline: true }]
        if (item.note) segs.push({ text: ` ${text(env, item.note)}` })
        const lines = layoutInline(ctx, sheet, style, segs, box.w)
        const base = inlineBaseline(ctx, sheet, style)
        y += drawInline(ctx, sheet, style, lines, { ...box, y }, base)
        y += sheet.pt(GAP.tight)
      }
      return y - box.y - sheet.pt(GAP.tight)
    }

    case 'credits': {
      const style = styleFor(TYPE.credits)
      const advance = lineAdvance(sheet, style)
      let y = box.y
      for (const row of block.rows) {
        applyFont(ctx, sheet, style)
        y += drawLines(
          ctx,
          sheet,
          style,
          [
            { text: text(env, row.label), opensPara: true },
            { text: text(env, row.value), opensPara: false },
          ],
          { ...box, y },
        )
        y += advance * 0.5
      }
      return y - box.y
    }

    case 'figure': {
      const w = box.w
      const h = w * (block.aspect ?? 1.35)
      drawImage(env, env.assets.image(block.imageRef), { x: box.x, y: box.y, w, h }, block.focus)
      let used = h
      if (block.caption) {
        const style = styleFor(TYPE.caption)
        used += sheet.pt(GAP.block)
        applyFont(ctx, sheet, style)
        const lines = wrapText(ctx, text(env, block.caption), w, 0, style)
        const capBox = { ...box, y: box.y + used }
        drawSwash(ctx, swashRects(ctx, sheet, style, lines, capBox), swashFor(env.leaf.surface))
        used += drawLines(ctx, sheet, style, lines, capBox)
      }
      return used
    }

    case 'chart': {
      const max = block.max ?? Math.max(...block.series.map((s) => s.value), 1)
      const full = sheet.pt(CHART.barFull)
      const gutter = sheet.pt(CHART.gutter)
      const rowGap = sheet.pt(CHART.rowGap)
      // Fit the bars to the space left rather than taking the measured 121 come
      // what may. Six bars at 121 plus their gaps is 763pt against a 745pt
      // content band — the file's own chart page overruns its foot rule, and a
      // seventh series would run off the page entirely.
      const n = block.series.length
      const room = (opts.avail ?? Infinity) - rowGap * (n - 1)
      const barH = Math.min(sheet.pt(CHART.barHeight), room / n)
      const num = styleFor(TYPE.statNumber)
      const label = styleFor(TYPE.statLabel)
      let y = box.y
      block.series.forEach((s, i) => {
        const barW = Math.max(1, (s.value / max) * full)
        ctx.save()
        ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length]
        ctx.fillRect(box.x, y, barW, barH)
        ctx.restore()

        const gx = box.x + barW + gutter
        const gw = Math.max(sheet.pt(60), box.x + box.w - gx)
        const value = `${s.value}${block.unit ?? '%'}`
        // Fitted, not set: the file has these at 71.2 and 74.4 on one plate,
        // sized to the digits rather than to a step.
        const size = fitSize(ctx, sheet, num, value, gw, TYPE.statNumber.size)
        const numStyle = { ...num, size }
        const numH = drawLines(ctx, sheet, numStyle, [{ text: value, opensPara: true }], {
          x: gx,
          y: y + sheet.pt(5.6),
          w: gw,
          h: 0,
        })
        let ly = y + sheet.pt(5.6) + numH
        applyFont(ctx, sheet, label)
        ly += drawLines(ctx, sheet, label, [{ text: text(env, s.label), opensPara: true }], {
          x: gx,
          y: ly,
          w: gw,
          h: 0,
        })
        if (s.sublabel) {
          const sub = styleFor(TYPE.statSublabel)
          applyFont(ctx, sheet, sub)
          drawLines(ctx, sheet, sub, [{ text: text(env, s.sublabel), opensPara: true }], {
            x: gx,
            y: ly,
            w: gw,
            h: 0,
          })
        }
        y += barH + (i < n - 1 ? rowGap : 0)
      })
      return y - box.y
    }

    case 'tocEntry': {
      const chapter = styleFor(TYPE.tocChapter)
      const folio = styleFor(TYPE.tocChapterFolio, { align: 'right' })
      const swash = swashFor(env.leaf.surface)
      let y = box.y

      const lines = layoutInline(ctx, sheet, chapter, [{ text: text(env, block.label), swash: true }], box.w)
      const base = inlineBaseline(ctx, sheet, chapter)
      drawSwash(ctx, inlineSwashRects(sheet, chapter, lines, box, base), swash)
      const rowH = drawInline(ctx, sheet, chapter, lines, box, base)
      applyFont(ctx, sheet, folio)
      drawLines(ctx, sheet, folio, [{ text: String(block.folio), opensPara: true }], { ...box, y })
      y += rowH

      for (const s of block.sections ?? []) {
        y += sheet.pt(GAP.toc)
        const style = styleFor(TYPE.tocSection)
        const inset = sheet.colX(0) - sheet.colX(0) + sheet.pt(20)
        const sub: Segment[] = [{ text: text(env, s.label), swash: true }]
        if (s.qualifier) {
          sub.push({ text: ` ${text(env, s.qualifier)}`, swash: true, size: TYPE.tocQualifier.size })
        }
        const subBox = { x: box.x + inset, y, w: box.w - inset, h: 0 }
        const subLines = layoutInline(ctx, sheet, style, sub, subBox.w)
        const subBase = inlineBaseline(ctx, sheet, style)
        drawSwash(ctx, inlineSwashRects(sheet, style, subLines, subBox, subBase), swash)
        const subH = drawInline(ctx, sheet, style, subLines, subBox, subBase)
        // The sub-row folio sits just past the swash, not out at the margin.
        const sf = styleFor(TYPE.tocSectionFolio)
        applyFont(ctx, sheet, sf)
        const swashW = subLines[0]?.width ?? 0
        drawLines(ctx, sheet, sf, [{ text: String(s.folio), opensPara: true }], {
          x: subBox.x + swashW + sheet.pt(5),
          y: y + sheet.pt(2),
          w: sheet.pt(40),
          h: 0,
        })
        y += subH
      }
      return y - box.y
    }

    case 'cover': {
      // Measured off Frame 11375. These are absolute positions on the 1190 ×
      // 842 spread, not a stack — see the note on CoverBlock for why the cover
      // is one component rather than a flow of them.
      const P = sheet.pt
      const title = styleFor(TYPE.coverTitle, { align: 'center' })
      // Margin to margin. The file draws it at x20/w1150, i.e. half a margin
      // proud on each side; squaring it to the 40pt margin costs 3pt of size
      // and puts the cover on the same measure as every other page.
      const titleBox = { x: P(MARGIN), y: P(7.6), w: P(SPREAD_W - MARGIN * 2), h: P(436) }

      // Two lines at 272.8/80% fill 436pt exactly. Fit to the longer line so a
      // retitled cover still spans the spread instead of sitting short.
      const lines = text(env, block.title)
        .toUpperCase()
        .split('\n')
        .map((l) => ({ text: l, opensPara: true }))
      const widest = lines.reduce(
        (acc, l) => {
          applyFont(ctx, sheet, title)
          const w = ctx.measureText(l.text).width
          return w > acc.w ? { text: l.text, w } : acc
        },
        { text: '', w: 0 },
      )
      // 272.8 is the size in the file; here it is only the ceiling, since the
      // title fits itself to the spread.
      const size = fitSize(ctx, sheet, title, widest.text, titleBox.w, 272.8)
      drawLines(ctx, sheet, { ...title, size }, lines, titleBox)

      // The cut-out sits *over* the title — the type is background — and runs
      // off the foot of the page. Drawn at its natural aspect and clipped by
      // the page, as the file has it.
      //
      // It keeps its alpha, which is the whole point: the title reads through
      // the gaps around the shape. Do not swap this asset for a JPEG.
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, 0, sheet.w, P(PAGE_H))
      ctx.clip()
      const img = env.assets.image(block.imageRef)
      const ir = { x: P(100.7), y: P(345.2), w: P(896.2), h: P(824.1) }
      if (img && img.width) ctx.drawImage(img, ir.x, ir.y, ir.w, ir.h)
      else {
        // Outlined rather than filled: a solid placeholder here would cover
        // the title and read as "the cover is broken".
        ctx.fillStyle = 'rgba(0, 0, 0, 0.04)'
        ctx.fillRect(ir.x, ir.y, ir.w, ir.h)
      }
      ctx.restore()

      const sub = styleFor(TYPE.coverSubtitle, { align: 'center' })
      const subBox = { x: P(272.3), y: P(569.4), w: P(645.3), h: 0 }
      applyFont(ctx, sheet, sub)
      const subLines = wrapText(ctx, text(env, block.subtitle), subBox.w, 0, sub)
      drawSwash(ctx, swashRects(ctx, sheet, sub, subLines, subBox), SURFACES.pink)
      drawLines(ctx, sheet, sub, subLines, subBox)

      if (block.wordmark) {
        const mark = styleFor(TYPE.wordmark, { align: 'center' })
        const box = { x: P(539.9), y: P(816.7), w: P(110.1), h: P(25.3) }
        ctx.save()
        ctx.fillStyle = SURFACES.pink
        ctx.fillRect(box.x, box.y, box.w, box.h)
        ctx.restore()
        applyFont(ctx, sheet, mark)
        // Optically centred in the chip rather than sat on its line box: the
        // wordmark is set at 50% leading, so its line box is half its height.
        drawLines(ctx, sheet, mark, [{ text: text(env, block.wordmark), opensPara: true }], {
          ...box,
          y: box.y + P(4.3),
        })
      }
      return P(PAGE_H) - box.y
    }

    case 'text': {
      const role = typeRole(block.role)
      const style = styleFor(role, {
        alpha: block.alpha ?? role.alpha ?? 'body',
        align: block.align ?? 'left',
      })
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, 0, style), box)
    }
  }
}

/**
 * Split a statement into highlighted and plain segments.
 *
 * Matching is by literal phrase, in the order given, each used once. A phrase
 * that isn't found is skipped rather than throwing: highlights are decoration,
 * and losing one should not stop the page rendering.
 */
function splitHighlights(raw: string, highlights: string[]): Segment[] {
  const segs: Segment[] = []
  let rest = raw
  for (const phrase of highlights) {
    const at = rest.indexOf(phrase)
    if (at < 0) continue
    if (at > 0) segs.push({ text: rest.slice(0, at) })
    segs.push({ text: phrase, swash: true, alpha: 'body' })
    rest = rest.slice(at + phrase.length)
  }
  if (rest) segs.push({ text: rest })
  return segs.length ? segs : [{ text: raw }]
}

// ---------------------------------------------------------------------------
// Leaf
// ---------------------------------------------------------------------------

/**
 * Blocks that draw their own leading rule, and so should hang off the
 * running-head rule when they open a page rather than doubling it.
 *
 * The file does this on every definition-list page that has no intro
 * paragraph: the first term sits 5pt under the head rule at y42, and the row's
 * own hairline is simply absent. Drawing both would put two rules 20pt apart.
 */
const hangsFromHeadRule = (block: Block): boolean => block.kind === 'defList'

/** Run the stack once, painting into `env.ctx`. */
function stack(env: LeafEnv, fill: number): { placed: PlacedBlock[]; end: number } {
  const { sheet } = env
  const placed: PlacedBlock[] = []
  const first = env.leaf.blocks[0]
  const hangs = !env.leaf.bare && !!first && hangsFromHeadRule(first)

  let y = env.leaf.bare
    ? sheet.pt(MARGIN)
    : hangs
      ? sheet.pt(HEAD_RULE_Y + RULE_WEIGHT)
      : sheet.pt(CONTENT_TOP)

  env.leaf.blocks.forEach((block, i) => {
    if (i > 0) y += sheet.pt(GAP.block)
    const box = boxFor(env, block, y)
    const h = paintBlock(env, block, box, {
      hangs: i === 0 && hangs,
      avail: sheet.pt(CONTENT_BOTTOM) - y,
      fill,
    })
    placed.push({ block, rect: { ...box, h } })
    y += h
  })

  return { placed, end: y }
}

/**
 * Stack every block down the content column.
 *
 * When the leaf has `'fill'` spacers the stack runs twice: once against a
 * recorder with the fills at zero to find out how much room the real content
 * needs, then for real with the remainder shared out. The probe uses the same
 * painters, so what it measures and what gets painted cannot disagree — the one
 * thing this module is built to guarantee.
 */
export function paintBlocks(env: LeafEnv): { placed: PlacedBlock[]; overflow: boolean } {
  const { sheet } = env
  const fills = env.leaf.blocks.filter((b) => b.kind === 'spacer' && b.height === 'fill').length

  let fill = 0
  if (fills > 0) {
    const probe = createRecorder(measureCtx())
    const { end } = stack({ ...env, ctx: probe.ctx }, 0)
    fill = Math.max(0, (sheet.pt(CONTENT_BOTTOM) - end) / fills)
  }

  const { placed, end } = stack(env, fill)
  return { placed, overflow: end > sheet.pt(CONTENT_BOTTOM) + 0.5 }
}

/** The page chrome: running head, folio, and the two hairlines. */
export function paintFurniture(env: LeafEnv): void {
  if (env.leaf.bare) return
  const { ctx, sheet, leaf } = env
  const box = { x: sheet.pt(MARGIN), y: 0, w: sheet.colSpan(sheet.cols), h: 0 }

  if (leaf.runningHead) {
    const style = styleFor(TYPE.runningHead)
    applyFont(ctx, sheet, style)
    drawLines(ctx, sheet, style, [{ text: text(env, leaf.runningHead), opensPara: true }], {
      ...box,
      y: sheet.pt(RUNNING_HEAD_Y),
    })
  }
  if (env.folio !== null) {
    const style = styleFor(TYPE.folio, { align: 'right' })
    applyFont(ctx, sheet, style)
    drawLines(ctx, sheet, style, [{ text: String(env.folio), opensPara: true }], {
      ...box,
      y: sheet.pt(RUNNING_HEAD_Y),
    })
  }
  rule(env, box, sheet.pt(HEAD_RULE_Y))
  rule(env, box, sheet.pt(FOOT_RULE_Y))
}

/** Surface colour and any full-bleed plate, both running to the trim. */
export function paintSurface(env: LeafEnv): void {
  const { ctx, sheet, leaf } = env
  ctx.save()
  ctx.fillStyle = SURFACES[leaf.surface]
  ctx.fillRect(0, 0, sheet.w, sheet.pt(PAGE_H))
  ctx.restore()
  if (leaf.plate) {
    drawImage(
      env,
      env.assets.image(leaf.plate.imageRef),
      { x: 0, y: 0, w: sheet.w, h: sheet.pt(PAGE_H) },
      leaf.plate.focus,
    )
  }
}

/**
 * Measure blocks without painting, by running the same painters against a
 * recorder and discarding the ops.
 *
 * This is the only measuring path, which is why a measured height cannot
 * disagree with a painted one.
 */
export function measureBlocks(env: LeafEnv): number[] {
  // Deliberately delegates rather than re-walking the stack: a second copy of
  // the advance arithmetic is exactly the drift this module is built to avoid,
  // and it had already diverged over the hanging first rule.
  return paintBlocks(env).placed.map((p) => p.rect.h)
}
