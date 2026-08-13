import { OVERLAYS, PAGE_H, PAGE_W, SPREAD_W } from '../config/brand'
import type { Deck, Leaf } from '../doc/types'
import { folioOf } from '../doc/types'
import { createRecorder, type DrawOp } from './record'
import { leafSheet, spreadSheet } from './sheet'
import {
  paintBlocks,
  paintFurniture,
  paintSurface,
  type LeafEnv,
  type PlacedBlock,
  type RenderAssets,
  type TextRegion,
} from './compose'

/**
 * Painting one leaf.
 *
 * The single painting implementation: {@link renderLeaf} points it at a real
 * canvas and {@link recordLeaf} points it at a recorder. Because both go through
 * `paint`, the PDF cannot disagree with the preview about what is on the page —
 * there is no second copy of this sequence to fall out of step.
 */

export interface LeafOptions {
  quality?: 'full' | 'thumb'
  /** Index into `deck.leaves`, used to derive the folio. */
  index?: number
  /**
   * Gather the editable text regions while painting.
   *
   * Off by default. Only the page you are looking at needs them; the page strip
   * paints forty leaves and the export paints all of them again, and neither
   * has a caret to place.
   */
  regions?: boolean
  /**
   * Gather the boxes of linked runs while painting.
   *
   * Only the PDF exporter wants these: on screen a link is an underline like
   * any other, and there is nothing to click.
   */
  links?: boolean
}

export interface LeafResult {
  placed: PlacedBlock[]
  overflow: boolean
  /** Empty unless `regions` was asked for. */
  regions: TextRegion[]
  /** Linked runs and their boxes. Empty unless `links` was asked for. */
  links: LeafLink[]
}

/** One run of words that points somewhere, in the leaf's own pixel space. */
export interface LeafLink {
  href: string
  rect: { x: number; y: number; w: number; h: number }
}

function buildEnv(
  ctx: CanvasRenderingContext2D,
  leaf: Leaf,
  deck: Deck,
  widthPx: number,
  assets: RenderAssets,
  opts: LeafOptions,
  collect?: (region: TextRegion) => void,
): LeafEnv {
  const index = opts.index ?? deck.leaves.indexOf(leaf)
  return {
    ctx,
    collect,
    sheet: leaf.full ? spreadSheet(widthPx) : leafSheet(widthPx),
    leaf,
    deck,
    lang: deck.lang,
    assets,
    quality: opts.quality ?? 'full',
    folio: index >= 0 ? folioOf(deck, index) : null,
  }
}

/**
 * The two soft-light washes that sit above everything, including the type.
 *
 * Above rather than below: it is what the file does, and it is what stops the
 * four surfaces reading as flat swatches. In the PDF they composite over vector
 * text, which keeps the text extractable.
 *
 * Skipped on thumbnails — cover-fitting two full-resolution textures into a
 * 150px box, forty times over, to produce grain nobody can see.
 */
function paintOverlays(env: LeafEnv): void {
  if (env.quality !== 'full') return
  const { ctx, sheet, assets, deck } = env
  const w = sheet.w
  const h = sheet.pt(PAGE_H)
  for (const overlay of OVERLAYS) {
    const img = assets.overlays[overlay.id]
    const opacity = deck.overlayOpacity[overlay.id] ?? overlay.opacity
    if (!img || opacity <= 0 || !img.width) continue
    ctx.save()
    ctx.globalAlpha = opacity
    ctx.globalCompositeOperation = overlay.blend as GlobalCompositeOperation
    // Cover-fit, centred. An earlier version tried to reproduce the file's
    // rotated placement with a scale expression and got it badly wrong — it
    // drew the grain about four and a half times too wide, so all you ever saw
    // was a magnified sliver. Orientation is meaningless for a grain wash
    // anyway; what matters is that it covers without distorting.
    const scale = Math.max(w / img.width, h / img.height)
    const dw = img.width * scale
    const dh = img.height * scale
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh)
    ctx.restore()
  }
}

function paint(env: LeafEnv, regions: TextRegion[], links: LeafLink[]): LeafResult {
  paintSurface(env)
  const { placed, overflow } = paintBlocks(env)
  paintFurniture(env)
  paintOverlays(env)
  return { placed, overflow, regions, links }
}

/** Run `paint`, with the collectors wired up for whatever was asked for. */
function run(env: LeafEnv, opts: LeafOptions): LeafResult {
  const regions: TextRegion[] = []
  const links: LeafLink[] = []
  return paint(
    {
      ...env,
      ...(opts.regions ? { collect: (r: TextRegion) => regions.push(r) } : {}),
      ...(opts.links ? { collectLink: (l: LeafLink) => links.push(l) } : {}),
    },
    regions,
    links,
  )
}

/** Natural pixel width for a leaf at 1:1. Covers are twice as wide. */
export const leafWidth = (leaf: Leaf): number => (leaf.full ? SPREAD_W : PAGE_W)

/** Draw one leaf into `ctx` at `widthPx` across. */
export function renderLeaf(
  ctx: CanvasRenderingContext2D,
  leaf: Leaf,
  deck: Deck,
  widthPx: number,
  assets: RenderAssets,
  opts: LeafOptions = {},
): LeafResult {
  return run(buildEnv(ctx, leaf, deck, widthPx, assets, opts), opts)
}

/**
 * The same leaf, as data instead of pixels.
 *
 * `metrics` must be a real 2D context — text measurement genuinely needs one —
 * but nothing is ever drawn into it. See `render/record.ts`.
 */
export function recordLeaf(
  metrics: CanvasRenderingContext2D,
  leaf: Leaf,
  deck: Deck,
  widthPx: number,
  assets: RenderAssets,
  opts: LeafOptions = {},
): { ops: DrawOp[] } & LeafResult {
  const { ctx, ops } = createRecorder(metrics)
  return { ops, ...run(buildEnv(ctx, leaf, deck, widthPx, assets, opts), opts) }
}
