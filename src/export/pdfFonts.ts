import fontkit from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'
import { DISPLAY_FONT, TEXT_FONT } from '../config/fonts'

import displayUrl from '../fonts/ReviewCondensed-Heavy.otf?url'
import textUrl from '../fonts/NHaasGroteskDSPro-65Md.otf?url'

/**
 * Embedding the brand fonts in the PDF.
 *
 * Deliberately *not* in `config/fonts.ts`, which declares the families for the
 * canvas and has no business knowing about PDF embedding. The family names are
 * the join between the two.
 *
 * These are the same two files `src/index.css` loads. They must stay in step:
 * embedding a different cut from the one the canvas measured would put every
 * line break in the PDF somewhere the preview didn't.
 */
const FONT_FILES: Record<string, string> = {
  [DISPLAY_FONT.family]: displayUrl,
  [TEXT_FONT.family]: textUrl,
}

/** Parsed form of a canvas `font` string, as produced by `fontString()`. */
export interface ParsedFont {
  family: string
  sizePx: number
}

/**
 * Pull the family and size back out of a recorded canvas font string.
 *
 * `fontString()` builds `500 12.64px "Neue Haas Grotesk", <fallbacks>`, so the
 * quoted family is the brand one and everything after it is the fallback stack.
 * Returns null when the string doesn't match, which means the draw code produced
 * a font this module doesn't know how to embed — the caller treats that as fatal
 * rather than guessing, since guessing wrong silently changes the typeface.
 */
export function parseFont(font: string): ParsedFont | null {
  const m = /(?:^|\s)([\d.]+)px\s+"([^"]+)"/.exec(font)
  if (!m) return null
  return { sizePx: Number(m[1]), family: m[2] }
}

export type FontBook = (family: string) => PDFFont

/**
 * Embed every brand font once and return a lookup.
 *
 * Subsetting is on. It works — the spike's apparent failure was `showText` with
 * a raw string, which never records which glyphs were used; pdf-lib's own
 * `drawText` calls `encodeText` and therefore registers them. See
 * `scripts/spike-pdf.mjs`.
 */
export async function embedBrandFonts(pdf: PDFDocument): Promise<FontBook> {
  pdf.registerFontkit(fontkit)

  const entries = await Promise.all(
    Object.entries(FONT_FILES).map(async ([family, url]) => {
      const bytes = await fetch(url).then((r) => r.arrayBuffer())
      return [family, await pdf.embedFont(bytes, { subset: true })] as const
    }),
  )

  const byFamily = new Map(entries)
  const fallback = byFamily.get(TEXT_FONT.family)!

  return (family: string) => byFamily.get(family) ?? fallback
}
