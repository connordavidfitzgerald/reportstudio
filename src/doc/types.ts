import type { ImageRef } from './imageStore'
import type { BodySizeId, SurfaceId } from '../config/brand'
import type { Block } from './blocks'
import type { Lang, LocalizedText } from './localized'

/**
 * A **leaf** is one A4 page. It is the unit the document is authored in and the
 * unit that is composed.
 *
 * A **spread** is two leaves shown side by side. It is the unit the editor
 * displays and the unit the cover is designed on — but it is *derived*, not
 * stored, so inserting a page never has to re-pair everything after it.
 */
export interface Leaf {
  id: string

  /**
   * This leaf is the full 1190pt spread rather than one 595pt page.
   *
   * Only the cover is. Its nine columns are 117.1pt instead of 51 — the same
   * grid stretched to the wider measure — so a cover composed on it is still on
   * a grid rather than placed by eye.
   */
  full?: boolean

  surface: SurfaceId

  /**
   * The running head, repeated at the top of every leaf in a section.
   *
   * Stored per leaf rather than derived from a section title because the file
   * does exactly that: the exec-summary running head persists onto the
   * introduction's first leaf. Deriving it would have been tidier and wrong.
   */
  runningHead?: LocalizedText

  /**
   * Suppress the furniture — running head, folio, both rules. True on the cover
   * and on full-bleed plates, which run their image to the trim.
   */
  bare?: boolean

  /**
   * Body size for running text on this leaf. See the note in `config/brand.ts`:
   * this is an editorial choice per page, not a constant, and it is the axis the
   * old model could not express.
   */
  bodySize: BodySizeId

  /**
   * A full-bleed image behind the content, running to the trim.
   *
   * `inset` holds one edge back to the margin instead, which the contents-
   * facing plate does on its spine side — the paper shows as a 40pt strip and
   * the photograph bleeds off the other three edges.
   */
  plate?: {
    imageRef: ImageRef | null
    focus?: { x: number; y: number }
    inset?: 'left' | 'right'
  }

  /** Paint order — later blocks stack below earlier ones. */
  blocks: Block[]

  /** Which template seeded this leaf, for reference and for re-applying. */
  templateId?: string
}

export interface Deck {
  /**
   * Which language edition is being typeset. One layout, two PDFs — see
   * `doc/localized.ts`.
   */
  lang: Lang

  /** Every page, in reading order. */
  leaves: Leaf[]

  /** Folio printed on the first leaf. The cover carries none. */
  startFolio: number

  /**
   * Opacity of the two soft-light overlays, keyed by the ids in
   * `brand.OVERLAYS`. Zero switches one off.
   */
  overlayOpacity: Record<string, number>
}

/**
 * A spread as the editor shows it.
 *
 * `full` spreads hold one leaf across both halves; every other spread holds a
 * left and an optional right (the last spread of an odd-length document has no
 * right-hand leaf).
 */
export type Spread =
  | { kind: 'full'; leaf: Leaf; index: number }
  | { kind: 'pair'; left: Leaf; right: Leaf | null; index: number }

/**
 * Pair the leaves up for display.
 *
 * A `full` leaf consumes a whole spread on its own and resets the pairing, so
 * the cover doesn't push every subsequent verso onto a recto. Memoised on the
 * leaves array identity — every store mutator rebuilds that array when and only
 * when the document changes.
 */
const spreadCache = new WeakMap<readonly Leaf[], Spread[]>()

export function deckSpreads(deck: Deck): Spread[] {
  const cached = spreadCache.get(deck.leaves)
  if (cached) return cached

  const spreads: Spread[] = []
  for (let i = 0; i < deck.leaves.length; ) {
    const leaf = deck.leaves[i]
    if (leaf.full) {
      spreads.push({ kind: 'full', leaf, index: i })
      i += 1
    } else {
      spreads.push({ kind: 'pair', left: leaf, right: deck.leaves[i + 1] ?? null, index: i })
      i += 2
    }
  }
  spreadCache.set(deck.leaves, spreads)
  return spreads
}

/**
 * The folio printed on a leaf, or null where none is.
 *
 * Counted over every leaf including bare ones, because the file numbers the
 * physical pages — a full-bleed plate still occupies a page number even though
 * it doesn't print one. The cover is excluded from the count entirely.
 */
export function folioOf(deck: Deck, index: number): number | null {
  const leaf = deck.leaves[index]
  if (!leaf || leaf.full || leaf.bare) return null
  const covers = deck.leaves.slice(0, index).filter((l) => l.full).length
  return deck.startFolio + index - covers
}

export const leafById = (deck: Deck, id: string): Leaf | undefined =>
  deck.leaves.find((l) => l.id === id)

let seq = 0
export const leafId = (): string => `lf_${Date.now().toString(36)}_${(seq++).toString(36)}`
