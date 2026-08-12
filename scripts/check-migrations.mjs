/**
 * Session migration checks — `npm run check:migrations`.
 *
 * v3 replaced the document model wholesale: leaves of blocks in a nine-column
 * measure, where v1/v2 had freely-placed elements on a grid of rows. There is
 * no honest mapping between them, so `migrate` *declines* older payloads rather
 * than converting them.
 *
 * That is a deliberate data-loss decision, so it gets pinned here — the failure
 * mode to guard against is someone later adding a lossy converter that appears
 * to work and silently scrambles a document.
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

// -- older schemas are declined, not mangled -------------------------------
for (const v of [1, 2, 3, 4]) {
  assert.equal(
    migrate({ v, deck: { pages: [{ id: 'p1', elements: [] }] } }),
    null,
    `v${v} is declined rather than converted`,
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
