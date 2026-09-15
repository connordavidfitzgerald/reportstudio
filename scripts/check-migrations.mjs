/**
 * Session migration checks — `npm run check:migrations`.
 *
 * Two opposite failure modes are pinned here.
 *
 * **Don't convert what can't be converted.** v3 replaced the document model
 * wholesale: leaves of blocks in a nine-column measure, where v1/v2 had freely-
 * placed elements on a grid of rows. There is no honest mapping between them,
 * so `migrate` declines those payloads. The risk is someone later adding a
 * lossy converter that appears to work and silently scrambles a document.
 *
 * **Don't drop what can be carried.** From v6 a stored document is a client's
 * report, and the habit of bumping the version to invalidate the seed would
 * now destroy the only copy of their work. Every version from
 * `FIRST_MIGRATABLE` up must survive.
 */
import assert from 'node:assert/strict'
import { CURRENT_VERSION, migrate } from '../src/store/migrations.ts'

const leaf = {
  id: 'lf_1',
  surface: 'paper',
  bodySize: 'xs',
  blocks: [{ id: 'bk_1', kind: 'para', text: 'Body copy.' }],
}

const payload = () => ({
  v: CURRENT_VERSION,
  deck: { lang: 'en', leaves: [leaf], startFolio: 1, overlayOpacity: {} },
  leafIndex: 0,
})

// -- current payloads round-trip -------------------------------------------
{
  const out = migrate(payload())
  assert.ok(out, 'a current payload survives')
  assert.equal(out.deck.leaves.length, 1)
  assert.equal(out.deck.leaves[0].blocks[0].text, 'Body copy.', 'block content is untouched')
  assert.deepEqual(migrate(migrate(payload())), out, 'migrating twice is a no-op')
}

// -- the poster-derived and mid-transcription schemas are declined ----------
for (const v of [1, 2, 3, 4, 5]) {
  assert.equal(
    migrate({ v, deck: { pages: [{ id: 'p1', elements: [] }] } }),
    null,
    `v${v} is declined rather than converted`,
  )
}

// -- every schema since v6 is carried forward, never dropped ---------------
// The regression this exists to catch: bumping CURRENT_VERSION for a seed fix
// and thereby wiping the client's saved report on their next visit.
for (let v = 6; v <= CURRENT_VERSION; v++) {
  const out = migrate({ ...payload(), v })
  assert.ok(out, `v${v} is carried forward rather than dropped`)
  assert.equal(out.v, CURRENT_VERSION, `v${v} is stamped with the current version`)
  assert.equal(out.deck.leaves.length, 1, `v${v} keeps its pages`)
  assert.equal(
    out.deck.leaves[0].blocks[0].text,
    'Body copy.',
    `v${v} keeps its content verbatim`,
  )
}

// -- v7 → v8: the running head becomes a chapter ---------------------------
// The second assertion is the load-bearing one. `render/compose.ts` starts the
// content column 37pt higher on a leaf with no running head, so a migration
// that invented a chapter for every leaf would shift every headless page in
// every saved document — a silent, document-wide reflow.
{
  const headed = migrate({
    ...payload(),
    v: 7,
    deck: {
      lang: 'en',
      leaves: [{ ...leaf, runningHead: 'Executive Summary' }],
      startFolio: 1,
      overlayOpacity: {},
    },
  })
  const l = headed.deck.leaves[0]
  assert.equal(l.chapter, 'Executive Summary', 'the running head becomes the chapter')
  assert.equal(l.section, undefined, 'and not the section, which prints the same either way')
  assert.equal(l.runningHead, undefined, 'the old field is gone, not merely shadowed')

  assert.equal(
    migrate({ ...payload(), v: 7 }).deck.leaves[0].chapter,
    undefined,
    'a leaf with no head stays headless',
  )
}

// -- v8 → v9: highlights become marks, and indent inverts ------------------
// Both halves are default *inversions*, which is the one kind of change that
// cannot be left to the reader: a document written under the old default and
// painted under the new one is silently a different document.
{
  const v8 = (blocks) =>
    migrate({
      ...payload(),
      v: 8,
      deck: { lang: 'en', leaves: [{ ...leaf, blocks }], startFolio: 1, overlayOpacity: {} },
    }).deck.leaves[0].blocks

  // Phrases resolve to the offsets the painter was already drawing at.
  {
    const text = 'Le HUB spoke with 21 organizers across 6 provinces.'
    const [b] = v8([
      { id: 'bk_s', kind: 'statement', text, highlights: ['21 organizers', '6 provinces'] },
    ])
    assert.equal(b.highlights, undefined, 'the old field is gone, not merely shadowed')
    const marks = b.marks.text.en
    assert.equal(marks.length, 2, 'one mark per phrase that was found')
    for (const m of marks) assert.equal(m.h, true, 'and they are highlights')
    assert.equal(text.slice(marks[0].from, marks[0].to), '21 organizers')
    assert.equal(text.slice(marks[1].from, marks[1].to), '6 provinces')
  }

  // A phrase that no longer occurs was already not being painted. It is
  // dropped rather than carried as a mark that could never appear.
  {
    const [b] = v8([
      { id: 'bk_s', kind: 'statement', text: 'Nothing matches here.', highlights: ['21 organizers'] },
    ])
    assert.equal(b.marks, undefined, 'an unmatched phrase leaves no mark behind')
  }

  // The same word twice: the second phrase matches *after* the first, which is
  // the rule the old painter used as it consumed the string left to right.
  {
    const text = 'six and six'
    const [b] = v8([{ id: 'bk_s', kind: 'statement', text, highlights: ['six', 'six'] }])
    const marks = b.marks.text.en
    assert.deepEqual(
      marks.map((m) => [m.from, m.to]),
      [[0, 3], [8, 11]],
      'each phrase is used once, in order',
    )
  }

  // Indent: absent used to mean indented, so absent must become explicit.
  {
    const [a, b, c] = v8([
      { id: 'bk_a', kind: 'para', text: 'Relying on the old default.' },
      { id: 'bk_b', kind: 'para', text: 'Deliberately flush.', indent: false },
      { id: 'bk_c', kind: 'para', text: 'Deliberately indented.', indent: true },
    ])
    assert.equal(a.indent, true, 'a paragraph that was indented by default still is')
    assert.equal(b.indent, false, 'an explicitly flush paragraph is left alone')
    assert.equal(c.indent, true, 'an explicitly indented one is left alone')
  }

  // A new paragraph, made now, is flush — that is the point of the inversion.
  {
    const [fresh] = migrate(payload()).deck.leaves[0].blocks
    assert.equal(fresh.indent, undefined, 'v9 payloads are not rewritten on read')
  }
}

// -- v9 → v10: gapBefore is dropped ----------------------------------------
// It is not converted, and the check is that it is *gone* rather than carried
// as a field the compositor no longer reads — a stale `gapBefore` sitting in a
// saved document would be invisible until someone wrote code that trusted it.
{
  const v9 = (blocks) =>
    migrate({
      ...payload(),
      v: 9,
      deck: { lang: 'en', leaves: [{ ...leaf, blocks }], startFolio: 1, overlayOpacity: {} },
    }).deck.leaves[0].blocks

  const [a, b] = v9([
    { id: 'bk_a', kind: 'para', text: 'Dragged down the page.', gapBefore: 30 },
    { id: 'bk_b', kind: 'para', text: 'Never touched.' },
  ])
  assert.equal(a.gapBefore, undefined, 'the old field is gone, not merely shadowed')
  assert.equal(a.top, undefined, 'and is not guessed at as a top edge')
  assert.equal(a.text, 'Dragged down the page.', 'the block is otherwise untouched')
  assert.equal(b.text, 'Never touched.', 'a block that never had one is left alone')

  // A top written by the current editor is not a thing to migrate.
  const [kept] = migrate({
    ...payload(),
    deck: {
      lang: 'en',
      leaves: [{ ...leaf, blocks: [{ id: 'bk_t', kind: 'para', text: 'Placed.', top: 288 }] }],
      startFolio: 1,
      overlayOpacity: {},
    },
  }).deck.leaves[0].blocks
  assert.equal(kept.top, 288, 'v10 payloads are not rewritten on read')
}

// -- junk is declined ------------------------------------------------------
assert.equal(migrate({}), null, 'a payload with no version is declined')
assert.equal(migrate({ v: CURRENT_VERSION }), null, 'a payload with no deck is declined')
assert.equal(
  migrate({ v: CURRENT_VERSION, deck: { lang: 'en' } }),
  null,
  'a deck with no leaves array is declined',
)
assert.equal(
  migrate({ v: 99, deck: { leaves: [leaf] } }),
  null,
  'a payload from the future is declined rather than assumed compatible',
)

console.log('check:migrations — ok')
