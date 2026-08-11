import { getPaper } from '../core/config/papers'
import { drawPaper } from '../core/paper'
import type { Deck, Page } from '../doc/types'
import { drawElement } from './drawElement'
import { buildPageEnv, type PageEnvOptions, type RenderAssets } from './env'
import { layoutPage, type Placed } from './layoutPage'

/**
 * Draw one complete page into `ctx` at `w`×`h`. Pure given its inputs, so the
 * live preview, the thumbnail strip and the PDF export all share exactly this
 * code path and cannot drift from each other.
 */
export function renderPage(
  ctx: CanvasRenderingContext2D,
  page: Page,
  deck: Deck,
  w: number,
  h: number,
  assets: RenderAssets,
  opts: PageEnvOptions = {},
): Placed[] {
  const env = buildPageEnv(ctx, page, deck, w, h, assets, opts)

  // 1. Background
  ctx.save()
  ctx.fillStyle = env.palette.background
  ctx.fillRect(0, 0, w, h)
  ctx.restore()

  // 2. Elements, in array order — later elements sit on top.
  const placed = layoutPage(env)
  for (const p of placed) drawElement(env, p)

  // 3. Paper textures over everything, for the printed-on-paper feel. Skipped on
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
