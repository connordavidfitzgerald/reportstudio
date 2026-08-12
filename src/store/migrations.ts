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
/**
 * v4 exists only to drop v3 sessions.
 *
 * The seed document *is* the transcription, and it is still being corrected
 * against the Figma. A saved session takes precedence over the seed on reload,
 * so during this phase every fix to the reference pages was invisible behind
 * whatever had been persisted on the previous visit — which read as the fix
 * not working. Bumping the version each time the seed changes materially is
 * the honest way to keep what you see and what the code says in step.
 *
 * Once the transcription settles, this stops moving and real documents start
 * surviving upgrades.
 */
export const CURRENT_VERSION = 6

/** The current stored payload. Deliberately unversioned in its *name* — the
 * version lives in the field, and renaming the type on every bump was churn. */
export interface Stored {
  v: typeof CURRENT_VERSION
  deck: Deck
  leafIndex: number
}

/** Anything that might come out of storage. */
export type StoredAny = { v?: number } & Record<string, unknown>

/** Null when the payload predates the current version and can't be carried over. */
export function migrate(raw: StoredAny): Stored | null {
  if (raw?.v !== CURRENT_VERSION) return null
  const stored = raw as unknown as Stored
  if (!stored.deck || !Array.isArray(stored.deck.leaves)) return null
  return stored
}
