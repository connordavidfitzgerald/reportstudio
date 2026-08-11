import type { Deck, Page } from '../doc/types'
import type { Section } from '../doc/sections'

/**
 * Session schema migrations.
 *
 * Deliberately its own module with **type-only imports**, so it can be exercised
 * directly by `scripts/check-migrations.mjs` without dragging in the config and
 * asset graph. A migration bug destroys someone's document silently, weeks after
 * the change that caused it — this is the one part of persistence that should
 * never be verified by reasoning alone.
 */

/** A v1 payload: the deck held `pages` directly, before sections existed. */
export interface StoredV1 {
  v: 1
  deck: Omit<Deck, 'sections'> & { pages: Page[] }
  currentPageId: string
}

export interface StoredV2 {
  v: 2
  deck: Deck
  currentPageId: string
}

export type StoredAny = StoredV1 | StoredV2
export const CURRENT_VERSION = 2

/**
 * Bring any stored payload up to the current schema. Steps run in order, each
 * one taking the shape the previous left behind.
 *
 * **v1 → v2** introduced sections. Every v1 page becomes a static section, which
 * is a pure relabelling: a static section *is* its page (see `doc/sections.ts`),
 * so ids, elements, palettes and order carry over untouched and the restored
 * document is identical to the one that was saved.
 */
export function migrate(raw: StoredAny): StoredV2 {
  let cur: StoredAny = raw

  if (cur.v === 1) {
    const { pages, ...deck } = cur.deck
    cur = {
      v: 2,
      deck: {
        ...deck,
        sections: (pages ?? []).map((p): Section => ({ ...p, kind: 'static' })),
      },
      currentPageId: cur.currentPageId,
    }
  }

  return cur as StoredV2
}
