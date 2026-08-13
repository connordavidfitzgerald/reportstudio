import { PDFDocument, type PDFImage } from 'pdf-lib'
import { loadFonts } from '../config/fonts'
import { PAGE_H, PAGE_W, SPREAD_W } from '../config/brand'
import { collectImageRefs, imagesReady } from '../doc/imageCache'
import type { Deck, Leaf } from '../doc/types'
import type { RenderAssets } from '../render/compose'
import { leafWidth, recordLeaf, renderLeaf } from '../render/leaf'
import { embedBrandFonts, parseFont, type FontBook } from './pdfFonts'
import { PdfSpace } from './pdfGfx'
import { paintPdfPage } from './paintPdf'

export interface ExportOptions {
  /**
   * Raster multiplier for *embedded images only* — text, rules and colour
   * fields are resolution-free in the vector path. 2 is ~288dpi.
   */
  scale?: 1 | 2
  quality?: number
  onProgress?: (done: number, total: number) => void
  signal?: AbortSignal
  /**
   * Force the all-raster export. The vector path falls back to this on its own
   * if the fonts can't be embedded.
   */
  raster?: boolean
}

/** PDF page size for a leaf. The cover is a single 1190 × 842 page. */
const pageSize = (leaf: Leaf): [number, number] => [leaf.full ? SPREAD_W : PAGE_W, PAGE_H]

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
 * Export the document as a PDF with **real text** — selectable, searchable, and
 * readable by assistive software.
 *
 * Every leaf is recorded rather than rasterised (see `render/record.ts`) and the
 * ops are painted as vectors: type, rules, colour fields and every swash.
 * Photographs and the two grain overlays stay raster, because they are raster.
 *
 * Font embedding is the one thing that can fail wholesale, so it is attempted
 * once up front and falls back to {@link exportRasterPdf} for the entire
 * document. A file with some vector pages and some raster ones would be worse
 * than either.
 */
export async function exportDeckPdf(
  deck: Deck,
  assets: RenderAssets,
  opts: ExportOptions = {},
): Promise<Blob> {
  if (opts.raster) return exportRasterPdf(deck, assets, opts)

  const { scale = 2, quality = 0.92, onProgress, signal } = opts

  await loadFonts()
  await imagesReady(collectImageRefs(deck))

  const pdf = await PDFDocument.create()

  let fonts: FontBook
  let ensureFonts: (families: Iterable<string>) => Promise<void>
  let finalizeFonts: () => Promise<void>
  try {
    ;({ fonts, ensure: ensureFonts, finalize: finalizeFonts } = await embedBrandFonts(pdf))
  } catch (err) {
    console.warn('[export] falling back to the raster exporter: font embedding failed', err)
    return exportRasterPdf(deck, assets, opts)
  }

  // Text measurement needs a real context, but nothing is ever drawn into it.
  const metrics = document.createElement('canvas').getContext('2d')!
  // One PDFImage per distinct bitmap, shared across pages.
  const imageCache = new Map<string, PDFImage>()

  for (const [i, leaf] of deck.leaves.entries()) {
    if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

    // Record at the page's point size, so recorded ops are already in points
    // and the transform is 1:1. `scale` only reaches the embedded bitmaps.
    const width = leafWidth(leaf)
    const { ops, links } = recordLeaf(metrics, leaf, deck, width, assets, {
      index: i,
      links: true,
    })
    const [ptW, ptH] = pageSize(leaf)

    // Embed the cuts this page actually draws with, before painting it. The
    // family is the join between the canvas and the PDF — see `pdfFonts.ts`.
    await ensureFonts(
      ops.flatMap((op) => (op.op === 'text' ? [parseFont(op.style.font)?.family ?? ''] : [])),
    )

    await paintPdfPage(
      {
        pdf,
        page: pdf.addPage([ptW, ptH]),
        space: new PdfSpace(width, ptW, ptH),
        fonts,
        metrics,
        rasterScale: scale,
        jpegQuality: quality,
      },
      ops,
      imageCache,
      links,
    )

    onProgress?.(i + 1, deck.leaves.length)
    await new Promise((r) => setTimeout(r, 0))
  }

  // After the last `drawText`, before `save()`. Both halves matter.
  await finalizeFonts()

  const bytes = await pdf.save()
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}

/**
 * The all-raster export, kept as the fallback.
 *
 * Pages go in as JPEG because a textured page is broadband noise: PNG runs
 * 2–4MB a page where JPEG lands nearer 400KB. `embedJpg` writes those bytes
 * through verbatim — no re-encode.
 *
 * Text is not selectable in the result.
 */
export async function exportRasterPdf(
  deck: Deck,
  assets: RenderAssets,
  opts: ExportOptions = {},
): Promise<Blob> {
  const { scale = 2, quality = 0.92, onProgress, signal } = opts

  await loadFonts()
  // Without this a long document silently exports blank boxes for any image
  // that hadn't been scrolled into view yet.
  await imagesReady(collectImageRefs(deck))

  const pdf = await PDFDocument.create()
  // One canvas reused across pages, so peak memory is flat whatever the length.
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')!

  try {
    for (const [i, leaf] of deck.leaves.entries()) {
      if (signal?.aborted) throw new DOMException('Export cancelled', 'AbortError')

      const width = leafWidth(leaf) * scale
      canvas.width = Math.round(width)
      canvas.height = Math.round(PAGE_H * scale)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      renderLeaf(ctx, leaf, deck, canvas.width, assets, { index: i })

      const [ptW, ptH] = pageSize(leaf)
      const jpg = await pdf.embedJpg(await canvasToBytes(canvas, quality))
      pdf.addPage([ptW, ptH]).drawImage(jpg, { x: 0, y: 0, width: ptW, height: ptH })

      onProgress?.(i + 1, deck.leaves.length)
      // Yield so the progress count paints, an abort can land, and GC can run.
      await new Promise((r) => setTimeout(r, 0))
    }

    const bytes = await pdf.save()
    return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
  } finally {
    // Release the backing store rather than waiting for GC.
    canvas.width = 0
    canvas.height = 0
  }
}

/** Render one leaf to a PNG blob, for dropping a single page into something else. */
export async function exportLeafPng(
  deck: Deck,
  index: number,
  assets: RenderAssets,
  scale: 1 | 2 = 2,
): Promise<Blob> {
  await loadFonts()
  await imagesReady(collectImageRefs(deck))

  const leaf = deck.leaves[index]
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(leafWidth(leaf) * scale)
  canvas.height = Math.round(PAGE_H * scale)
  renderLeaf(canvas.getContext('2d')!, leaf, deck, canvas.width, assets, { index })
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  )
}
