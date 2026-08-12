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
function paintBlock(env: LeafEnv, block: Block, box: Rect): number {
  const { ctx, sheet } = env

  switch (block.kind) {
    case 'heading': {
      const style = styleFor(TYPE.chapterTitle)
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w), box)
    }

    case 'deck': {
      const style = styleFor(TYPE.chapterDeck)
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w), box)
    }

    case 'sectionHeading': {
      const style = styleFor(TYPE.sectionHeading)
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w), box)
    }

    case 'para': {
      const style = bodyStyle(env, block.size ? { size: BODY_SIZE[block.size] } : {})
      const indent = block.indent === false ? 0 : sheet.pt(BODY_INDENT)
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, indent), box, indent)
    }

    case 'quote': {
      const style = bodyStyle(env, {
        size: BODY_SIZE.m,
        lineHeight: SET_TEXT.lineHeight,
        tracking: SET_TEXT.tracking,
      })
      applyFont(ctx, sheet, style)
      let h = drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w), box)
      if (block.attribution) {
        const attr = styleFor(TYPE.caption, { alpha: 'muted' })
        applyFont(ctx, sheet, attr)
        h += sheet.pt(GAP.tight)
        h += drawLines(ctx, sheet, attr, wrapText(ctx, `— ${text(env, block.attribution)}`, box.w), {
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
      drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w), { ...box, y: labelY })
      const h = sheet.pt(23.2)
      rule(env, box, box.y + h)
      return h + top
    }

    case 'rule':
      return rule(env, box, box.y)

    case 'spacer':
      return sheet.pt(block.height)

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
        h += drawLines(ctx, sheet, note, wrapText(ctx, text(env, block.note), box.w), {
          ...box,
          y: box.y + h,
        })
      }
      return h
    }

    case 'quoteOverlay': {
      const style = styleFor(TYPE.quoteOverlay, { align: 'center' })
      applyFont(ctx, sheet, style)
      const lines = wrapText(ctx, text(env, block.text), box.w)
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
        y += rule(env, box, y)
        y += sheet.pt(GAP.tight)
        applyFont(ctx, sheet, term)
        const termH = drawLines(ctx, sheet, term, wrapText(ctx, text(env, row.term), termW), {
          x: box.x,
          y,
          w: termW,
          h: 0,
        })
        applyFont(ctx, sheet, def)
        const defH = drawLines(ctx, sheet, def, wrapText(ctx, text(env, row.def), defW), {
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
          y += drawLines(ctx, sheet, style, wrapText(ctx, text(env, item), colW - indent), {
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
        const lines = wrapText(ctx, text(env, block.caption), w)
        const capBox = { ...box, y: box.y + used }
        drawSwash(ctx, swashRects(ctx, sheet, style, lines, capBox), swashFor(env.leaf.surface))
        used += drawLines(ctx, sheet, style, lines, capBox)
      }
      return used
    }

    case 'chart': {
      const max = block.max ?? Math.max(...block.series.map((s) => s.value), 1)
      const full = sheet.pt(CHART.barFull)
      const barH = sheet.pt(CHART.barHeight)
      const gutter = sheet.pt(CHART.gutter)
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
        y += barH + (i < block.series.length - 1 ? sheet.pt(CHART.rowGap) : 0)
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

    case 'text': {
      const role = typeRole(block.role)
      const style = styleFor(role, {
        alpha: block.alpha ?? role.alpha ?? 'body',
        align: block.align ?? 'left',
      })
      applyFont(ctx, sheet, style)
      return drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w), box)
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

/** Stack every block down the content column. */
export function paintBlocks(env: LeafEnv): { placed: PlacedBlock[]; overflow: boolean } {
  const { sheet } = env
  const placed: PlacedBlock[] = []
  let y = env.leaf.bare ? sheet.pt(MARGIN) : sheet.pt(CONTENT_TOP)

  env.leaf.blocks.forEach((block, i) => {
    if (i > 0) y += sheet.pt(GAP.block)
    const box = boxFor(env, block, y)
    const h = paintBlock(env, block, box)
    placed.push({ block, rect: { ...box, h } })
    y += h
  })

  return { placed, overflow: y > sheet.pt(CONTENT_BOTTOM) }
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
  const heights: number[] = []
  let y = env.leaf.bare ? env.sheet.pt(MARGIN) : env.sheet.pt(CONTENT_TOP)
  for (const block of env.leaf.blocks) {
    const box = boxFor(env, block, y)
    const h = paintBlock(env, block, box)
    heights.push(h)
    y += h + env.sheet.pt(GAP.block)
  }
  return heights
}
