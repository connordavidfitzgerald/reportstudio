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
