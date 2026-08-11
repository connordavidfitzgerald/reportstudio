/**
 * PDF graphics helper checks — `npm run check:pdfgfx`.
 *
 * The canvas → PDF transform is where y-flip bugs live, and a flipped page looks
 * plausible enough in a thumbnail to ship. These are pure functions, so they can
 * be pinned properly rather than eyeballed in a viewer.
 */
import assert from 'node:assert/strict'
import { parseColor, blendOf, PdfSpace, ringsToPath } from '../src/export/pdfGfx.ts'
import { PAGE_FORMATS, formatProportionError } from '../src/config/formats.ts'

const close = (a, b, msg, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `${msg}: ${a} !== ${b}`)

// -- colour ------------------------------------------------------------------
{
  // The brand pink, as it appears in the palette.
  const pink = parseColor('#FF669E')
  close(pink.color.red, 1, 'pink red')
  close(pink.color.green, 0.4, 'pink green')
  close(pink.color.blue, 0x9e / 255, 'pink blue')
  close(pink.opacity, 1, 'hex is fully opaque')

  // The ink: black at 70%, which must survive as opacity, not as a darker black.
  const ink = parseColor('rgba(0, 0, 0, 0.7)')
  close(ink.color.red, 0, 'ink is black')
  close(ink.opacity, 0.7, 'ink alpha becomes opacity')

  // Context alpha multiplies the colour's own — the paper overlay relies on this.
  close(parseColor('rgba(0, 0, 0, 0.7)', 0.5).opacity, 0.35, 'alphas multiply')
  close(parseColor('#99CC00', 0.4).opacity, 0.4, 'context alpha applies to hex too')

  // The transparent fill a `plain` text run uses must come through as invisible,
  // so the painter skips it rather than drawing a black box.
  close(parseColor('rgba(0,0,0,0)').opacity, 0, 'fully transparent stays transparent')

  assert.deepEqual(parseColor('#fff').color, parseColor('#ffffff').color, 'short hex expands')

  // A colour the painter does not understand must fail loudly: a silently black
  // fill in an export is worse than a failed export, because nobody notices.
  assert.throws(() => parseColor('lime'), /unsupported colour/, 'named colours are refused')
}

// -- blend modes -------------------------------------------------------------
assert.equal(blendOf('source-over'), 'Normal')
assert.equal(blendOf('soft-light'), 'SoftLight', 'the paper overlay blend survives')
assert.equal(blendOf('screen'), 'Screen')
assert.throws(() => blendOf('saturation'), /no PDF equivalent/, 'unmappable blends are refused')

// -- coordinate space --------------------------------------------------------
{
  // EVERY format must be exactly proportional, or the vector exporter's single
  // uniform scale stretches the page on one axis.
  for (const f of PAGE_FORMATS) {
    close(formatProportionError(f), 0, `format "${f.id}" is exactly proportional`, 1e-12)
  }

  // The A4 report format: 1190px wide rendering to a 595pt page.
  const s = new PdfSpace(1190, 595, 842)
  close(s.scale, 0.5, 'A4 renders at exactly 2x its point size')

  close(s.x(0), 0, 'left edge maps to 0')
  close(s.x(1190), 595, 'right edge maps to the page width')
  close(s.y(0), 842, 'canvas top is PDF top')
  close(s.y(1684), 0, 'canvas bottom is PDF bottom, exactly')

  // A rect anchored top-left in canvas space becomes bottom-left in PDF space.
  const r = s.rect({ x: 100, y: 200, w: 300, h: 400 })
  close(r.x, 100 * s.scale, 'rect x')
  close(r.width, 300 * s.scale, 'rect width')
  close(r.height, 400 * s.scale, 'rect height')
  close(r.y, 842 - 600 * s.scale, 'rect y is measured from its BOTTOM edge')

  // A full-bleed rect must cover the page exactly — this is the background fill.
  const full = s.rect({ x: 0, y: 0, w: 1190, h: 1684 })
  close(full.x, 0, 'full bleed x')
  close(full.y, 0, 'full bleed y')
  close(full.width, 595, 'full bleed width')
  close(full.height, 842, 'full bleed height')
}

// -- paths -------------------------------------------------------------------
{
  // Coordinates stay in canvas space; drawSvgPath applies the flip itself.
  const d = ringsToPath([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 5 }]])
  assert.equal(d, 'M 0 0 L 10 0 L 10 5 Z', 'a ring is closed')

  const two = ringsToPath([
    [{ x: 0, y: 0 }, { x: 1, y: 0 }],
    [{ x: 5, y: 5 }, { x: 6, y: 5 }],
  ])
  assert.equal(two.match(/Z/g).length, 2, 'each ring closes separately')
  assert.equal(ringsToPath([]), '', 'no rings is an empty path')
  assert.ok(!/e-/.test(ringsToPath([[{ x: 1e-9, y: 0.0001 }]])), 'no exponent notation in output')
}

console.log('pdfgfx ok — colours, blends, y-flip transform, and paths')
