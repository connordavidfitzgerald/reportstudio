import fontkit from '@pdf-lib/fontkit'
import type { PDFDocument, PDFFont } from 'pdf-lib'
import { DISPLAY_FONT, TEXT_FONT } from '../core/config/fonts'

import displayUrl from '../fonts/ReviewCondensed-Black.otf?url'
import textUrl from '../fonts/HelveticaNeue-Bold.otf?url'

/**
 * Embedding the brand fonts in the PDF.
 *
 * Deliberately *not* in `core/config/fonts.ts`: `src/core/` is synced with the
 * poster app and has no business knowing about PDF embedding. The families it
 * declares are the join between the two.
 *
 * The two urls are the same stand-in files `src/index.css` uses; swapping in the
 * real ReviewCondensed-Heavy and Neue Haas Grotesk means changing them in both
 * places and nowhere else.
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
