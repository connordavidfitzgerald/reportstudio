/**
 * Font-embedding checks — `npm run check:pdf-fonts`.
 *
 * One bug, pinned from three directions.
 *
 * `@pdf-lib/fontkit` cannot subset a CFF font. Turn subsetting on and it writes
 * a `/CIDFontType0C` program that PDFKit and Chrome both reject; they
 * substitute a face and then paint the Identity-H codes — glyph indices — as
 * character codes, so every page of the report comes out as punctuation soup.
 *
 * What makes it worth a check of its own is how quietly it passes everything
 * else. The PDF is structurally valid. Widths are right, so the layout is
 * right. The ToUnicode CMap is right, so the text extracts, searches and
 * copy-pastes perfectly — which is exactly what the Phase 2 spike measured, and
 * why it reported success. Only rasterising a page shows the failure.
 *
 * So instead of trusting the label, this reparses the font program that came
 * back out of the file and asks it to draw. A subsetted CFF fails at the first
 * step: fontkit will not even recognise its own output.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, PDFName, PDFRawStream, PDFRef, decodePDFRawStream } from 'pdf-lib'

import { embedOpenTypeFont, finalizeOpenTypeFonts } from '../src/export/embedOtf.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
// Every cut the document can be set in. Not `ABCFavorit-Book.ttf`: that is the
// interface's face, is never embedded, and is TrueType — the CFF assertions
// below would correctly fail on it.
const FONTS = [
  'ReviewCondensed-Heavy.otf',
  'ReviewCondensed-HeavyItalic.otf',
  'NHaasGroteskDSPro-65Md.otf',
  'NHaasGroteskDSPro-75Bd.otf',
  'NHaasGroteskDSPro-66MdIt.otf',
  'NHaasGroteskDSPro-76BdIt.otf',
]

/** Covers both cases, ascender to descender, plus the figures the charts use. */
const SAMPLE = 'Handgloves 0123 — Tools for Change'

for (const file of FONTS) {
  const bytes = await readFile(join(ROOT, 'src/fonts', file))
  const source = fontkit.create(bytes)

  const pdf = await PDFDocument.create()
  const font = await embedOpenTypeFont(pdf, bytes)
  pdf.addPage([600, 200]).drawText(SAMPLE, { x: 20, y: 100, size: 24, font })
  await finalizeOpenTypeFonts(pdf, [font])
  const saved = await pdf.save()

  // Read the file back rather than inspecting the document we just built: what
  // matters is what a viewer will find, not what we intended to write.
  const out = await PDFDocument.load(saved)
  const deref = (v) => (v instanceof PDFRef ? out.context.lookup(v) : v)

  const type0 = [...out.context.enumerateIndirectObjects()]
    .map(([, obj]) => obj)
    .find((obj) => obj?.get?.(PDFName.of('Subtype'))?.toString() === '/Type0')
  assert.ok(type0, `${file}: no Type0 font in the saved file`)

  const cidFont = deref(deref(type0.get(PDFName.of('DescendantFonts'))).get(0))
  const descriptor = deref(cidFont.get(PDFName.of('FontDescriptor')))

  // -- the program is a whole font, and it can still draw --------------------
  // First, because it is the failure that matters: everything below is a label
  // on this, and a correct label on a broken program renders nothing.
  const stream = deref(
    descriptor.get(PDFName.of('FontFile3')) ?? descriptor.get(PDFName.of('FontFile2')),
  )
  assert.ok(stream instanceof PDFRawStream, `${file}: no embedded font program at all`)

  const program = Buffer.from(decodePDFRawStream(stream).decode())
  assert.equal(
    program.subarray(0, 4).toString('latin1'),
    'OTTO',
    `${file}: the embedded program is not a whole OpenType/CFF sfnt — subsetting is back on, ` +
      `and no viewer will render this`,
  )

  let embedded
  try {
    embedded = fontkit.create(program)
  } catch (err) {
    assert.fail(`${file}: the embedded font program will not reparse (${err.message})`)
  }
  assert.equal(
    embedded.numGlyphs,
    source.numGlyphs,
    `${file}: the whole font should go in, unmodified`,
  )

  const outlines = embedded.glyphsForString(SAMPLE).filter((g) => g.path.commands.length > 0)
  assert.ok(
    outlines.length >= SAMPLE.replace(/\s/g, '').length,
    `${file}: only ${outlines.length} of ${SAMPLE.length} sample glyphs have outlines`,
  )

  // -- and the labels say CFF, because the font is CFF -----------------------
  assert.equal(
    cidFont.get(PDFName.of('Subtype')).toString(),
    '/CIDFontType0',
    `${file}: a CFF font must not be labelled CIDFontType2`,
  )
  assert.equal(
    descriptor.get(PDFName.of('FontFile2')),
    undefined,
    `${file}: FontFile2 is the TrueType slot and holds no glyf table here`,
  )
  assert.equal(
    cidFont.get(PDFName.of('CIDToGIDMap')),
    undefined,
    `${file}: CIDToGIDMap is a CIDFontType2 key`,
  )
  assert.equal(
    stream.dict.get(PDFName.of('Subtype')).toString(),
    '/OpenType',
    `${file}: FontFile3 holds a whole OTF, so its subtype is OpenType`,
  )

  console.log(
    `  ok  ${file} — ${embedded.numGlyphs} glyphs, ${(program.length / 1024) | 0}KB, FontFile3/OpenType`,
  )
}

console.log('check:pdf-fonts — the brand fonts embed as drawable OpenType/CFF')
