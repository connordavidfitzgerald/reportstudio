import { LOGO, PAD_RATIO } from '../core/config/constants'
import {
  drawFittedParagraphs,
  drawHeaderBlock,
  drawLogo,
  drawParagraph,
} from '../core/elements'
import { getHalftone } from '../core/halftone/halftoneRenderer'
import { getImage } from '../doc/imageCache'
import type { Rect } from '../core/types'
import type { ImageElement, TextElement } from '../doc/types'
import { colorOf, type PageEnv } from './env'
import type { Placed, TextLayout } from './layoutPage'

/** Fully transparent, so a `plain` text run paints glyphs and no box. */
const NO_FILL = 'rgba(0,0,0,0)'

/** Draw `img` into `rect` with object-fit: cover, biased toward `focus`. */
function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  rect: Rect,
  focus: { x: number; y: number },
): void {
  const scale = Math.max(rect.w / img.naturalWidth, rect.h / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  ctx.save()
  ctx.beginPath()
  ctx.rect(rect.x, rect.y, rect.w, rect.h)
  ctx.clip()
  ctx.drawImage(img, rect.x - (dw - rect.w) * focus.x, rect.y - (dh - rect.h) * focus.y, dw, dh)
  ctx.restore()
}

function drawImageElement(env: PageEnv, el: ImageElement, rect: Rect): void {
  const img = getImage(el.imageRef)
  if (!img || !img.naturalWidth) return
  const focus = el.focus ?? { x: 0.5, y: 0.5 }

  // Thumbnails skip the shader — at strip size the dots alias to mush, and a
  // 40-page strip would run the pass 40 times for no visible difference.
  if (el.halftone && env.quality === 'full') {
    const out = getHalftone(img, rect.w, rect.h, el.halftone, {
      renderScale: env.renderScale,
      // One-shot export renders are used once; caching them evicts the preview.
      cache: env.renderScale === 1,
    })
    // `null` means WebGL is unavailable; fall through to the plain image.
    if (out) {
      env.ctx.drawImage(out, rect.x, rect.y, rect.w, rect.h)
      return
    }
  }
  drawCover(env.ctx, img, rect, focus)
}

function drawTextElement(
  env: PageEnv,
  el: TextElement,
  cellRect: Rect,
  rect: Rect,
  text: TextLayout,
): void {
  const { ctx } = env
  const pad = env.shortEdge * PAD_RATIO
  const bg = colorOf(env, el.bg) ?? NO_FILL

  // While this element is being edited, its background still draws but its
  // glyphs don't — the DOM textarea overlaid on the canvas supplies those, so
  // the text is never doubled and never half-committed.
  const glyphless = env.editingId === el.id

  if (el.variant === 'header') {
    drawHeaderBlock(
      ctx,
      {
        lines: text.lines,
        size: text.size,
        containerX: cellRect.x,
        containerWidth: cellRect.w,
        align: el.align,
        lineAdvance: text.lineAdvance,
        outlineColor: bg,
      },
      rect.y,
      env.shortEdge,
      !glyphless,
    )
    return
  }

  if (el.variant === 'paragraph') {
    drawParagraph(ctx, el.text, text.size, cellRect.x, rect.y, cellRect.w, bg, pad, !glyphless)
    return
  }

  drawFittedParagraphs(
    ctx,
    [{ text: el.text, style: 'fitted', side: el.align }],
    text.size,
    cellRect.x,
    cellRect.x + cellRect.w,
    rect.y,
    el.variant === 'plain' ? NO_FILL : bg,
    pad,
    el.align,
    !glyphless,
  )
}

/** Paint one already-laid-out element. */
export function drawElement(env: PageEnv, placed: Placed): void {
  const { el, rect, cellRect } = placed

  switch (el.kind) {
    case 'text':
      drawTextElement(env, el, cellRect, rect, placed.text!)
      return

    case 'image':
      drawImageElement(env, el, rect)
      return

    case 'block': {
      const fill = colorOf(env, el.bg)
      if (!fill) return
      env.ctx.fillStyle = fill
      env.ctx.fillRect(rect.x, rect.y, rect.w, rect.h)
      return
    }

    case 'logo':
      drawLogo(
        env.ctx,
        env.assets.logo,
        rect.x,
        rect.y + rect.h,
        rect.h,
        LOGO.fallbackText,
        'left',
      )
      return
  }
}
