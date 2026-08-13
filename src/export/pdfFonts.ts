import type { PDFDocument, PDFFont } from 'pdf-lib'
import { FONTS, TEXT_FONT } from '../config/fonts'
import { embedOpenTypeFont, finalizeOpenTypeFonts } from './embedOtf'

import displayUrl from '../fonts/ReviewCondensed-Heavy.otf?url'
import displayItalicUrl from '../fonts/ReviewCondensed-HeavyItalic.otf?url'
import textUrl from '../fonts/NHaasGroteskDSPro-65Md.otf?url'
import textBoldUrl from '../fonts/NHaasGroteskDSPro-75Bd.otf?url'
import textItalicUrl from '../fonts/NHaasGroteskDSPro-66MdIt.otf?url'
import textBoldItalicUrl from '../fonts/NHaasGroteskDSPro-76BdIt.otf?url'

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
  [FONTS.display.regular.family]: displayUrl,
  [FONTS.display.italic.family]: displayItalicUrl,
  [FONTS.text.regular.family]: textUrl,
  [FONTS.text.bold.family]: textBoldUrl,
  [FONTS.text.italic.family]: textItalicUrl,
  [FONTS.text.boldItalic.family]: textBoldItalicUrl,
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

export interface BrandFonts {
  /** The face for a family name, falling back to the text face. */
  fonts: FontBook
  /**
   * Embed any of these families that isn't in the file yet.
   *
   * Called per page with the families that page's recorded ops actually name,
   * because these fonts are embedded whole — `embedOtf.ts` explains why they
   * cannot be subsetted — and a monolingual report with no bold in it should
   * not carry six unsubsetted OpenType programs it never draws with.
   */
  ensure(families: Iterable<string>): Promise<void>
  /**
   * Finish the embedding. Must run after the last page is painted and before
   * `save()` — see {@link finalizeOpenTypeFonts} for why the order is forced.
   */
  finalize: () => Promise<void>
}

/**
 * Embed every brand font once and return a lookup.
 *
 * The embedding itself — and the reason it does not subset — lives in
 * `embedOtf.ts`, which stays free of Vite's `?url` imports so the check script
 * can run it under Node.
 */
export async function embedBrandFonts(pdf: PDFDocument): Promise<BrandFonts> {
  const byFamily = new Map<string, PDFFont>()

  const embed = async (family: string): Promise<void> => {
    const url = FONT_FILES[family]
    if (!url || byFamily.has(family)) return
    const bytes = await fetch(url).then((r) => r.arrayBuffer())
    byFamily.set(family, await embedOpenTypeFont(pdf, bytes))
  }

  // The text roman is always embedded: it is the fallback for a family this
  // module doesn't recognise, and `fonts()` has to be able to answer
  // synchronously while a page is being painted.
  await embed(TEXT_FONT.family)

  return {
    fonts: (family: string) => byFamily.get(family) ?? byFamily.get(TEXT_FONT.family)!,
    ensure: async (families) => {
      for (const family of families) await embed(family)
    },
    finalize: () => finalizeOpenTypeFonts(pdf, byFamily.values()),
  }
}
