/**
 * What makes the document editable — `npm run check:editing`.
 *
 * Two things the on-page editor depends on, neither of which is visible until
 * it is wrong.
 *
 * **Regions must be a pure side-channel.** The painters report where each run
 * of words landed *as they draw it*, which is the only way a caret can sit on
 * the glyphs. Collecting must therefore change nothing about what is drawn —
 * asserted here by recording each page twice, with and without collection, and
 * comparing every op.
 *
 * **Every field must be reachable.** A field with no region can only be edited
 * in the side panel, and the failure is silent: the text is simply not
 * clickable, and nobody notices until a client tries. So each kind's expected
 * paths are listed and checked exactly — extra regions fail too, since a
 * duplicate would mean two carets for one field.
 *
 * The third case pins the fill-spacer probe, which stacks a page a second time
 * with the fills at zero purely to measure it. Those positions are never
 * painted, so collecting from that pass would put carets in mid-air.
 *
 * Also covers `doc/localized.ts`, where treating an empty translation as a
 * missing one made every text field in the document impossible to clear.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { recordLeaf } from '../src/render/leaf.ts'
import { measuringAssets } from '../src/render/measureCtx.ts'
import { PAGE_W } from '../src/config/brand.ts'
import { isFullyTranslated, setLang, t } from '../src/doc/localized.ts'
import { pairLeaves } from '../src/doc/types.ts'
import {
  activeAt,
  normalizeMarks,
  remapMarks,
  setHref,
  toSegments,
  toggleFlag,
} from '../src/doc/marks.ts'

const metrics = {
  font: '10px sans-serif',
  textBaseline: 'alphabetic',
  letterSpacing: '0px',
  measureText(t) {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(this.font)?.[1] ?? 10)
    const ls = Number(/(-?\d+(?:\.\d+)?)px/.exec(this.letterSpacing)?.[1] ?? 0)
    return {
      width: t.length * px * 0.5 + t.length * ls,
      actualBoundingBoxAscent: px * 0.72,
      actualBoundingBoxDescent: px * 0.2,
      fontBoundingBoxAscent: px * 0.8,
      fontBoundingBoxDescent: px * 0.22,
    }
  },
}

// The fill-spacer probe reaches for a real 2D context; hand it the same stub.
globalThis.document = { createElement: () => ({ getContext: () => ({ ...metrics }) }) }

const W = 'Grassroots climate justice organizing is dynamic work.'

/** kind → block, and the field paths it must report. */
const CASES = [
  [{ kind: 'heading', text: W }, ['text']],
  [{ kind: 'deck', text: W }, ['text']],
  [{ kind: 'sectionHeading', text: W }, ['text']],
  [{ kind: 'subhead', text: W }, ['text']],
  [{ kind: 'para', text: W }, ['text']],
  [{ kind: 'para', text: W, indent: false }, ['text']],
  [{ kind: 'quote', text: W }, ['text']],
  [{ kind: 'quote', text: W, attribution: 'an organizer' }, ['text', 'attribution']],
  [{ kind: 'band', text: W, surface: 'pink' }, ['text']],
  [{ kind: 'statement', text: W, highlights: ['climate'] }, ['text']],
  [{ kind: 'statement', text: W, note: '(Ontario)' }, ['text', 'note']],
  [{ kind: 'quoteOverlay', text: W }, ['text']],
  [{ kind: 'text', text: W, role: 'caption' }, ['text']],
  [
    { kind: 'defList', rows: [{ term: 'A', def: W }, { term: 'B', def: W }] },
    ['rows.0.term', 'rows.0.def', 'rows.1.term', 'rows.1.def'],
  ],
  [{ kind: 'bulletList', items: ['one', 'two', 'three'] }, ['items.0', 'items.1', 'items.2']],
  [
    { kind: 'bulletList', columns: 2, items: ['one', 'two', 'three', 'four'] },
    ['items.0', 'items.1', 'items.2', 'items.3'],
  ],
  [
    { kind: 'links', items: [{ label: 'Groundswell', note: 'seven workshops' }, { label: 'Coalitions' }] },
    ['items.0.label', 'items.0.note', 'items.1.label'],
  ],
  [
    { kind: 'credits', rows: [{ label: 'Author', value: 'A. N.' }, { label: 'Editor', value: 'B. M.' }] },
    ['rows.0.label', 'rows.0.value', 'rows.1.label', 'rows.1.value'],
  ],
  [{ kind: 'figure', imageRef: null, caption: W }, ['caption']],
  [
    { kind: 'chart', series: [{ label: 'Doing', sublabel: 'Actions', value: 40 }, { label: 'Being', value: 25 }] },
    ['series.0.label', 'series.0.sublabel', 'series.1.label'],
  ],
  [
    { kind: 'tocEntry', label: 'Summary', folio: 6, sections: [{ label: 'recruitment', qualifier: '(x)', folio: 7 }] },
    ['label', 'sections.0.label', 'sections.0.qualifier'],
  ],
  [
    { kind: 'cover', title: 'Tools for\nChange', subtitle: W, imageRef: null, wordmark: 'Le HUB' },
    ['title', 'subtitle'],
  ],
]

const deckOf = (leaves) => ({ lang: 'en', leaves, startFolio: 1, overlayOpacity: {} })
const digest = (ops) =>
  createHash('sha256')
    .update(JSON.stringify(ops, (k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v)))
    .digest('hex')

let checked = 0
for (const [block, expected] of CASES) {
  for (const bodySize of ['xs', 'l']) {
    const leaf = {
      id: 'lf',
      surface: 'paper',
      bodySize,
      chapter: 'Probe',
      full: block.kind === 'cover',
      bare: block.kind === 'cover',
      blocks: [{ id: 'bk', ...block }],
    }
    const deck = deckOf([leaf])
    const width = leaf.full ? PAGE_W * 2 : PAGE_W

    const off = recordLeaf(metrics, leaf, deck, width, measuringAssets(), { index: 0 })
    const on = recordLeaf(metrics, leaf, deck, width, measuringAssets(), { index: 0, regions: true })

    // 1. collecting changes nothing that gets drawn
    assert.equal(digest(on.ops), digest(off.ops), `${block.kind}/${bodySize}: ops changed`)
    assert.equal(off.regions.length, 0, `${block.kind}: regions leaked without the flag`)

    // 2. exactly the expected fields, once each
    const got = on.regions.map((r) => r.path.join('.')).sort()
    assert.deepEqual(got, [...expected].sort(), `${block.kind}/${bodySize}: wrong fields`)

    // every region must have a real box and a real size
    for (const r of on.regions) {
      assert.ok(r.rect.w > 0 && r.rect.h > 0, `${block.kind} ${r.path}: empty rect`)
      assert.ok(r.style.size > 0, `${block.kind} ${r.path}: no type size`)
    }
    checked += 1
  }
}

// 3. the fill-spacer probe must not contribute a second set
{
  const leaf = {
    id: 'lf',
    surface: 'paper',
    bodySize: 'xs',
    chapter: 'Probe',
    blocks: [
      { id: 'a', kind: 'para', text: W },
      { id: 'b', kind: 'spacer', height: 'fill' },
      { id: 'c', kind: 'credits', rows: [{ label: 'Author', value: 'A. N.' }] },
    ],
  }
  const { regions } = recordLeaf(metrics, leaf, deckOf([leaf]), PAGE_W, measuringAssets(), {
    index: 0,
    regions: true,
  })
  const keys = regions.map((r) => `${r.blockId}.${r.path.join('.')}`)
  assert.deepEqual(
    keys.sort(),
    ['a.text', 'c.rows.0.label', 'c.rows.0.value'],
    'the fill probe duplicated regions',
  )
}

// -- clearing a field must actually clear it -------------------------------
// The bug this pins: deleting the last character of a shared string splits it
// into { en: '', fr: <the original> }, and a resolver that treats '' as
// "missing" then falls back to the French — which is a copy of the English, not
// a translation of it. The deleted text reappeared on the page instantly, and
// no placeholder could ever be removed.
{
  const cleared = setLang('“There are lots of people…”', 'en', '')
  assert.equal(t(cleared, 'en'), '', 'clearing English leaves English empty')
  assert.equal(t(cleared, 'fr'), '“There are lots of people…”', 'the other language is untouched')

  // Absent still falls back, which is the behaviour the fallback exists for.
  assert.equal(t({ fr: 'Bonjour' }, 'en'), 'Bonjour', 'an unwritten translation shows the source')
  assert.equal(t(undefined, 'en'), '', 'nothing resolves to nothing')

  // Emptying both collapses back to a plain string rather than a pair of blanks.
  assert.equal(setLang(setLang('x', 'en', ''), 'fr', ''), '', 'both empty collapses to ""')

  // A deliberately empty translation counts as written; nagging about it would
  // be telling someone to translate a field they chose to leave out.
  assert.equal(isFullyTranslated({ en: 'Hi', fr: '' }), true, 'empty French is a decision')
  assert.equal(isFullyTranslated({ en: 'Hi' }), false, 'missing French is not')
}

// -- marks: the offsets must survive editing -------------------------------
// `remapMarks` is the only genuinely subtle thing in `doc/marks.ts`. A textarea
// edit is one contiguous replacement however it was made, so the change is
// recovered from the common prefix and suffix — and the *asymmetry* between how
// the two endpoints move is what stops a bold run swallowing the words typed
// after it.
{
  const bold = (from, to) => [{ from, to, b: true }]
  const only = (marks) => marks.map(({ from, to }) => [from, to])

  // "the [quick] fox"  — mark over "quick"
  const before = 'the quick fox'
  const m = bold(4, 9)

  assert.deepEqual(
    only(remapMarks(m, before, 'a the quick fox')),
    [[6, 11]],
    'inserting before the mark shifts it',
  )
  assert.deepEqual(
    only(remapMarks(m, before, 'the quick brown fox')),
    [[4, 9]],
    'typing immediately after a bold word is NOT bold',
  )
  // The mark travels with its word: the inserted text is outside it at the
  // start, exactly as the case above leaves it outside at the end.
  assert.deepEqual(
    only(remapMarks(m, before, 'the very quick fox')),
    [[9, 14]],
    'typing immediately before a bold word is NOT bold',
  )
  assert.deepEqual(
    only(remapMarks(m, before, 'the quiiick fox')),
    [[4, 11]],
    'typing inside a bold word extends it',
  )
  assert.deepEqual(remapMarks(m, before, 'the fox'), [], 'deleting the marked words drops the mark')
  // Typing over a whole bold word clears its bold. There is no pending-format
  // state in this model — marks are ranges over stored characters — so carrying
  // the formatting onto the replacement would mean guessing that the new words
  // wanted it, which is exactly the invisible state this design avoids.
  assert.deepEqual(remapMarks(m, before, 'the slow fox'), [], 'replacing the marked words clears it')
  assert.deepEqual(
    only(remapMarks(bold(4, 10), 'the quiick fox', 'the quick fox')),
    [[4, 9]],
    'fixing a typo inside a bold word keeps it bold',
  )

  // Toggling, splitting and merging.
  const text = 'one two three'
  const all = toggleFlag([], text, 0, text.length, 'b')
  assert.deepEqual(only(all), [[0, 13]], 'toggling on covers the selection')
  assert.deepEqual(only(toggleFlag(all, text, 4, 7, 'b')), [[0, 4], [7, 13]], 'toggling the middle out splits')
  assert.deepEqual(toggleFlag(all, text, 0, text.length, 'b'), [], 'toggling a fully-marked range clears it')

  assert.equal(activeAt(all, text, 0, 3).b, true, 'a fully bold selection reads as bold')
  assert.equal(
    activeAt(toggleFlag(all, text, 4, 7, 'b'), text, 0, 13).b,
    false,
    'a partly bold selection does not',
  )

  const linked = setHref([], text, 0, 3, 'https://example.org')
  assert.equal(activeAt(linked, text, 0, 3).href, 'https://example.org', 'a link reads back')
  assert.deepEqual(setHref(linked, text, 0, 3, null), [], 'clearing a link empties the marks')

  assert.deepEqual(
    only(normalizeMarks([{ from: 0, to: 3, b: true }, { from: 3, to: 6, b: true }], 10)),
    [[0, 6]],
    'abutting identical marks merge',
  )
  assert.deepEqual(normalizeMarks([{ from: 4, to: 9, b: true }], 2), [], 'marks clamp to the text')

  // Out-of-step marks must paint, not throw: a document edited in a second tab
  // is recoverable, a document that throws is a white screen.
  assert.deepEqual(toSegments('hi', [{ from: 0, to: 99, b: true }]), [{ b: true, text: 'hi' }])
  assert.deepEqual(toSegments('hi', []), [{ text: 'hi' }])
  assert.deepEqual(
    toSegments('abcd', [{ from: 1, to: 3, i: true }]),
    [{ text: 'a' }, { i: true, text: 'bc' }, { text: 'd' }],
  )
}

// -- marks: an unmarked field paints exactly as it always did ---------------
// The load-bearing equality of the whole feature. `paintRun` keeps the old
// `wrapText` + `drawLines` expression for a field with no marks, so a document
// written before rich text existed exports byte-identically — which is what
// made it safe to add marks to a transcription of a real report.
{
  const leafWith = (marks) => ({
    id: 'lf',
    surface: 'paper',
    bodySize: 'xs',
    chapter: 'Probe',
    blocks: [{ id: 'bk', kind: 'para', text: W, ...(marks ? { marks } : {}) }],
  })
  const opsOf = (leaf) =>
    recordLeaf(metrics, leaf, deckOf([leaf]), PAGE_W, measuringAssets(), { index: 0 })

  const plain = opsOf(leafWith(null))
  const emptyMap = opsOf(leafWith({ text: { en: [] } }))
  assert.equal(digest(plain.ops), digest(emptyMap.ops), 'an empty mark list must change nothing')

  const bolded = opsOf(leafWith({ text: { en: [{ from: 0, to: 12, b: true }] } }))
  assert.notEqual(digest(plain.ops), digest(bolded.ops), 'a bold mark must reach the ink')
  assert.ok(
    bolded.ops.some((op) => op.op === 'text' && op.style.font.includes('Neue Haas Grotesk Bd')),
    'bold must be drawn in the real bold cut, not a synthesised one',
  )

  // The region is the field's box either way: marks change ink, not geometry.
  const r1 = recordLeaf(metrics, leafWith(null), deckOf([leafWith(null)]), PAGE_W, measuringAssets(), { index: 0, regions: true })
  const l2 = leafWith({ text: { en: [{ from: 0, to: 12, b: true }] } })
  const r2 = recordLeaf(metrics, l2, deckOf([l2]), PAGE_W, measuringAssets(), { index: 0, regions: true })
  assert.equal(r2.regions.length, 1, 'a marked field still reports exactly one region')
  assert.deepEqual(
    r2.regions[0].path,
    r1.regions[0].path,
    'and reports it under the same path',
  )
}

console.log(`editing ok — ${checked} leaf variants, ops unchanged, fields exact, text clearable`)
