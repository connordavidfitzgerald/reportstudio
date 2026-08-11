import { getPaper } from '../core/config/papers'
import { drawPaper } from '../core/paper'
import type { Deck, Page } from '../doc/types'
import { toRenderPage, type RenderPage } from './page'
import { drawElement } from './drawElement'
import { buildPageEnv, type PageEnv, type PageEnvOptions, type RenderAssets } from './env'
import { createRecorder, type DrawOp } from './record'
import { layoutPage, type Placed } from './layoutPage'

/**
 * Paint a page into whatever `env.ctx` is.
 *
 * The single painting implementation. `renderPage` points it at a real canvas;
 * `recordPage` points it at a recorder and keeps the ops. Because both go
 * through here, the PDF cannot disagree with the preview about what is on the
 * page — there is no second copy of this sequence to fall out of step.
 */
function paintPage(env: PageEnv): Placed[] {
  const { ctx, deck, w, h, assets } = env

  // 1. Background
  ctx.save()
  ctx.fillStyle = env.palette.background
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  // 2. Items, in array order — later items sit on top.
  const placed = layoutPage(env)
  for (const p of placed) drawElement(env, p)

  // 3. Paper textures over everything, for the printed-on-paper feel — including
  //    over the type, which is the look the brand redesign specifies. Skipped on
  //    thumbnails: cover-fitting a 2160×3840 texture into an 84px box, three
  //    times, forty times over, to produce invisible grain.
  if (env.quality === 'full') {
    for (const id of deck.paperIds) {
      const paper = getPaper(id)
      if (!paper.src) continue
      const opacity = deck.paperOpacities[id] ?? paper.defaultOpacity
      drawPaper(ctx, assets.papers[id] ?? null, w, h, paper.blend, opacity)
    }
  }

  return placed
}

/** Normalise a document page for the renderer. Memoised, so identity holds. */
const asRenderPage = (page: Page | RenderPage): RenderPage =>
  'items' in page ? page : toRenderPage(page)

/**
 * Draw one complete page into `ctx` at `w`×`h`. Pure given its inputs, so the
 * live preview, the thumbnail strip and the PDF export all share exactly this
 * code path and cannot drift from each other.
 */
export function renderPage(
  ctx: CanvasRenderingContext2D,
  page: Page | RenderPage,
  deck: Deck,
  w: number,
  h: number,
  assets: RenderAssets,
  opts: PageEnvOptions = {},
): Placed[] {
  return paintPage(buildPageEnv(ctx, asRenderPage(page), deck, w, h, assets, opts))
}

/**
 * The same page, as data instead of pixels.
 *
 * `metrics` must be a real 2D context — text measurement genuinely needs one —
 * but nothing is ever drawn into it. See `render/record.ts` for why recording
 * beats re-deriving the geometry.
 */
export function recordPage(
  metrics: CanvasRenderingContext2D,
  page: Page | RenderPage,
  deck: Deck,
  w: number,
  h: number,
  assets: RenderAssets,
  opts: PageEnvOptions = {},
): { ops: DrawOp[]; placed: Placed[] } {
  const { ctx, ops } = createRecorder(metrics)
  const placed = paintPage(buildPageEnv(ctx, asRenderPage(page), deck, w, h, assets, opts))
  return { ops, placed }
}
