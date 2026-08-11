import type { PDFDocument, PDFImage, PDFPage } from 'pdf-lib'
import type { Rect } from '../core/types'
import type { DrawOp } from '../render/record'
import { setCharacterSpacing } from 'pdf-lib'
import { parseFont, type FontBook } from './pdfFonts'
import { blendOf, parseColor, PdfSpace, ringsToPath } from './pdfGfx'

/**
 * Paint recorded draw ops onto a PDF page as vector art.
 *
 * This is the second consumer of the op list; `replayOps` in `render/record.ts`
 * is the first and the reference. The two must agree about what every op means —
 * `scripts/check-record.mjs` pins that down for the canvas side.
 *
 * Rectangles, paths (the notched swash), and text come out as vectors. Images —
 * photographs, the halftone shader's output, and the paper grain — stay raster,
 * because they are raster: vectorising a CMYK screen would be millions of dot
 * paths in a file no viewer would open.
 */

/** How far the PDF font's idea of a run's width may differ from the canvas's. */
const WIDTH_TOLERANCE = 0.005

export interface PaintContext {
  pdf: PDFDocument
  page: PDFPage
  space: PdfSpace
  fonts: FontBook
  /** Real 2D context for text measurement; never drawn into. */
  metrics: CanvasRenderingContext2D
  /** Raster multiplier for embedded images. Vectors are resolution-free. */
  rasterScale: number
  jpegQuality: number
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const imageIds = new WeakMap<object, number>()
let nextImageId = 0

function idOf(image: CanvasImageSource): number {
  const key = image as unknown as object
  let id = imageIds.get(key)
  if (id === undefined) {
    id = nextImageId++
    imageIds.set(key, id)
  }
  return id
}

const intersect = (a: Rect, b: Rect | null): Rect => {
  if (!b) return a
  const x = Math.max(a.x, b.x)
  const y = Math.max(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(0, Math.min(a.x + a.w, b.x + b.w) - x),
    h: Math.max(0, Math.min(a.y + a.h, b.y + b.h) - y),
  }
}

/**
 * Rasterise the visible part of an image op and embed it.
 *
 * Cropping to the clip here is what lets the whole painter avoid PDF clipping
 * paths: the draw code only ever clips to cover-fit an image, so baking the crop
 * into the bitmap is equivalent — and smaller, since the off-frame part of a
 * cover-fitted photo is never written to the file at all.
 *
 * Results are cached per (image, size), so a mark repeated on forty pages is
 * embedded once and referenced forty times.
 */
async function embedImageOp(
  cx: PaintContext,
  op: Extract<DrawOp, { op: 'image' }>,
  cache: Map<string, PDFImage>,
): Promise<{ image: PDFImage; rect: Rect } | null> {
  const visible = intersect(op.rect, op.style.clip)
  if (visible.w <= 0 || visible.h <= 0) return null

  const pw = Math.max(1, Math.round(visible.w * cx.rasterScale))
  const ph = Math.max(1, Math.round(visible.h * cx.rasterScale))
  const key = `${idOf(op.image)}|${pw}x${ph}|${Math.round(op.rect.x - visible.x)}|${Math.round(op.rect.y - visible.y)}|${Math.round(op.rect.w)}x${Math.round(op.rect.h)}`

  let embedded = cache.get(key)
  if (!embedded) {
    const canvas = document.createElement('canvas')
    canvas.width = pw
    canvas.height = ph
    const c = canvas.getContext('2d')!
    const s = cx.rasterScale
    // Draw the source at its full rect, offset so the clipped region lands at 0,0.
    c.drawImage(
      op.image,
      (op.rect.x - visible.x) * s,
      (op.rect.y - visible.y) * s,
      op.rect.w * s,
      op.rect.h * s,
    )

    // JPEG unless the source may carry transparency: a textured page is
    // broadband noise, where PNG runs several MB a page and JPEG lands near 400KB.
    const opaque = isOpaque(c, pw, ph)
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, opaque ? 'image/jpeg' : 'image/png', cx.jpegQuality),
    )
    canvas.width = 0
    canvas.height = 0
    if (!blob) throw new Error('[pdf] failed to encode an image')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    embedded = opaque ? await cx.pdf.embedJpg(bytes) : await cx.pdf.embedPng(bytes)
    cache.set(key, embedded)
  }
  return { image: embedded, rect: visible }
}

/** Cheap alpha probe — JPEG would turn any transparency black. */
function isOpaque(c: CanvasRenderingContext2D, w: number, h: number): boolean {
  const step = Math.max(1, Math.floor(Math.min(w, h) / 16))
  const data = c.getImageData(0, 0, w, h).data
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      if (data[(y * w + x) * 4 + 3] < 255) return false
    }
  }
  return true
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const alignShift = (align: CanvasTextAlign, width: number): number =>
  align === 'center' ? -width / 2 : align === 'right' || align === 'end' ? -width : 0

/**
 * Draw one recorded text run.
 *
 * The fidelity problem: canvas laid the page out, and the PDF must not re-lay it
 * out. Two things make that tractable.
 *
 * First, the display type is already solved. `drawHeaderBlock` emits one
 * `fillText` per grapheme at exact measured advances — that is how the notched
 * swash hugs the letterforms — so those ops arrive pre-positioned and the PDF
 * just places each glyph where canvas put it. Font metrics can't drift because
 * they aren't consulted.
 *
 * Second, for runs that *are* whole lines, we compare the canvas width against
 * the embedded font's and adapt:
 *   - agree within {@link WIDTH_TOLERANCE} → one text run, which gives extractors
 *     and screen readers clean word boundaries.
 *   - disagree → split on words and place each at its canvas-measured origin, so
 *     error is confined to within a word and never accumulates across a line.
 *
 * This is why the planned metric-calibration spike was unnecessary: the decision
 * is made per run, from real measurements, instead of once from a guess.
 */
function drawTextOp(cx: PaintContext, op: Extract<DrawOp, { op: 'text' }>): void {
  if (!op.text) return
  if (op.style.baseline !== 'alphabetic') {
    throw new Error(`[pdf] unsupported text baseline "${op.style.baseline}"`)
  }

  const parsed = parseFont(op.style.font)
  if (!parsed) throw new Error(`[pdf] cannot map font "${op.style.font}" to an embedded face`)

  const font = cx.fonts(parsed.family)
  const sizePt = cx.space.len(parsed.sizePx)
  const { color, opacity } = parseColor(op.style.fill, op.style.alpha)
  if (opacity <= 0) return

  // Body copy carries negative tracking. PDF's Tc has the same meaning as canvas
  // `letterSpacing` — extra advance after each glyph — so setting it makes the
  // two engines agree by construction rather than by luck. Tc is text state, so
  // it is set outside the run and cleared afterwards.
  const trackingPx = parseFloat(op.style.letterSpacing) || 0
  const tc = cx.space.len(trackingPx)
  if (tc) cx.page.pushOperators(setCharacterSpacing(tc))

  cx.metrics.font = op.style.font
  ;(cx.metrics as unknown as { letterSpacing: string }).letterSpacing = op.style.letterSpacing
  const canvasW = cx.metrics.measureText(op.text).width
  const originPx = op.x + alignShift(op.style.align, canvasW)
  const common = { size: sizePt, font, color, opacity, blendMode: blendOf(op.style.composite) }

  // Tc applies to every glyph including the last, which canvas does too.
  const pdfW = (font.widthOfTextAtSize(op.text, sizePt) + tc * op.text.length) / cx.space.scale
  const agrees = canvasW === 0 || Math.abs(pdfW - canvasW) / canvasW <= WIDTH_TOLERANCE

  if (agrees || !op.text.includes(' ')) {
    cx.page.drawText(op.text, { x: cx.space.x(originPx), y: cx.space.y(op.y), ...common })
  } else {
    // Word-by-word, each anchored where canvas put it.
    let cursor = 0
    for (const word of op.text.split(/(\s+)/)) {
      if (word.trim()) {
        const at = originPx + cx.metrics.measureText(op.text.slice(0, cursor)).width
        cx.page.drawText(word, { x: cx.space.x(at), y: cx.space.y(op.y), ...common })
      }
      cursor += word.length
    }
  }

  if (tc) cx.page.pushOperators(setCharacterSpacing(0))
}

// ---------------------------------------------------------------------------

/**
 * Paint a page's ops. Images are embedded first so the async work is batched and
 * the drawing pass itself stays synchronous and in strict paint order.
 */
export async function paintPdfPage(
  cx: PaintContext,
  ops: DrawOp[],
  imageCache: Map<string, PDFImage>,
): Promise<void> {
  const images = new Map<number, { image: PDFImage; rect: Rect } | null>()
  for (const [i, op] of ops.entries()) {
    if (op.op === 'image') images.set(i, await embedImageOp(cx, op, imageCache))
  }

  for (const [i, op] of ops.entries()) {
    const blendMode = blendOf(op.style.composite)
    switch (op.op) {
      case 'rect': {
        const { color, opacity } = parseColor(op.style.fill, op.style.alpha)
        if (opacity <= 0 || op.rect.w <= 0 || op.rect.h <= 0) break
        cx.page.drawRectangle({ ...cx.space.rect(op.rect), color, opacity, blendMode })
        break
      }
      case 'path': {
        const { color, opacity } = parseColor(op.style.fill, op.style.alpha)
        if (opacity <= 0) break
        // Coordinates stay in canvas space; drawSvgPath applies the y-flip.
        cx.page.drawSvgPath(ringsToPath(op.rings), {
          x: 0,
          y: cx.space.ptH,
          scale: cx.space.scale,
          color,
          opacity,
          blendMode,
        })
        break
      }
      case 'text':
        drawTextOp(cx, op)
        break
      case 'image': {
        const embedded = images.get(i)
        if (!embedded) break
        cx.page.drawImage(embedded.image, {
          ...cx.space.rect(embedded.rect),
          opacity: op.style.alpha,
          blendMode,
        })
        break
      }
    }
  }
}
