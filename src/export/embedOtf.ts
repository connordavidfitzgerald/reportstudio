import fontkit from '@pdf-lib/fontkit'
import { PDFArray, PDFDict, PDFName, PDFStream, type PDFDocument, type PDFFont } from 'pdf-lib'

/**
 * Putting a CFF-flavoured OTF into a PDF, correctly.
 *
 * Separate from `pdfFonts.ts` — which reaches for the font files through Vite's
 * `?url` imports and so can only run in a browser — precisely so that
 * `scripts/check-pdf-fonts.mjs` can exercise this part under Node with the real
 * font bytes. The bug this guards against is invisible to a type check and to
 * text extraction alike; it needs a real embed to catch.
 */

/**
 * Embed a whole OTF and label it as what it is.
 *
 * **Subsetting is off, and must stay off.** `@pdf-lib/fontkit` cannot subset a
 * CFF font: it emits a `/CIDFontType0C` program that both PDFKit (Preview,
 * Quick Look) and Chrome reject. They fall back to a substitute face and then
 * render the Identity-H codes — which are glyph indices — as if they were
 * character codes, so the page comes out as punctuation soup that nonetheless
 * copy-pastes correctly, because the ToUnicode CMap is unaffected. The Phase 2
 * spike missed this: it proved *extraction*, which survives the failure, and
 * never rasterised a page.
 *
 * The cost of whole-font embedding is the font file in every export, once, not
 * per page — ~160KB for the two brand faces.
 */
export async function embedOpenTypeFont(pdf: PDFDocument, bytes: ArrayBuffer): Promise<PDFFont> {
  pdf.registerFontkit(fontkit)
  return pdf.embedFont(bytes, { subset: false })
}

/**
 * Correct the font dictionaries. **Call once, after the last text is drawn and
 * before `save()`.**
 *
 * The ordering is forced by pdf-lib: `drawText` marks its font modified, and
 * `save()` re-embeds every modified font from scratch — so a correction applied
 * earlier is silently overwritten by the final flush. Embedding here ourselves
 * both writes the dictionaries we are about to patch and clears the modified
 * flag, which is what stops `save()` from undoing the work.
 */
export async function finalizeOpenTypeFonts(pdf: PDFDocument, fonts: Iterable<PDFFont>): Promise<void> {
  for (const font of fonts) {
    await font.embed()
    relabelAsOpenType(pdf, font)
  }
}

/**
 * Relabel a whole-font OTF embed from the TrueType slots to the CFF ones.
 *
 * pdf-lib's unsubsetted path writes *every* font as `/CIDFontType2` with the
 * program in `/FontFile2` — both TrueType-only. Our two faces are CFF OTFs with
 * no `glyf` table at all, so a viewer that believes the label finds no
 * outlines. Lenient ones sniff the `OTTO` tag and cope, which is why this still
 * renders; a strict one (a RIP, a print workflow) is entitled not to.
 *
 * The correct spelling for a CFF sfnt is `/CIDFontType0` with the program in
 * `/FontFile3` under `/Subtype /OpenType` (PDF 32000-1, table 126). Neither
 * face is CID-keyed, so CIDs are used directly as glyph indices — exactly what
 * pdf-lib's Identity-H encoding already writes. `/CIDToGIDMap` is a
 * CIDFontType2 key and goes with the rest.
 *
 * Widths and the ToUnicode CMap are untouched, so layout and extraction are
 * unchanged.
 */
function relabelAsOpenType(pdf: PDFDocument, font: PDFFont): void {
  const type0 = pdf.context.lookup(font.ref, PDFDict)
  const cidFont = type0.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict)
  const descriptor = cidFont.lookup(PDFName.of('FontDescriptor'), PDFDict)

  const program = descriptor.get(PDFName.of('FontFile2'))
  // Already in a CFF slot — a later pdf-lib may get this right on its own.
  if (!program) return

  cidFont.set(PDFName.of('Subtype'), PDFName.of('CIDFontType0'))
  cidFont.delete(PDFName.of('CIDToGIDMap'))
  descriptor.delete(PDFName.of('FontFile2'))
  descriptor.set(PDFName.of('FontFile3'), program)
  descriptor
    .lookup(PDFName.of('FontFile3'), PDFStream)
    .dict.set(PDFName.of('Subtype'), PDFName.of('OpenType'))
}
