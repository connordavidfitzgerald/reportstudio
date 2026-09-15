import type { Rect } from './types'
import type { ImageRef } from '../doc/imageRef'
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
import { deriveContents, runningHeadOf } from '../doc/types'
import { t as resolve, type Lang } from '../doc/localized'
import { markKey, marksAt, toSegments } from '../doc/marks'
import {
  drawInline,
  inlineBaseline,
  inlineLinkRects,
  inlineSwashRects,
  layoutInline,
  segmentRect,
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
  /** The Le HUB wordmark drawn on the cover; null until the SVG has decoded. */
  wordmark: HTMLImageElement | null
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
  /**
   * Set only by the interactive canvas, to gather {@link TextRegion}s as the
   * page is painted. Left undefined everywhere else — thumbnails, the overflow
   * probe and the PDF export all paint the same pages many times over and none
   * of them has a caret to place.
   */
  collect?: (region: TextRegion) => void
  /**
   * Set only by the PDF exporter, to gather the boxes of linked runs.
   *
   * A separate collector rather than a new draw op: the recorder
   * (`render/record.ts`) implements the canvas members the painters use and
   * throws on anything else *by design*, and a link is not something a canvas
   * can draw. This is the same seam `collect` uses for text regions.
   */
  collectLink?: (link: { href: string; rect: Rect }) => void
}

export interface PlacedBlock {
  block: Block
  rect: Rect
}

/** Where a field lives inside its block, e.g. `['rows', 2, 'term']`. */
export type FieldPath = (string | number)[]

/**
 * One run of words on the page, and where the painter put it.
 *
 * This is what makes the whole document typeable rather than just the blocks
 * that happen to be a single paragraph. A definition list has six of these, a
 * chart has two per bar, the cover has two — and each one carries the box it
 * was drawn in and the style it was drawn with, so a caret can be laid on it
 * exactly.
 *
 * Collected by the painters themselves, as they draw, which is the only way the
 * answer can't drift: there is no second pass working out where the text
 * "probably" went.
 *
 * ## Numbers are regions too
 *
 * This used to say that fields holding numbers — a bar's value, a contents
 * folio — were "deliberately absent", on the grounds that the side panel could
 * validate them as numbers and a canvas could not.
 *
 * That was the wrong trade. The number on a bar chart is the *largest thing on
 * the page*; being unable to touch it, and having to find a spinner in a panel
 * to change the one figure the reader will actually look at, is precisely the
 * kind of detour the panel keeps inventing for itself. Validation is a smaller
 * problem than that, and `InlineEditor` solves it by holding the half-typed
 * text locally and only committing a number when there is one.
 *
 * So numeric fields are marked, and carry {@link numeric} so the editor knows
 * to take digits rather than words.
 */
export interface TextRegion {
  blockId: string
  path: FieldPath
  rect: Rect
  style: TextStyle
  /** First-line indent, in points — like every size in {@link TextStyle}. */
  indent: number
  /** The field holds a number, not words. Typed as digits, stored as a number. */
  numeric?: true
  /**
   * The painter wrapped this run, and will honour a newline in it.
   *
   * Absent on the fields that are drawn as exactly one line — a credit, a bar's
   * label, a contents row — where the text is handed to `drawLines` already
   * "wrapped" into the single line it is. Typing a newline into one of those
   * put a break in the *editor* that the page had no way to draw, so the words
   * stopped agreeing with the caret from that character on: the line you were
   * typing on did not exist on the page. {@link InlineEditor} reads this to know
   * whether Return means a line break or means "done".
   */
  multiline?: true
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

const bodyStyle = (leaf: Leaf, over: Partial<TextStyle> = {}): TextStyle => ({
  voice: 'text',
  size: BODY_SIZE[leaf.bodySize],
  lineHeight: RUNNING_TEXT.lineHeight,
  tracking: RUNNING_TEXT.tracking,
  alpha: 'body',
  align: 'left',
  ...over,
})

/**
 * How a block's main run of words is set, for the components that have one.
 *
 * One table rather than the same `styleFor(TYPE.x)` expression written out in
 * each painter, so there is a single place that decides what a chapter title or
 * a pull quote *is*. The blocks with several runs — a list, a chart, the cover —
 * return null here and set their own styles inline, because there is no "main"
 * run to name.
 *
 * `indent` is in points, like everything in {@link TextStyle}; the caller
 * converts through its own sheet.
 */
function editableStyle(
  leaf: Leaf,
  block: Block,
): { style: TextStyle; indent: number } | null {
  const found = editableStyleFor(leaf, block)
  if (!found || !block.voice || block.voice === found.style.voice) return found
  // The voice override. Case travels with it because the display face is only
  // ever set in caps in this design (`config/brand.ts`) — switching a paragraph
  // to display and leaving it mixed-case reads as a bug, not as a choice.
  return {
    ...found,
    style: {
      ...found.style,
      voice: block.voice,
      case: block.voice === 'display' ? 'upper' : undefined,
    },
  }
}

/** The style a block's kind implies, before any per-block override. */
function editableStyleFor(
  leaf: Leaf,
  block: Block,
): { style: TextStyle; indent: number } | null {
  switch (block.kind) {
    case 'heading':
      return { style: styleFor(TYPE.chapterTitle), indent: 0 }
    case 'deck':
      return { style: styleFor(TYPE.chapterDeck), indent: 0 }
    case 'sectionHeading':
      return { style: styleFor(TYPE.sectionHeading), indent: 0 }
    case 'subhead':
      return { style: styleFor(TYPE.subhead), indent: 0 }
    case 'para':
      return {
        style: bodyStyle(leaf, block.size ? { size: BODY_SIZE[block.size] } : {}),
        // Opt-in, not opt-out. See the note on `ParaBlock`.
        indent: block.indent ? BODY_INDENT : 0,
      }
    case 'quote':
      return {
        style: bodyStyle(leaf, {
          size: BODY_SIZE.m,
          lineHeight: SET_TEXT.lineHeight,
          tracking: SET_TEXT.tracking,
        }),
        indent: 0,
      }
    case 'band':
      return {
        style: bodyStyle(leaf, {
          size: BODY_SIZE[block.size ?? 'm'],
          lineHeight: SET_TEXT.lineHeight,
          tracking: SET_TEXT.tracking,
        }),
        indent: 0,
      }
    case 'statement':
      return { style: styleFor(TYPE.statement, { alpha: 'strong' }), indent: 0 }
    case 'quoteOverlay':
      return { style: styleFor(TYPE.quoteOverlay, { align: 'center' }), indent: 0 }
    case 'text': {
      const role = typeRole(block.role)
      return {
        style: styleFor(role, {
          alpha: block.alpha ?? role.alpha ?? 'body',
          align: block.align ?? 'left',
        }),
        indent: 0,
      }
    }
    default:
      return null
  }
}

/**
 * Does this block have a main run of words at all?
 *
 * Exported for the canvas toolbar, so "is this a text component" is answered by
 * the same table that decides how its text is set rather than by a second list
 * of kinds that would drift from it.
 */
export const hasRunStyle = (leaf: Leaf, block: Block): boolean =>
  editableStyle(leaf, block) !== null

/** The same, for a painter that already knows the block has one. */
const runStyle = (env: LeafEnv, block: Block): TextStyle =>
  editableStyle(env.leaf, block)!.style

/**
 * Record that `path` was just drawn into `rect`.
 *
 * Called from the painters right where the words land, so the region and the
 * ink come from the same expression. A no-op unless something asked to collect.
 */
function mark(
  env: LeafEnv,
  block: Block,
  path: FieldPath,
  rect: Rect,
  style: TextStyle,
  opts: { indent?: number; numeric?: boolean; multiline?: boolean } = {},
): void {
  env.collect?.({
    blockId: block.id,
    path,
    rect,
    style,
    indent: opts.indent ?? 0,
    ...(opts.numeric ? { numeric: true } : {}),
    ...(opts.multiline ? { multiline: true } : {}),
  })
}

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

/**
 * Draw an image into a rect.
 *
 * `cover` fills the rect and crops the overflow — right for a photograph in a
 * frame, where the frame's proportions are the design. `contain` fits the whole
 * image inside and centres it, which is what a cut-out needs: cropping a
 * silhouette just lops a piece off it.
 */
function drawImage(
  env: LeafEnv,
  img: HTMLImageElement | null,
  r: Rect,
  focus = { x: 0.5, y: 0.5 },
  fit: 'cover' | 'contain' = 'cover',
): void {
  if (!img || !img.width || !img.height) {
    // A placeholder rather than nothing: an un-decoded image that painted
    // invisibly would look like a layout bug rather than a missing asset.
    env.ctx.save()
    env.ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
    env.ctx.fillRect(r.x, r.y, r.w, r.h)
    env.ctx.restore()
    return
  }
  const scale =
    fit === 'contain'
      ? Math.min(r.w / img.width, r.h / img.height)
      : Math.max(r.w / img.width, r.h / img.height)
  const w = img.width * scale
  const h = img.height * scale
  // A contained image is centred; a covered one is positioned by its focal
  // point, which is what decides which part of it survives the crop.
  const at = fit === 'contain' ? { x: 0.5, y: 0.5 } : focus
  const x = r.x + (r.w - w) * at.x
  const y = r.y + (r.h - h) * at.y
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

/**
 * Paint one field's words, honouring any marks on it, and report where they went.
 *
 * The two paths are deliberately not unified. With no marks, this is exactly the
 * `wrapText` + `drawLines` expression the painters used before rich text existed
 * — the same calls in the same order — so an unmarked document produces a
 * byte-identical op list and therefore a byte-identical PDF. That equality is
 * asserted by `scripts/check-editing.mjs` and is the reason marks could be added
 * to a transcription of a real report without re-checking every page of it.
 *
 * With marks, the field becomes segments and flows through the inline painter,
 * which already knew how to set a line out of runs that don't match. **The
 * reported region is the same either way**: marks change the ink inside a field,
 * not the box it occupies, so the caret needs to know nothing about them.
 */
function paintRun(
  env: LeafEnv,
  block: Block,
  path: FieldPath,
  raw: string,
  box: Rect,
  style: TextStyle,
  /** First-line indent, in points. */
  indentPt = 0,
): number {
  const { ctx, sheet } = env
  const indent = sheet.pt(indentPt)
  const marks = marksAt(block.marks, markKey(path), env.lang)
  applyFont(ctx, sheet, style)

  let h: number
  if (!marks?.length) {
    h = drawLines(ctx, sheet, style, wrapText(ctx, raw, box.w, indent, style), box, indent)
  } else {
    const segments: Segment[] = toSegments(raw, marks).map((seg) => ({
      text: seg.text,
      bold: seg.b,
      italic: seg.i,
      // A link is underlined whether or not it was also marked as underlined.
      // The file's own resources rows are set that way, and a link you cannot
      // see is one nobody clicks.
      underline: seg.u || seg.href !== undefined,
      href: seg.href,
      swash: seg.h,
      // Highlighted words sit a step softer than their surroundings. On a
      // statement the run is set at `strong` and the pink words at `body`,
      // which is how the file has it — full-strength ink on a saturated bar
      // reads as heavier than the words either side of it, not lighter.
      alpha: seg.h ? 'body' : undefined,
    }))
    const lines = layoutInline(ctx, sheet, style, segments, box.w, { indent })
    const { base, metrics } = inlineBaseline(ctx, sheet, style)
    if (segments.some((seg) => seg.swash)) {
      drawSwash(
        ctx,
        inlineSwashRects(sheet, style, lines, box, base, metrics),
        swashFor(env.leaf.surface),
      )
    }
    h = drawInline(ctx, sheet, style, lines, box, base)
    if (env.collectLink) {
      for (const link of inlineLinkRects(sheet, style, lines, box)) env.collectLink(link)
    }
  }
  mark(env, block, path, { ...box, h }, style, { indent: indentPt, multiline: true })
  return h
}

/**
 * One chapter of a contents page: the chapter on a swash, its folio, its rows.
 *
 * Shared by the two blocks that draw a contents — `tocEntry`, which is a row
 * somebody placed and typed, and `contents`, which is every row derived from
 * the document. They were one painter and a copy of it for about an hour; the
 * copy is the reason this is a function.
 *
 * `paths` marks the text as editable fields. A derived row has no fields — the
 * words belong to a page's chapter and section, not to this block — so it draws
 * the same ink and offers no caret, which is what stops somebody typing into a
 * contents page and losing it on the next repaint.
 */
function paintTocRow(
  env: LeafEnv,
  block: Block,
  box: Rect,
  row: {
    label: string
    folio: number | null
    sections: { label: string; qualifier?: string; folio: number | null }[]
    paths?: boolean
  },
): number {
  const { ctx, sheet } = env
  const chapter = styleFor(TYPE.tocChapter)
  const folio = styleFor(TYPE.tocChapterFolio, { align: 'right' })
  const swash = swashFor(env.leaf.surface)
  let y = box.y

  const lines = layoutInline(ctx, sheet, chapter, [{ text: row.label, swash: true, id: 'label' }], box.w)
  const { base, metrics } = inlineBaseline(ctx, sheet, chapter)
  drawSwash(ctx, inlineSwashRects(sheet, chapter, lines, box, base, metrics), swash)
  const rowH = drawInline(ctx, sheet, chapter, lines, box, base)
  if (row.paths) mark(env, block, ['label'], { ...box, h: rowH }, chapter, { multiline: true })
  if (row.folio !== null) {
    applyFont(ctx, sheet, folio)
    drawLines(ctx, sheet, folio, [{ text: String(row.folio), opensPara: true }], { ...box, y })
  }
  y += rowH

  row.sections.forEach((s, si) => {
    y += sheet.pt(GAP.toc)
    const style = styleFor(TYPE.tocSection)
    const inset = sheet.pt(20)
    const sub: Segment[] = [{ text: s.label, swash: true, id: 'label' }]
    if (s.qualifier) {
      sub.push({ text: ` ${s.qualifier}`, swash: true, size: TYPE.tocQualifier.size, id: 'qualifier' })
    }
    const subBox = { x: box.x + inset, y, w: box.w - inset, h: 0 }
    const subLines = layoutInline(ctx, sheet, style, sub, subBox.w)
    const { base: subBase, metrics: subMetrics } = inlineBaseline(ctx, sheet, style)
    drawSwash(ctx, inlineSwashRects(sheet, style, subLines, subBox, subBase, subMetrics), swash)
    const subH = drawInline(ctx, sheet, style, subLines, subBox, subBase)
    // The sub-row folio sits just past the swash, not out at the margin.
    if (s.folio !== null) {
      const sf = styleFor(TYPE.tocSectionFolio)
      applyFont(ctx, sheet, sf)
      drawLines(ctx, sheet, sf, [{ text: String(s.folio), opensPara: true }], {
        x: subBox.x + (subLines[0]?.width ?? 0) + sheet.pt(5),
        y: y + sheet.pt(2),
        w: sheet.pt(40),
        h: 0,
      })
    }
    if (row.paths) {
      for (const key of ['label', 'qualifier'] as const) {
        const at = segmentRect(sheet, style, subLines, subBox, key)
        if (at) mark(env, block, ['sections', si, key], at, style, { multiline: true })
      }
    }
    y += subH
  })

  return y - box.y
}

/**
 * Share out a table's columns over the grid columns its block occupies.
 *
 * `TableBlock.widths` are shares rather than spans (see the note on the type),
 * so this is where they become geometry — and it is the only place, which is
 * what keeps a table on the grid however its block has been resized.
 *
 * Whole grid columns are allocated largest-remainder: each table column gets
 * its share rounded down, and the leftovers go to the columns that were cut
 * most by the rounding. Every column gets at least one, so a three-column table
 * in a two-column block cannot allocate — and then, rather than drawing a table
 * with a column of zero width, it falls back to dividing the box evenly and
 * accepts being off the grid. A narrow table that is readable beats a correct
 * one that is invisible.
 */
export function tableColumns(
  block: Block & { kind: 'table' },
  sheet: Sheet,
  box: Rect,
): { x: number; w: number }[] {
  const n = block.widths.length
  const span = block.span ?? sheet.cols - (block.col ?? 0)
  const col0 = block.col ?? 0

  if (n > span) {
    const w = box.w / n
    return Array.from({ length: n }, (_, i) => ({ x: box.x + i * w, w }))
  }

  const total = block.widths.reduce((a, b) => a + Math.max(0, b), 0) || n
  const exact = block.widths.map((v) => (Math.max(0, v) / total) * span)

  // Floor first, *without* a minimum. Flooring can only ever under-allocate, so
  // there is always a remainder to hand out and never an overflow to claw back
  // — which is what a `Math.max(1, …)` here would silently cause for a share of
  // zero, by taking a column the ratio never gave it.
  const counts = exact.map((v) => Math.floor(v))
  let left = span - counts.reduce((a, b) => a + b, 0)
  // Largest remainder: the column cut most by the floor is served first, so the
  // widths stay as close to the ratio as whole columns allow.
  while (left > 0) {
    let best = 0
    for (let i = 1; i < n; i += 1) {
      if (exact[i] - counts[i] > exact[best] - counts[best]) best = i
    }
    counts[best] += 1
    left -= 1
  }

  // Only now give every column its minimum, by taking from the widest. `n <= span`
  // at this point, so there is always a column with more than one to take from.
  for (let i = 0; i < n; i += 1) {
    if (counts[i] > 0) continue
    let widest = 0
    for (let j = 1; j < n; j += 1) if (counts[j] > counts[widest]) widest = j
    counts[widest] -= 1
    counts[i] = 1
  }

  const out: { x: number; w: number }[] = []
  let at = col0
  for (const count of counts) {
    out.push({ x: sheet.colX(at), w: sheet.colSpan(count) })
    at += count
  }
  return out
}

/**
 * Which components accept bold, italic, underline, highlight and links.
 *
 * The prose surface, and not the composed ones: a contents row sets its label
 * and its folio differently on a single line, and threading a second segment
 * model through that would be two systems deciding the same pixels. The toolbar
 * reads this so the controls are disabled rather than silently doing nothing.
 *
 * A statement used to be excluded for the same reason — its words "already flow
 * as segments carrying a swash". That was the argument for keeping two segment
 * models, and the highlight mark collapses them into one: the swash is now what
 * an `h` mark paints, on a statement exactly as anywhere else.
 */
export const supportsMarks = (kind: Block['kind']): boolean =>
  kind === 'heading' ||
  kind === 'deck' ||
  kind === 'sectionHeading' ||
  kind === 'para' ||
  kind === 'quote' ||
  kind === 'statement' ||
  kind === 'text' ||
  kind === 'defList' ||
  kind === 'bulletList' ||
  kind === 'table'

function paintBlock(env: LeafEnv, block: Block, box: Rect, opts: PaintOpts = {}): number {
  const { ctx, sheet } = env

  switch (block.kind) {
    case 'heading':
      return paintRun(env, block, ['text'], text(env, block.text), box, runStyle(env, block))

    case 'deck':
      return paintRun(env, block, ['text'], text(env, block.text), box, runStyle(env, block))

    case 'sectionHeading':
      return paintRun(env, block, ['text'], text(env, block.text), box, runStyle(env, block))

    case 'para': {
      const edit = editableStyle(env.leaf, block)!
      return paintRun(env, block, ['text'], text(env, block.text), box, edit.style, edit.indent)
    }

    case 'quote': {
      const style = runStyle(env, block)
      applyFont(ctx, sheet, style)
      let h = paintRun(env, block, ['text'], text(env, block.text), box, style)
      if (block.attribution) {
        const attr = styleFor(TYPE.caption, { alpha: 'muted' })
        applyFont(ctx, sheet, attr)
        h += sheet.pt(GAP.tight)
        const attrBox = { ...box, y: box.y + h }
        const attrH = drawLines(ctx, sheet, attr, wrapText(ctx, `— ${text(env, block.attribution)}`, box.w, 0, attr), attrBox)
        mark(env, block, ['attribution'], { ...attrBox, h: attrH }, attr, { multiline: true })
        h += attrH
      }
      return h
    }

    case 'subhead': {
      // rule / 5.2pt / label / rule, 23.2pt overall — measured on the
      // methodology plate, where three of these divide the page.
      const style = runStyle(env, block)
      const top = rule(env, box, box.y)
      const labelY = box.y + sheet.pt(5.2)
      applyFont(ctx, sheet, style)
      const labelBox = { ...box, y: labelY }
      const labelH = drawLines(ctx, sheet, style, wrapText(ctx, text(env, block.text), box.w, 0, style), labelBox)
      mark(env, block, ['text'], { ...labelBox, h: labelH }, style, { multiline: true })
      const h = sheet.pt(23.2)
      rule(env, box, box.y + h)
      return h + top
    }

    case 'band': {
      // Runs past the margin to the trim on whichever edges are set to bleed,
      // so the field reads as part of the page rather than as a box on it.
      const bleed = block.bleed ?? 'right'
      const left = bleed === 'left' || bleed === 'both' ? 0 : box.x
      const right =
        bleed === 'right' || bleed === 'both' ? sheet.w : box.x + box.w
      const pad = sheet.pt(block.pad ?? 10)
      const style = runStyle(env, block)
      applyFont(ctx, sheet, style)
      const lines = wrapText(ctx, text(env, block.text), right - left - pad * 2, 0, style)
      const h = lines.length * lineAdvance(sheet, style) + pad * 2
      ctx.save()
      ctx.fillStyle = SURFACES[block.surface]
      ctx.fillRect(left, box.y, right - left, h)
      ctx.restore()
      const textBox = {
        x: left + pad,
        y: box.y + pad,
        w: right - left - pad * 2,
        h: h - pad * 2,
      }
      drawLines(ctx, sheet, style, lines, textBox)
      mark(env, block, ['text'], textBox, style, { multiline: true })
      return h
    }

    case 'rule':
      return rule(env, box, box.y)

    case 'spacer':
      return block.height === 'fill' ? (opts.fill ?? 0) : sheet.pt(block.height)

    case 'statement': {
      // The pink words are `h` marks like any other highlight, so the whole
      // block is just a run of text — see `supportsMarks` above.
      let h = paintRun(env, block, ['text'], text(env, block.text), box, runStyle(env, block))
      if (block.note) {
        const note = styleFor(TYPE.statementNote)
        h += sheet.pt(GAP.block)
        applyFont(ctx, sheet, note)
        const noteBox = { ...box, y: box.y + h }
        const noteH = drawLines(ctx, sheet, note, wrapText(ctx, text(env, block.note), box.w, 0, note), noteBox)
        mark(env, block, ['note'], { ...noteBox, h: noteH }, note, { multiline: true })
        h += noteH
      }
      return h
    }

    case 'quoteOverlay': {
      const style = runStyle(env, block)
      applyFont(ctx, sheet, style)
      const lines = wrapText(ctx, text(env, block.text), box.w, 0, style)
      drawSwash(ctx, swashRects(ctx, sheet, style, lines, box), swashFor(env.leaf.surface))
      const h = drawLines(ctx, sheet, style, lines, box)
      mark(env, block, ['text'], { ...box, h }, style, { multiline: true })
      return h
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
        const termBox = { x: box.x, y, w: termW, h: 0 }
        const termH = paintRun(env, block, ['rows', i, 'term'], text(env, row.term), termBox, term)
        const defBox = { x: defX, y, w: defW, h: 0 }
        const defH = paintRun(env, block, ['rows', i, 'def'], text(env, row.def), defBox, def)
        y += Math.max(termH, defH)
      })
      return y - box.y
    }

    case 'bulletList': {
      const style = bodyStyle(env.leaf, { lineHeight: SET_TEXT.lineHeight })
      const cols = block.columns ?? 1
      // Columns 0–3 and 5–8, the same split the definition list uses — the file
      // sets its second bullet column at x326 against the grid's 330.
      const colW = cols === 2 ? sheet.colSpan(4) : box.w
      const colStep = sheet.colX(5) - sheet.colX(0)
      const perCol = Math.ceil(block.items.length / cols)
      const indent = sheet.pt(12)
      let maxH = 0
      for (let c = 0; c < cols; c += 1) {
        let y = box.y
        block.items.slice(c * perCol, (c + 1) * perCol).forEach((item, j) => {
          const x = box.x + c * colStep
          applyFont(ctx, sheet, style)
          drawLines(ctx, sheet, style, [{ text: '\u2022', opensPara: true }], { x, y, w: indent, h: 0 })
          const itemBox = { x: x + indent, y, w: colW - indent, h: 0 }
          const itemH = paintRun(env, block, ['items', c * perCol + j], text(env, item), itemBox, style)
          y += itemH
        })
        maxH = Math.max(maxH, y - box.y)
      }
      return maxH
    }

    case 'links': {
      const style = styleFor(TYPE.link)
      let y = box.y
      block.items.forEach((item, i) => {
        const segs: Segment[] = [{ text: text(env, item.label), underline: true, id: 'label' }]
        if (item.note) segs.push({ text: ` ${text(env, item.note)}`, id: 'note' })
        const lines = layoutInline(ctx, sheet, style, segs, box.w)
        const { base } = inlineBaseline(ctx, sheet, style)
        const rowBox = { ...box, y }
        y += drawInline(ctx, sheet, style, lines, rowBox, base)
        for (const [id, key] of [['label', 'label'], ['note', 'note']] as const) {
          const at = segmentRect(sheet, style, lines, rowBox, id)
          if (at) mark(env, block, ['items', i, key], at, style, { multiline: true })
        }
        y += sheet.pt(GAP.tight)
      })
      return y - box.y - sheet.pt(GAP.tight)
    }

    case 'credits': {
      const style = styleFor(TYPE.credits)
      const advance = lineAdvance(sheet, style)
      let y = box.y
      block.rows.forEach((row, i) => {
        applyFont(ctx, sheet, style)
        const rowH = drawLines(
          ctx,
          sheet,
          style,
          [
            { text: text(env, row.label), opensPara: true },
            { text: text(env, row.value), opensPara: false },
          ],
          { ...box, y },
        )
        // Two stacked lines, so each field's box is one advance tall.
        mark(env, block, ['rows', i, 'label'], { ...box, y, h: advance }, style)
        mark(env, block, ['rows', i, 'value'], { ...box, y: y + advance, h: advance }, style)
        y += rowH + advance * 0.5
      })
      return y - box.y
    }

    case 'table': {
      const head = styleFor(TYPE.subhead)
      const cell = styleFor(TYPE.defBody)
      const cols = tableColumns(block, sheet, box)
      const pad = sheet.pt(GAP.tight)
      let y = box.y

      block.rows.forEach((row, r) => {
        const isHead = r === 0 && !!block.header
        const style = isHead ? head : cell

        // Every cell is wrapped before any is drawn, because the row is as tall
        // as its tallest cell and the rule under it has to clear all of them.
        applyFont(ctx, sheet, style)
        const wrapped = cols.map((c, i) =>
          wrapText(ctx, text(env, row[i] ?? ''), c.w, 0, style),
        )
        const rowH = Math.max(
          lineAdvance(sheet, style),
          ...wrapped.map((lines) => lines.length * lineAdvance(sheet, style)),
        )

        cols.forEach((c, i) => {
          applyFont(ctx, sheet, style)
          const cellBox = { x: c.x, y: y + pad, w: c.w, h: 0 }
          drawLines(ctx, sheet, style, wrapped[i], cellBox)
          mark(env, block, ['rows', r, i], { ...cellBox, h: rowH }, style, { multiline: true })
        })

        y += rowH + pad * 2
        // A rule under every row but the last: the table is ruled between its
        // rows, not boxed. A box would be a different design, and a heavier one
        // than anything else on these pages.
        if (r < block.rows.length - 1) y += rule(env, box, y)
      })

      return y - box.y
    }

    case 'figure': {
      const w = box.w
      const h = w * (block.aspect ?? 1.35)
      if (block.panel) {
        // A colour field with the image inset on it — the executive-summary
        // globe. The panel takes the block's box; the image is centred inside.
        ctx.save()
        ctx.fillStyle = SURFACES[block.panel]
        ctx.fillRect(box.x, box.y, w, h)
        ctx.restore()
        // Contained, not cropped: what sits on a panel is a cut-out, and the
        // panel is taller than the inset square so the image centres in it —
        // measured at 44pt above and 49pt below on the executive-summary globe.
        const inset = sheet.pt(block.inset ?? 25)
        drawImage(
          env,
          env.assets.image(block.imageRef),
          { x: box.x + inset, y: box.y + inset, w: w - inset * 2, h: h - inset * 2 },
          block.focus,
          'contain',
        )
      } else {
        drawImage(env, env.assets.image(block.imageRef), { x: box.x, y: box.y, w, h }, block.focus)
      }
      let used = h
      if (block.caption) {
        const style = styleFor(TYPE.caption)
        used += sheet.pt(GAP.block)
        applyFont(ctx, sheet, style)
        const lines = wrapText(ctx, text(env, block.caption), w, 0, style)
        const capBox = { ...box, y: box.y + used }
        drawSwash(ctx, swashRects(ctx, sheet, style, lines, capBox), swashFor(env.leaf.surface))
        const capH = drawLines(ctx, sheet, style, lines, capBox)
        mark(env, block, ['caption'], { ...capBox, h: capH }, style, { multiline: true })
        used += capH
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
        const digits = String(s.value)
        const value = `${digits}${block.unit ?? '%'}`
        // Fitted, not set: the file has these at 71.2 and 74.4 on one plate,
        // sized to the digits rather than to a step.
        const size = fitSize(ctx, sheet, num, value, gw, TYPE.statNumber.size)
        const numStyle = { ...num, size }
        const numY = y + sheet.pt(5.6)
        const numH = drawLines(ctx, sheet, numStyle, [{ text: value, opensPara: true }], {
          x: gx,
          y: numY,
          w: gw,
          h: 0,
        })
        // The region covers the digits and *not* the unit. They are drawn as one
        // run because they are set as one, but only the number is a field — put
        // a caret across the whole thing and you could type over the `%`, which
        // is not a value and has nowhere to be stored.
        applyFont(ctx, sheet, numStyle)
        mark(
          env,
          block,
          ['series', i, 'value'],
          { x: gx, y: numY, w: ctx.measureText(digits).width, h: numH },
          numStyle,
          { numeric: true },
        )
        let ly = numY + numH
        applyFont(ctx, sheet, label)
        const labelBox = { x: gx, y: ly, w: gw, h: 0 }
        const labelH = drawLines(ctx, sheet, label, [{ text: text(env, s.label), opensPara: true }], labelBox)
        mark(env, block, ['series', i, 'label'], { ...labelBox, h: labelH }, label)
        ly += labelH
        if (s.sublabel) {
          const sub = styleFor(TYPE.statSublabel)
          applyFont(ctx, sheet, sub)
          const subBox = { x: gx, y: ly, w: gw, h: 0 }
          const subH = drawLines(ctx, sheet, sub, [{ text: text(env, s.sublabel), opensPara: true }], subBox)
          mark(env, block, ['series', i, 'sublabel'], { ...subBox, h: subH }, sub)
        }
        y += barH + (i < n - 1 ? rowGap : 0)
      })
      return y - box.y
    }

    case 'tocEntry':
      // A hand-authored row. `contents` draws the same thing from the document.
      return paintTocRow(env, block, box, {
        label: text(env, block.label),
        folio: block.folio,
        sections: (block.sections ?? []).map((sec) => ({
          label: text(env, sec.label),
          qualifier: sec.qualifier === undefined ? undefined : text(env, sec.qualifier),
          folio: sec.folio,
        })),
        paths: true,
      })

    case 'contents': {
      // Every row, worked out from the leaves — see `deriveContents`. The block
      // itself holds nothing, which is the point: a contents page that stores
      // its own page numbers is a contents page that can be wrong.
      let y = box.y
      deriveContents(env.deck, env.lang).forEach((row, i) => {
        if (i > 0) y += sheet.pt(GAP.toc)
        y += paintTocRow(
          env,
          block,
          { ...box, y },
          { label: row.label, folio: row.folio, sections: row.sections },
        )
      })
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
      const titleStyle = { ...title, size }
      drawLines(ctx, sheet, titleStyle, lines, titleBox)
      // The fitted size, not the nominal 272.8 — the caret has to sit on the
      // type as drawn, and the cover's title is sized to the spread.
      mark(env, block, ['title'], { ...titleBox, h: lines.length * lineAdvance(sheet, titleStyle) }, titleStyle, {
        multiline: true,
      })

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
      const subH = drawLines(ctx, sheet, sub, subLines, subBox)
      mark(env, block, ['subtitle'], { ...subBox, h: subH }, sub, { multiline: true })

      if (block.wordmark) {
        const box = { x: P(539.9), y: P(816.7), w: P(110.1), h: P(25.3) }
        // The chip is painted whether or not the mark is: it is the same pink
        // as the artwork's own field, so it costs nothing, and it means a cover
        // that is still decoding reads as the design rather than as a hole.
        ctx.save()
        ctx.fillStyle = SURFACES.pink
        ctx.fillRect(box.x, box.y, box.w, box.h)
        ctx.restore()

        const logo = env.assets.wordmark
        if (logo && logo.width) {
          // The artwork is 277 × 64, the slot 110.1 × 25.3 — a quarter of a
          // percent apart in aspect, so it is drawn to the measured slot rather
          // than inset inside it.
          ctx.drawImage(logo, box.x, box.y, box.w, box.h)
        } else {
          // Type stands in only for the beat before the SVG decodes. It is not
          // the logo: the file's Review *Black* cut isn't loaded, so this is
          // Condensed Heavy at the same size — see the note on TYPE.wordmark.
          const mark = styleFor(TYPE.wordmark, { align: 'center' })
          applyFont(ctx, sheet, mark)
          // Optically centred in the chip rather than sat on its line box: the
          // wordmark is set at 50% leading, so its line box is half its height.
          drawLines(ctx, sheet, mark, [{ text: text(env, block.wordmark), opensPara: true }], {
            ...box,
            y: box.y + P(4.3),
          })
        }
      }
      return P(PAGE_H) - box.y
    }

    case 'text':
      return paintRun(env, block, ['text'], text(env, block.text), box, runStyle(env, block))
  }
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
function stack(env: LeafEnv, fill: number): { placed: PlacedBlock[]; origin: number; end: number } {
  const { sheet } = env
  const placed: PlacedBlock[] = []
  const first = env.leaf.blocks[0]
  const hangs = !env.leaf.bare && !!first && hangsFromHeadRule(first)

  // Where content starts, measured off the file:
  //   headed leaf          57  (intro, chapter, categories, exec-close, quote)
  //   headed + def-list    43  hangs off the head rule, no rule of its own
  //   no running head      20  no head rule to clear — colophon 23, statement 20
  //   bare plate           20  the caption band and overlay run to the trim
  const y0 = env.leaf.bare || !runningHeadOf(env.leaf)
    ? RUNNING_HEAD_Y
    : hangs
      ? HEAD_RULE_Y + RULE_WEIGHT
      : CONTENT_TOP
  let y = sheet.pt(y0)

  env.leaf.blocks.forEach((block, i) => {
    if (i > 0) y += sheet.pt(GAP.block)
    // A block that has been dragged asks for a top edge, and gets it unless the
    // flow has already carried the stack past it — see `Block.top`. Taking the
    // max rather than the value is the whole of the guarantee: a pinned block
    // can be pushed further down by the one above growing, and can never be
    // pulled up into it.
    if (block.top !== undefined) y = Math.max(y, sheet.pt(block.top))
    const box = boxFor(env, block, y)
    const h = paintBlock(env, block, box, {
      hangs: i === 0 && hangs,
      avail: sheet.pt(CONTENT_BOTTOM) - y,
      fill,
    })
    placed.push({ block, rect: { ...box, h } })
    y += h
  })

  return { placed, origin: sheet.pt(y0), end: y }
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
export function paintBlocks(env: LeafEnv): { placed: PlacedBlock[]; origin: number; overflow: boolean } {
  const { sheet } = env
  // A bare plate has no foot rule to respect: its band and its credit run to
  // the trim, so fills are shared out against the page edge instead.
  const bottom = sheet.pt(env.leaf.bare ? PAGE_H - RUNNING_HEAD_Y : CONTENT_BOTTOM)
  const fills = env.leaf.blocks.filter((b) => b.kind === 'spacer' && b.height === 'fill').length

  let fill = 0
  if (fills > 0) {
    const probe = createRecorder(measureCtx())
    // `collect` is dropped for the probe. It runs the whole stack with the fill
    // spacers at zero purely to find out how much room is left, so every field
    // it "draws" is at a y that nothing will be painted at — collecting those
    // would give the editor two carets per field, one of them in mid-air.
    const { end } = stack({ ...env, ctx: probe.ctx, collect: undefined }, 0)
    fill = Math.max(0, (bottom - end) / fills)
  }

  const { placed, origin, end } = stack(env, fill)
  return { placed, origin, overflow: end > bottom + 0.5 }
}

/**
 * The page chrome: running head, folio, and the two hairlines.
 *
 * A leaf with no running head gets **no head rule** — the colophon and the
 * statement plate are both like that in the file, and drawing a rule with
 * nothing above it reads as a mistake. The foot rule stays either way.
 */
export function paintFurniture(env: LeafEnv): void {
  if (env.leaf.bare) return
  const { ctx, sheet, leaf } = env
  const box = { x: sheet.pt(MARGIN), y: 0, w: sheet.colSpan(sheet.cols), h: 0 }

  const head = runningHeadOf(leaf)
  if (head) {
    const style = styleFor(TYPE.runningHead)
    applyFont(ctx, sheet, style)
    drawLines(ctx, sheet, style, wrapText(ctx, text(env, head), box.w, 0, style), {
      ...box,
      y: sheet.pt(RUNNING_HEAD_Y),
    })
    if (env.folio !== null) {
      const folio = styleFor(TYPE.folio, { align: 'right' })
      applyFont(ctx, sheet, folio)
      drawLines(ctx, sheet, folio, [{ text: String(env.folio), opensPara: true }], {
        ...box,
        y: sheet.pt(RUNNING_HEAD_Y),
      })
    }
    rule(env, box, sheet.pt(HEAD_RULE_Y))
  }
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
    // `inset` holds one edge back to the margin so the paper shows as a strip;
    // the other three still bleed.
    const m = sheet.pt(MARGIN)
    const x = leaf.plate.inset === 'left' ? m : 0
    const right = leaf.plate.inset === 'right' ? sheet.w - m : sheet.w
    drawImage(
      env,
      env.assets.image(leaf.plate.imageRef),
      { x, y: 0, w: right - x, h: sheet.pt(PAGE_H) },
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
