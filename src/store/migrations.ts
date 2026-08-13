import type { Deck, Leaf } from '../doc/types'
import type { LocalizedText } from '../doc/localized'

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
 * v4 and v5 existed only to drop the version before them.
 *
 * The seed document *is* the transcription, and while it was still being
 * corrected against the Figma a saved session took precedence over the seed on
 * reload — so every fix to the reference pages was invisible behind whatever
 * had been persisted on the previous visit, which read as the fix not working.
 * Bumping the version each time the seed changed was the honest way to keep
 * what you see and what the code says in step.
 *
 * **That phase is over.** From v6 onwards a stored document is somebody's work,
 * and discarding it to refresh the seed would be discarding the only copy. The
 * seed is now just what a *new* document starts from.
 */
/**
 * v7 → v8 replaced the free-text running head with a chapter and a section.
 * See {@link STEPS}.
 */
export const CURRENT_VERSION = 8

/**
 * The oldest version {@link migrate} will carry forward.
 *
 * Everything below it is the poster-derived model or a mid-transcription
 * session and is declined, per the note above. Everything from here up is
 * carried: the versions since have only *added* optional fields, and
 * `loadSession` spreads a stored deck over fresh defaults, so a document
 * written before a field existed loads with that field present.
 *
 * v6 → v7 added the document's name.
 */
const FIRST_MIGRATABLE = 6

/** The current stored payload. Deliberately unversioned in its *name* — the
 * version lives in the field, and renaming the type on every bump was churn. */
export interface Stored {
  v: typeof CURRENT_VERSION
  deck: Deck
  leafIndex: number
}

/** Anything that might come out of storage. */
export type StoredAny = { v?: number } & Record<string, unknown>

/** A leaf as it was written before v8. */
type LegacyLeaf = Leaf & { runningHead?: LocalizedText }

/**
 * One conversion, keyed by the version it produces.
 *
 * Applied in ascending order for every step *above* the payload's own version,
 * so a v6 document walks 7 then 8. Steps that only added an optional field need
 * no entry: `loadSession` spreads a stored deck over fresh defaults, so a
 * document written before a field existed loads with that field present.
 */
const STEPS: Record<number, (deck: Deck) => Deck> = {
  /**
   * `runningHead` becomes `chapter`.
   *
   * Chapter rather than section, because the old field was always chapter-level
   * in practice — the seed's heads are 'Executive summary', 'Methodology',
   * 'Findings and implications' — and `runningHeadOf` prints it either way. A
   * leaf that had no head must come out with *neither* field set: a headless
   * page starts its content column 37pt higher, so inventing a chapter here
   * would shift every such page in every saved document.
   */
  8: (deck) => ({
    ...deck,
    leaves: deck.leaves.map((leaf) => {
      const { runningHead, ...rest } = leaf as LegacyLeaf
      return runningHead === undefined ? (rest as Leaf) : { ...(rest as Leaf), chapter: runningHead }
    }),
  }),
}

/** Null when the payload predates {@link FIRST_MIGRATABLE} and can't be carried over. */
export function migrate(raw: StoredAny): Stored | null {
  const v = raw?.v
  if (typeof v !== 'number') return null
  // A payload from a future build is declined rather than assumed compatible:
  // this code cannot know what it would have to undo.
  if (v < FIRST_MIGRATABLE || v > CURRENT_VERSION) return null
  const stored = raw as unknown as Stored
  if (!stored.deck || !Array.isArray(stored.deck.leaves)) return null

  let deck = stored.deck
  for (let step = v + 1; step <= CURRENT_VERSION; step += 1) {
    deck = STEPS[step]?.(deck) ?? deck
  }
  return { ...stored, deck, v: CURRENT_VERSION }
}
