import type { Deck } from '../doc/types'

/**
 * Stored-session schema versions.
 *
 * v1  pages of freely-placed elements (the poster-derived model)
 * v2  sections — static pages and flow streams
 * v3  leaves — one A4 page each, spreads derived; the design system rebuilt
 *     from the Tools for Change file
 *
 * ## v3 does not migrate from v1 or v2
 *
 * It would be dishonest to try. A v2 document's content is expressed in a
 * vocabulary that no longer exists — `TextElement` with a `variant` and a grid
 * `Box`, palette roles, halftone parameters — and there is no mapping from a
 * notched-outline header on a 12×55 grid onto a block in a nine-column measure
 * that would produce a page anyone wanted. A migration that ran without error
 * and produced a scrambled document is worse than one that declines.
 *
 * So older sessions are dropped and the editor opens on the seed document. The
 * only thing lost is unsaved layout work in a design system that has been
 * deliberately replaced.
 */
export const CURRENT_VERSION = 3

export interface StoredV3 {
  v: 3
  deck: Deck
  leafIndex: number
}

/** Anything that might come out of storage. */
export type StoredAny = { v?: number } & Record<string, unknown>

/** Null when the payload predates v3 and cannot be meaningfully carried over. */
export function migrate(raw: StoredAny): StoredV3 | null {
  if (raw?.v !== CURRENT_VERSION) return null
  const stored = raw as unknown as StoredV3
  if (!stored.deck || !Array.isArray(stored.deck.leaves)) return null
  return stored
}
