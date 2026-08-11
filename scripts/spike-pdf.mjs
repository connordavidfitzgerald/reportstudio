/**
 * Phase 2 spikes 2b + 2c — run with `npm run spike:pdf`.
 *
 * Answers three questions before any of the vector-PDF work is committed to:
 *
 *   2b  Do the brand OTFs embed and render through @pdf-lib/fontkit, subsetted
 *       and unsubsetted? (CFF/OTF subsetting is historically the buggy path.)
 *   2c  Does the chosen analog-texture route — grain painted through the glyphs
 *       as a clipping path — actually work in pdf-lib?
 *   2c' And critically: does text drawn that way STILL EXTRACT? A textured page
 *       that isn't selectable or searchable defeats the whole point.
 *
 * Extraction is checked with `mdimport -d2`, which runs the same system PDFKit
 * that Preview and Spotlight use — so a pass here means a pass in the viewers
 * Le HUB will actually open the report in.
 *
 * Each page carries a unique marker word. If a marker comes back from mdimport,
 * text on that page is extractable.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import fontkit from '@pdf-lib/fontkit'
import sharp from 'sharp'
import {
  PDFDocument,
  PDFName,
  PDFOperator,
  PDFOperatorNames as Ops,
  concatTransformationMatrix,
  fill,
  rectangle,
  TextRenderingMode,
  beginText,
  drawObject,
  endText,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  setFontAndSize,
  setGraphicsState,
  setFillingRgbColor,
  setTextMatrix,
  setTextRenderingMode,
  showText,
} from 'pdf-lib'

const execFileAsync = promisify(execFile)
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, '.spike')

/** A4 in points — the report format. */
const PAGE_W = 595
const PAGE_H = 842
const MARGIN = 40

/** Display size (chapter title, step 8) and body size (step 0). */
const DISPLAY_PT = 53.75
const BODY_PT = 12.5

const MARKERS = {
  mode0: 'ZEBRAFISH',
  mode7: 'QUANGLEWURZ',
  mode4: 'PLINTHWORM',
  pattern: 'VORTIGERN',
}

// ---------------------------------------------------------------------------
// Grain
// ---------------------------------------------------------------------------

/**
 * Stand-in for Texturelabs_Grunge_265XL until the real asset lands. Gaussian
 * noise, desaturated — enough to prove the compositing route; the real texture
 * drops in without touching any of this.
 */
async function makeGrainPng(size = 512) {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 128, g: 128, b: 128 },
      noise: { type: 'gaussian', mean: 128, sigma: 42 },
    },
  })
    .greyscale()
    .png()
    .toBuffer()
}

// ---------------------------------------------------------------------------
// Raw-operator helpers
// ---------------------------------------------------------------------------

/** Register a font on a page and return the resource name to use in `Tf`. */
const fontKey = (page, font) => page.node.newFontDictionary('F', font.ref)

/**
 * Text at a baseline, y measured from the page top like canvas.
 *
 * `font.encodeText()` is not optional here. Passing a raw string to `showText`
 * writes a literal that happens to render, but pdf-lib never records which
 * glyphs were used — so subsetting then runs on an empty glyph set and CFF
 * encoding overflows. Every raw text operator in the real backend must route
 * through `encodeText` for the same reason.
 */
const textOps = (font, key, sizePt, x, yFromTop, str) => [
  beginText(),
  setFontAndSize(key, sizePt),
  setTextMatrix(1, 0, 0, 1, x, PAGE_H - yFromTop),
  showText(font.encodeText(str)),
  endText(),
]

/** Full-bleed image draw, sized to the page. */
const fullBleedImage = (name) => [
  pushGraphicsState(),
  concatTransformationMatrix(PAGE_W, 0, 0, PAGE_H, 0, 0),
  drawObject(name),
  popGraphicsState(),
]

/**
 * A tiling pattern that paints the grain image. Anchored to page space, so the
 * texture reads as one continuous sheet the type sits in rather than repeating
 * inside each letter — which is the whole difference between "printed" and
 * "texture-filled font".
 */
function makeGrainPattern(pdf, imageRef, tile = 256) {
  const ctx = pdf.context
  const content = `q ${tile} 0 0 ${tile} 0 0 cm /Im0 Do Q`
  return ctx.register(
    ctx.stream(content, {
      Type: 'Pattern',
      PatternType: 1, // tiling
      PaintType: 1, // colored
      TilingType: 1,
      BBox: [0, 0, tile, tile],
      XStep: tile,
      YStep: tile,
      Resources: { XObject: { Im0: imageRef } },
    }),
  )
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function build({ subset }) {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)

  const displayBytes = await readFile(join(ROOT, 'src/fonts/ReviewCondensed-Black.otf'))
  const textBytes = await readFile(join(ROOT, 'src/fonts/HelveticaNeue-Bold.otf'))

  const display = await pdf.embedFont(displayBytes, { subset })
  const text = await pdf.embedFont(textBytes, { subset })

  const grainPng = await makeGrainPng()
  const grain = await pdf.embedPng(grainPng)

  // Multiply, so grain darkens the ink rather than replacing it.
  const multiply = pdf.context.register(
    pdf.context.obj({ Type: 'ExtGState', BM: 'Multiply', ca: 0.85 }),
  )

  const surface = rgb(0.6, 0.8, 0) // brand lime
  const ink = rgb(0, 0, 0)

  const newPage = () => {
    const p = pdf.addPage([PAGE_W, PAGE_H])
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: surface })
    return p
  }

  // -- P1: plain vector text, the extraction baseline ------------------------
  {
    const p = newPage()
    const kD = fontKey(p, display)
    const kT = fontKey(p, text)
    p.pushOperators(
      setFillingRgbColor(0, 0, 0),
      ...textOps(display, kD, DISPLAY_PT, MARGIN, 120, `MODE0 ${MARKERS.mode0}`),
      ...textOps(text, kT, BODY_PT, MARGIN, 180, `Body copy baseline, mode 0. ${MARKERS.mode0}`),
    )
  }

  // -- P2: glyphs as clip (Tr 7), grain painted through ----------------------
  // The chosen route for display type. Clip takes effect at ET.
  {
    const p = newPage()
    const kD = fontKey(p, display)
    const imName = p.node.newXObject('Grain', grain.ref)
    p.pushOperators(
      pushGraphicsState(),
      setTextRenderingMode(TextRenderingMode.Clip),
      ...textOps(display, kD, DISPLAY_PT, MARGIN, 120, `MODE7 ${MARKERS.mode7}`),
      // Ink first, then grain multiplied over it — both confined to the glyphs.
      setFillingRgbColor(0, 0, 0),
      rectangle(0, PAGE_H - 160, PAGE_W, 160),
      fill(),
      setGraphicsState(p.node.newExtGState('GS', multiply)),
      ...fullBleedImage(imName),
      popGraphicsState(),
    )
  }

  // -- P3: fill + clip (Tr 4), grain multiplied through ----------------------
  // Same look, one fewer operator — the glyphs paint themselves.
  {
    const p = newPage()
    const kD = fontKey(p, display)
    const imName = p.node.newXObject('Grain', grain.ref)
    p.pushOperators(
      pushGraphicsState(),
      setFillingRgbColor(0, 0, 0),
      setTextRenderingMode(TextRenderingMode.FillAndClip),
      ...textOps(display, kD, DISPLAY_PT, MARGIN, 120, `MODE4 ${MARKERS.mode4}`),
      setGraphicsState(p.node.newExtGState('GS', multiply)),
      ...fullBleedImage(imName),
      popGraphicsState(),
    )
  }

  // -- P4: pattern-filled glyphs (/Pattern cs, scn) --------------------------
  // The alternative route: no transparency group at all, safest at a print RIP.
  {
    const p = newPage()
    const kD = fontKey(p, display)
    const patternRef = makeGrainPattern(pdf, grain.ref)
    const resources = p.node.Resources()
    resources.set(PDFName.of('Pattern'), pdf.context.obj({ P0: patternRef }))
    p.pushOperators(
      pushGraphicsState(),
      PDFOperator.of(Ops.NonStrokingColorspace, [PDFName.of('Pattern')]),
      PDFOperator.of(Ops.NonStrokingColorN, [PDFName.of('P0')]),
      ...textOps(display, kD, DISPLAY_PT, MARGIN, 120, `PATTERN ${MARKERS.pattern}`),
      popGraphicsState(),
    )
    void ink
  }

  return pdf.save()
}

// ---------------------------------------------------------------------------
// Extraction check
// ---------------------------------------------------------------------------

async function extractedText(path) {
  const { stdout } = await execFileAsync('mdimport', ['-d3', '-t', path], {
    maxBuffer: 32 * 1024 * 1024,
  }).catch((e) => ({ stdout: (e.stdout ?? '') + (e.stderr ?? '') }))
  return stdout
}

// ---------------------------------------------------------------------------

async function main() {
  await mkdir(OUT_DIR, { recursive: true })
  const results = []

  for (const subset of [false, true]) {
    const label = subset ? 'subset' : 'full'
    let bytes
    try {
      bytes = await build({ subset })
    } catch (err) {
      results.push({ label, ok: false, error: err.stack })
      continue
    }
    const path = join(OUT_DIR, `spike-${label}.pdf`)
    await writeFile(path, bytes)

    const dump = await extractedText(path)
    const found = Object.fromEntries(
      Object.entries(MARKERS).map(([k, m]) => [k, dump.includes(m)]),
    )
    results.push({ label, ok: true, kb: Math.round(bytes.length / 102.4) / 10, path, found })
  }

  console.log('\n=== 2b — font embedding ===')
  for (const r of results) {
    if (!r.ok) {
      console.log(`  ${r.label.padEnd(7)} FAILED: ${r.error}`)
      continue
    }
    console.log(`  ${r.label.padEnd(7)} ok, ${r.kb} KB → ${r.path}`)
  }

  console.log('\n=== 2c — texture route + text extraction ===')
  console.log('  (mdimport uses the same PDFKit as Preview/Spotlight)\n')
  const rows = [
    ['mode0', 'plain fill', 'baseline — must pass'],
    ['mode7', 'glyphs as clip', 'chosen route for display type'],
    ['mode4', 'fill + clip', 'same look, fewer ops'],
    ['pattern', 'pattern fill', 'alternative, no transparency group'],
  ]
  for (const r of results) {
    if (!r.ok) continue
    console.log(`  [${r.label}]`)
    for (const [key, what, note] of rows) {
      console.log(
        `    ${r.found[key] ? 'PASS' : 'FAIL'}  ${what.padEnd(16)} ${note}`,
      )
    }
  }

  console.log(
    '\n  Open the PDFs and check the texture reads correctly — the extraction',
    '\n  result above only proves the text is still there, not that it looks right.\n',
  )
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
