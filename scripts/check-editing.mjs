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
 * **A region must say whether it wraps.** The editor asks `multiline` what
 * Return means, so the flag is made to prove itself against the painters: a
 * newline goes into every field of every kind, and either the run gets taller
 * or nothing on the page moves at all. A field that quietly swallowed the break
 * left the caret a line away from the words from that character on.
 *
 * Also covers `doc/localized.ts`, where treating an empty translation as a
 * missing one made every text field in the document impossible to clear, and
 * `wordAt`, which is what a double-click on the page means by "a word".
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { deriveContents } from '../src/doc/types.ts'
import { placementAt } from '../src/components/canvas/useBlockDrag.ts'
import { recordLeaf } from '../src/render/leaf.ts'
import { fieldText, patchAt } from '../src/doc/fieldValue.ts'
import { wordAt } from '../src/components/canvas/textOverlay.ts'
import { measuringAssets } from '../src/render/measureCtx.ts'
import { CONTENT_BOTTOM, GAP, PAGE_H, PAGE_W } from '../src/config/brand.ts'
import { isFullyTranslated, setLang, t } from '../src/doc/localized.ts'
import {
  activeAt,
  normalizeMarks,
  phraseMarks,
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
  [{ kind: 'statement', text: W, marks: phraseMarks(W, ['climate']) }, ['text']],
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
    { kind: 'table', header: true, widths: [2, 1, 1], rows: [['Region', 'Orgs', 'Talks'], ['Ontario', '4', '9']] },
    ['rows.0.0', 'rows.0.1', 'rows.0.2', 'rows.1.0', 'rows.1.1', 'rows.1.2'],
  ],
  [
    { kind: 'chart', series: [{ label: 'Doing', sublabel: 'Actions', value: 40 }, { label: 'Being', value: 25 }] },
    // `value` is a region now, and a numeric one — the number on a bar chart
    // is typed on the page like everything else. See `TextRegion.numeric`.
    ['series.0.label', 'series.0.sublabel', 'series.0.value', 'series.1.label', 'series.1.value'],
  ],
  [
    { kind: 'tocEntry', label: 'Summary', folio: 6, sections: [{ label: 'recruitment', qualifier: '(x)', folio: 7 }] },
    ['label', 'sections.0.label', 'sections.0.qualifier'],
  ],
  // A contents block reads the document and offers no fields of its own: its
  // words belong to the pages' chapters, and a caret in one would be lost on
  // the next repaint.
  [{ kind: 'contents' }, []],
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

    // `numeric` marks exactly the fields that hold numbers, and nothing else.
    // The editor keys off it to take digits rather than words, so a text field
    // wrongly carrying it would refuse letters — and a numeric field without it
    // would try to write a string where a number belongs.
    const numbered = on.regions.filter((r) => r.numeric).map((r) => r.path.join('.')).sort()
    assert.deepEqual(
      numbered,
      expected.filter((p) => p.endsWith('.value') && block.kind === 'chart').sort(),
      `${block.kind}/${bodySize}: wrong numeric fields`,
    )

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

// -- `multiline` must tell the truth ---------------------------------------
// A region says whether the painter will honour a newline in it, and the editor
// believes it: where it is absent, Return means "done" instead of a line break.
// The bug that bought this was Return in a credit — the editor took the newline,
// the page could not draw one, and every character typed after it was a line
// away from the glyph it belonged to, so the caret and the words stopped
// agreeing. Here the claim is made to prove itself: put a newline in the field
// and the run it was typed into gets taller, or nothing moves at all.
//
// The region's own box is what is measured, not the block's. Some blocks are a
// fixed height whatever is set in them — a subhead is rule/label/rule at 23.2pt,
// a cover is a page — and a newline in one of those still breaks the line it was
// typed on, which is all the caret needs to stay on its glyphs.
{
  for (const [block, expected] of CASES) {
    if (!expected.length) continue
    const leaf = {
      id: 'lf',
      surface: 'paper',
      bodySize: 'xs',
      chapter: 'Probe',
      full: block.kind === 'cover',
      bare: block.kind === 'cover',
      blocks: [{ id: 'bk', ...block }],
    }
    const width = leaf.full ? PAGE_W * 2 : PAGE_W
    const paint = (b) => {
      const l = { ...leaf, blocks: [b] }
      return recordLeaf(metrics, l, deckOf([l]), width, measuringAssets(), {
        index: 0,
        regions: true,
      })
    }
    const base = paint(leaf.blocks[0])

    for (const region of base.regions) {
      // A number has no line to break, and the editor never offers one.
      if (region.numeric) continue
      const was = fieldText(leaf.blocks[0], region.path, 'en')
      if (!was) continue
      // Appended rather than inserted: a break in the middle of a run that
      // already wraps can land where the wrap was anyway, which proves nothing.
      // A trailing one always costs a painter that honours it exactly one line.
      const broken = { ...leaf.blocks[0], ...patchAt(leaf.blocks[0], region.path, `${was}\nx`) }
      const key = region.path.join('.')
      const after = paint(broken).regions.find((r) => r.path.join('.') === key)
      const grew = (after?.rect.h ?? 0) - region.rect.h
      const where = `${block.kind} ${key}`
      if (region.multiline) {
        assert.ok(grew > 0.5, `${where}: says it wraps, but a newline changed nothing on the page`)
      } else {
        assert.ok(
          Math.abs(grew) < 0.5,
          `${where}: a newline moved the run by ${grew.toFixed(1)}, so the region should say multiline`,
        )
      }
    }
  }
}

// -- double-click takes a word ---------------------------------------------
// The browser does this inside a textarea; over a canvas it has to be said out
// loud, because the gesture is resolved before there is a textarea to ask.
{
  const W2 = 'the quick brown fox'
  const word = (i) => {
    const { from, to } = wordAt(W2, i)
    return W2.slice(from, to)
  }
  assert.equal(word(0), 'the', 'the first character takes the first word')
  assert.equal(word(6), 'quick', 'inside a word takes that word')
  assert.equal(word(9), 'quick', 'the far edge of a word still takes it')
  assert.equal(word(W2.length), 'fox', 'the end of the text takes the last word')
  assert.equal(word(4), 'quick', 'the near edge of a word takes it, not the space before')
  assert.equal(wordAt('', 0).to, 0, 'an empty field has no word to take')
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

// -- what a drag promises, the compositor delivers -------------------------
// `placementAt` decides where a dragged block will land by reading the rects the
// painter last returned. Nothing forces its arithmetic and the painter's to
// agree, so this drags a block for real and checks the page it produces: the
// promise made to the pointer has to be the page you get, or a block settles a
// few points off wherever it was dropped and no amount of care with the gesture
// will fix it.
{
  const para = (id, text) => ({ id, kind: 'para', text })
  const leafOf = (blocks) => ({ id: 'lf', surface: 'paper', bodySize: 'xs', chapter: 'Probe', blocks })
  const paint = (leaf) => recordLeaf(metrics, leaf, deckOf([leaf]), PAGE_W, measuringAssets(), { index: 0 })

  const blocks = [para('b0', W), para('b1', W), para('b2', W)]
  const first = paint(leafOf(blocks))
  const geomOf = (r) => ({
    height: PAGE_H,
    width: PAGE_W,
    pageWpt: PAGE_W,
    origin: r.origin,
    el: null,
    placed: r.placed,
  })

  /** Apply a placement exactly as `useDeck.moveBlockTo` does. */
  const apply = (blocks, id, target) => {
    const tops = new Map(target.pins.map((p) => [p.id, p.top]))
    const rest = blocks
      .filter((b) => b.id !== id)
      .map((b) => {
        const top = tops.get(b.id)
        return top === undefined || b.top !== undefined ? b : { ...b, top }
      })
    const next = [...rest]
    next.splice(target.at, 0, { ...blocks.find((b) => b.id === id), top: target.top })
    return next
  }

  for (const [label, id, dy] of [
    ['nudged down', 'b1', 40],
    ['pushed well down', 'b1', 120],
    ['the first block pushed down', 'b0', 60],
    ['dragged far down the page', 'b1', 400],
    ['dragged to the top', 'b2', -400],
    ['dropped where it already was', 'b1', 0],
  ]) {
    const from = first.placed.find((p) => p.block.id === id).rect
    const target = placementAt(geomOf(first), 0, id, from.y + dy)
    const next = apply(blocks, id, target)
    const after = paint(leafOf(next))
    const landed = after.placed.find((p) => p.block.id === id).rect

    assert.equal(
      next.findIndex((b) => b.id === id),
      target.at,
      `${label}: the block ends up at the index the drag resolved`,
    )
    // The one that matters: what the pointer was promised is what gets painted.
    assert.ok(
      Math.abs(landed.y - target.topPx) < 0.5,
      `${label}: promised y ${target.topPx.toFixed(1)}, painted ${landed.y.toFixed(1)}`,
    )
    assert.ok(target.top >= first.origin - 0.5, `${label}: never above the flow's own start`)
    // The margin is the page. However far down the pointer goes, a drop leaves
    // the whole block inside the type area — a block that fits cannot be hung
    // off the foot of it.
    assert.ok(
      landed.y + landed.h <= CONTENT_BOTTOM + 0.5,
      `${label}: foot at ${(landed.y + landed.h).toFixed(1)} is past the bottom margin`,
    )
  }

  // -- and nothing else on the page moves ------------------------------------
  // The whole reason a block names a top rather than a gap. Dragging one
  // component down used to carry everything below it down too, so placing the
  // second thing moved the first; the pins are what stop that, and this is the
  // assertion that they do.
  {
    const from = first.placed.find((p) => p.block.id === 'b1').rect
    const target = placementAt(geomOf(first), 0, 'b1', from.y + 120)
    const after = paint(leafOf(apply(blocks, 'b1', target)))

    for (const id of ['b0', 'b2']) {
      const before = first.placed.find((p) => p.block.id === id).rect.y
      const now = after.placed.find((p) => p.block.id === id).rect.y
      assert.ok(
        Math.abs(now - before) < 0.5,
        `dragging b1 down left ${id} where it was: ${before.toFixed(1)} → ${now.toFixed(1)}`,
      )
    }
    assert.ok(
      after.placed.find((p) => p.block.id === 'b1').rect.y > from.y,
      'and the block that was dragged is the one that moved',
    )
  }

  // -- a top is a floor, not a coordinate ------------------------------------
  // The guarantee that keeps a mis-stacked page unrepresentable: a top above
  // where the flow has already got to is ignored, so two components cannot be
  // made to overlap and nothing can be pinned off the top of the measure.
  {
    const above = paint(leafOf([blocks[0], { ...blocks[1], top: 0 }, blocks[2]]))
    const plain = paint(leafOf(blocks))
    for (const id of ['b0', 'b1', 'b2']) {
      assert.ok(
        Math.abs(
          above.placed.find((p) => p.block.id === id).rect.y -
            plain.placed.find((p) => p.block.id === id).rect.y,
        ) < 0.5,
        `a top above the flow changes nothing about ${id}`,
      )
    }

    // And one below it does exactly what it says.
    const pushed = paint(leafOf([blocks[0], { ...blocks[1], top: 400 }, blocks[2]]))
    assert.ok(
      Math.abs(pushed.placed.find((p) => p.block.id === 'b1').rect.y - 400) < 0.5,
      'a top below the flow is where the block goes',
    )
    assert.ok(
      pushed.placed.find((p) => p.block.id === 'b2').rect.y >= 400 + GAP.block,
      'and the unpinned block after it still flows from underneath it',
    )
  }
}

// -- the contents fills itself in from the document -----------------------
{
  const leaf = (over) => ({ id: `lf_${Math.random()}`, surface: 'paper', bodySize: 'xs', blocks: [], ...over })
  const of = (leaves, startFolio = 1) =>
    deriveContents({ lang: 'en', leaves, startFolio, overlayOpacity: {} }, 'en')

  // Chapters appear once, in the order the document first uses them, numbered
  // by the first page that carries them.
  const rows = of([
    leaf({ chapter: 'Executive summary' }),
    leaf({ chapter: 'Executive summary' }),
    leaf({ chapter: 'Methodology', section: 'Data collection' }),
    leaf({ chapter: 'Methodology', section: 'Data analysis' }),
    leaf({ chapter: 'Methodology', section: 'Data analysis' }),
  ])
  assert.deepEqual(rows.map((r) => r.label), ['Executive summary', 'Methodology'])
  assert.deepEqual(rows.map((r) => r.folio), [1, 3], 'a chapter takes the folio of its first page')
  assert.deepEqual(
    rows[1].sections.map((s) => [s.label, s.folio]),
    [['Data collection', 3], ['Data analysis', 4]],
    'sections are listed once each, under their chapter, at their first page',
  )

  // A section equal to its chapter is not a row: `runningHeadOf` already treats
  // the two as one, and listing both would say the same thing twice.
  assert.deepEqual(of([leaf({ chapter: 'Methodology', section: 'Methodology' })])[0].sections, [])

  // A contents page does not list itself.
  const withToc = of([
    leaf({ chapter: 'Table of contents', blocks: [{ id: 'bk', kind: 'contents' }] }),
    leaf({ chapter: 'Introduction' }),
  ])
  assert.deepEqual(withToc.map((r) => r.label), ['Introduction'])

  // Pages that print no folio — a cover, a bare plate — give a row no number
  // rather than a wrong one.
  const bare = of([leaf({ chapter: 'Statement', bare: true })])
  assert.equal(bare[0].folio, null, 'a bare plate contributes no page number')

  // And the numbers follow the document: insert a spread and they move.
  const before = of([leaf({ chapter: 'A' }), leaf({ chapter: 'B' })])
  const after = of([leaf({ chapter: 'A' }), leaf({}), leaf({}), leaf({ chapter: 'B' })])
  assert.equal(before[1].folio, 2)
  assert.equal(after[1].folio, 4, 'adding pages before a chapter renumbers it')
}

// -- the highlight flag behaves like every other mark ----------------------
// It is the newest flag and the only one that paints a rectangle as well as
// ink, so the risk is that it is special-cased somewhere the others are not.
{
  const text = 'one two three'

  // Toggling is symmetric, and does not disturb a flag it overlaps.
  const bold = toggleFlag([], text, 0, 7, 'b')
  const both = toggleFlag(bold, text, 4, 13, 'h')
  assert.equal(activeAt(both, text, 4, 7).b, true, 'bold survives a highlight over it')
  assert.equal(activeAt(both, text, 4, 7).h, true, 'and the highlight is there too')
  assert.equal(activeAt(both, text, 8, 13).b, false, 'highlight alone where bold ended')
  const off = toggleFlag(both, text, 4, 13, 'h')
  assert.deepEqual(off, bold, 'toggling twice returns exactly what was there')

  // "On" means every character, which is what makes a second press extend
  // rather than clear a partly-highlighted selection.
  assert.equal(activeAt(both, text, 0, 13).h, false, 'a partly highlighted range is not highlighted')
  assert.equal(activeAt(both, text, 4, 13).h, true, 'a wholly highlighted one is')

  // Offsets are carried across an edit like any other mark.
  const marked = toggleFlag([], text, 4, 7, 'h')
  const moved = remapMarks(marked, text, 'zero one two three')
  const after = 'zero one two three'
  assert.equal(
    after.slice(moved[0].from, moved[0].to),
    'two',
    'a highlight stays on its word when text is inserted before it',
  )
  assert.equal(moved[0].h, true, 'and is still a highlight')

  // Typing at the end of a highlighted word must not extend it — the same
  // asymmetry `remapMarks` maintains for bold.
  const grown = remapMarks(marked, text, 'one twoX three')
  assert.equal('one twoX three'.slice(grown[0].from, grown[0].to), 'two', 'the highlight does not grow')

  // And it reaches the ink, as a swash.
  const seg = toSegments(text, marked).find((s) => s.text === 'two')
  assert.equal(seg.h, true, 'toSegments carries the flag through to the painter')
}

// -- a highlight paints something a plain run does not ---------------------
{
  const leafWith = (marks) => ({
    id: 'lf',
    surface: 'paper',
    bodySize: 'xs',
    chapter: 'Probe',
    blocks: [{ id: 'bk', kind: 'statement', text: W, ...(marks ? { marks } : {}) }],
  })
  const opsOf = (leaf) =>
    recordLeaf(metrics, leaf, deckOf([leaf]), PAGE_W, measuringAssets(), { index: 0 })

  const plain = opsOf(leafWith(null))
  const lit = opsOf(leafWith(phraseMarks(W, ['climate'])))
  assert.notEqual(digest(plain.ops), digest(lit.ops), 'a highlight must reach the page')
  const rects = (r) => r.ops.filter((op) => op.op === 'rect').length
  assert.ok(
    rects(lit) > rects(plain),
    'and it must do so as a filled bar, not only as different ink',
  )
}

console.log(`editing ok — ${checked} leaf variants, ops unchanged, fields exact, text clearable`)
