/**
 * Session migration checks — `npm run check:migrations`.
 *
 * Runs the real `migrate()` from `src/store/migrations.ts` (Node strips the
 * types) against a realistic stored payload from the previous schema. A silent
 * migration bug loses someone's document, so this asserts the properties that
 * actually matter rather than eyeballing a diff:
 *
 *   - no page is dropped, and order is preserved
 *   - ids survive, so `currentPageId` still resolves
 *   - element arrays survive untouched, including nested boxes
 *   - deck-level settings are carried across, and `pages` is gone
 *   - migrating twice is a no-op (the step is idempotent at v2)
 */
import assert from 'node:assert/strict'
import { CURRENT_VERSION, migrate } from '../src/store/migrations.ts'

/** What a real v1 session looked like: deck.pages, no `kind` anywhere. */
const v1 = {
  v: 1,
  currentPageId: 'pg_b',
  deck: {
    format: 'slide',
    paletteId: 'lime',
    paperIds: ['paper1'],
    paperOpacities: { paper1: 0.4 },
    pages: [
      {
        id: 'pg_a',
        templateId: 'slide-title',
        elements: [
          {
            id: 'el_1',
            kind: 'text',
            text: 'Tools for Change',
            variant: 'header',
            step: 8,
            align: 'left',
            vAlign: 'top',
            bg: 'outline',
            autoHeight: true,
            box: { col: 0, row: 1, colSpan: 12, rowSpan: 3 },
          },
        ],
      },
      {
        id: 'pg_b',
        paletteId: 'pink',
        elements: [
          {
            id: 'el_2',
            kind: 'image',
            imageRef: { kind: 'blob', id: 'img_9' },
            halftone: null,
            box: { col: 6, row: 0, colSpan: 6, rowSpan: 12 },
          },
        ],
      },
      { id: 'pg_c', elements: [] },
    ],
  },
}

const out = migrate(structuredClone(v1))

// -- version ----------------------------------------------------------------
assert.equal(out.v, CURRENT_VERSION, 'payload should be at the current version')

// -- no page lost, order preserved ------------------------------------------
assert.equal(out.deck.sections.length, 3, 'every page should become a section')
assert.deepEqual(
  out.deck.sections.map((s) => s.id),
  ['pg_a', 'pg_b', 'pg_c'],
  'section order must match page order',
)

// -- every section is static ------------------------------------------------
assert.ok(
  out.deck.sections.every((s) => s.kind === 'static'),
  'a migrated page is a static section',
)

// -- currentPageId still resolves -------------------------------------------
assert.ok(
  out.deck.sections.some((s) => s.id === out.currentPageId),
  'currentPageId must still point at something',
)

// -- content survives untouched ---------------------------------------------
assert.deepEqual(
  out.deck.sections[0].elements,
  v1.deck.pages[0].elements,
  'elements must survive byte-for-byte',
)
assert.deepEqual(
  out.deck.sections[1].elements[0].box,
  { col: 6, row: 0, colSpan: 6, rowSpan: 12 },
  'nested boxes must survive',
)
assert.equal(out.deck.sections[0].templateId, 'slide-title', 'templateId carries over')
assert.equal(out.deck.sections[1].paletteId, 'pink', 'per-page palette carries over')
assert.deepEqual(out.deck.sections[2].elements, [], 'an empty page stays an empty section')

// -- deck settings carried, old field gone ----------------------------------
assert.equal(out.deck.format, 'slide')
assert.equal(out.deck.paletteId, 'lime')
assert.deepEqual(out.deck.paperOpacities, { paper1: 0.4 })
assert.ok(!('pages' in out.deck), '`pages` must not survive on the deck')

// -- idempotent -------------------------------------------------------------
assert.deepEqual(migrate(structuredClone(out)), out, 'migrating an up-to-date payload is a no-op')

// -- degenerate input -------------------------------------------------------
const empty = migrate({ v: 1, currentPageId: 'x', deck: { ...v1.deck, pages: undefined } })
assert.deepEqual(empty.deck.sections, [], 'a v1 deck with no pages migrates to no sections')

console.log(`migrations ok — v1 → v${CURRENT_VERSION}, ${out.deck.sections.length} sections`)
