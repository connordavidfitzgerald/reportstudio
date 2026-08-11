import { PDFDocument } from 'pdf-lib'
import { papersReady, getPaperImages } from '../core/hooks/usePaperImages'
import { loadFonts } from '../core/config/fonts'
import { getFormat } from '../config/formats'
import { collectImageRefs, imagesReady } from '../doc/imageCache'
import type { Deck } from '../doc/types'
import { deckPages } from '../doc/sections'
import type { RenderAssets } from '../render/env'
import { renderPage } from '../render/renderPage'

export interface ExportOptions {
  /** 1 = 144dpi slides / 150dpi Letter · 2 = 288 / 300dpi. */
  scale?: 1 | 2
  quality?: number
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
}

const canvasToBytes = (canvas: HTMLCanvasElement, quality: number): Promise<Uint8Array> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error('canvas.toBlob returned null'))
        blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)), reject)
      },
      'image/jpeg',
      quality,
    )
  })

/**
 * Render every page and wrap them in a multi-page PDF.
 *
 * Pages go in as JPEG because a textured, halftoned page is broadband noise:
 * PNG runs 2–4MB a page (~100MB for a 30-page deck) where JPEG lands nearer
 * 400KB. `embedJpg` writes those bytes through verbatim — no re-encode, so what
 * the canvas produced is exactly what lands in the file.
 *
 * Text is not selectable in the result. That is inherent to the look: the
 * notched outline, the halftone and the paper grain are all raster.
 */
export async function exportDeckPdf(
  deck: Deck,
  assets: RenderAssets,
  opts: ExportOptions = {},
): Promise<Blob> {
  const { scale = 2, quality = 0.92, onProgress, signal } = opts

  // Three gates, all of which have to pass before the first page is drawn.
  await loadFonts()
  // An export must never bake in a low-res preview texture.
  await papersReady()
  // Without this a long deck silently exports blank boxes for any image that
  // hadn't been scrolled into view yet.
  await imagesReady(collectImageRefs(deck))

  const f = getFormat(deck.format)
  const pdf = await PDFDocument.create()

  // One canvas reused across pages, so peak memory is flat whatever the length.
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(f.w * scale)
  canvas.height = Math.round(f.h * scale)
  const ctx = canvas.getContext('2d')!
  const papers = getPaperImages()

  const pages = deckPages(deck)

  try {
    for (const [i, page] of pages.entries()) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      renderPage(ctx, page, deck, canvas.width, canvas.height, { ...assets, papers }, {
        renderScale: scale,
      })

      const jpg = await pdf.embedJpg(await canvasToBytes(canvas, quality))
      pdf.addPage([f.ptW, f.ptH]).drawImage(jpg, {
        x: 0,
        y: 0,
        width: f.ptW,
        height: f.ptH,
      })

      onProgress?.(i + 1, pages.length)
      // Yield so the progress count paints, an abort can land, and GC can run.
      await new Promise((r) => setTimeout(r, 0))
    }

    const bytes = await pdf.save()
    return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  } finally {
    // Release the backing store rather than waiting for GC — at 2× a Letter
    // canvas is 33MB.
    canvas.width = 0
    canvas.height = 0
  }
}

/** Render one page to a PNG blob, for dropping a single slide into something else. */
export async function exportPagePng(
  deck: Deck,
  pageIndex: number,
  assets: RenderAssets,
  scale: 1 | 2 = 2,
): Promise<Blob> {
  await loadFonts()
  await papersReady()
  await imagesReady(collectImageRefs(deck))

  const f = getFormat(deck.format)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(f.w * scale)
  canvas.height = Math.round(f.h * scale)
  const ctx = canvas.getContext('2d')!
  renderPage(
    ctx,
    deckPages(deck)[pageIndex],
    deck,
    canvas.width,
    canvas.height,
    { ...assets, papers: getPaperImages() },
    { renderScale: scale },
  )
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
