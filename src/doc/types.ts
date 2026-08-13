import type { ImageRef } from './imageStore'
import type { BodySizeId, SurfaceId } from '../config/brand'
import type { Block } from './blocks'
import { t, type Lang, type LocalizedText } from './localized'

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
   * Which chapter this leaf belongs to: one of {@link CHAPTER_PRESETS} or a
   * title typed for this document.
   *
   * Stored per leaf rather than derived from where the chapter openers fall,
   * because the file does exactly that: the exec-summary head persists onto the
   * introduction's first leaf. Deriving it would have been tidier and wrong.
   */
  chapter?: LocalizedText

  /**
   * The section within the chapter — and, since it is the finer of the two, the
   * thing that actually prints at the top of the page. Absent means "same as
   * the chapter". See {@link runningHeadOf}.
   */
  section?: LocalizedText

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

/**
 * The report's chapters, offered in the panel.
 *
 * A list rather than a type: a leaf's `chapter` is free text, and these are the
 * six the Tools for Change report is built from, offered so the common case is
 * a click. Typing over one is expected, not an escape hatch.
 */
export const CHAPTER_PRESETS = [
  'Executive Summary',
  'Introduction',
  'Methodology',
  'Findings and Implications',
  'Conclusion',
  'Appendix',
] as const

/**
 * What prints at the top of a leaf, and whether anything does at all.
 *
 * The section is the finer of the two, so it wins; a leaf with no section
 * carries its chapter's name. **A leaf with neither prints no head, and that is
 * load-bearing** — `render/compose.ts` starts the content column 37pt higher on
 * a headless page, so anything that quietly defaults a chapter here would shift
 * every page of every existing document down.
 */
export const runningHeadOf = (leaf: Leaf): LocalizedText | undefined =>
  leaf.section ?? leaf.chapter

export interface Deck {
  /**
   * What this document is called, in the library and in the exported filename.
   *
   * Optional because a document written before the library existed has none;
   * `createDeck` supplies one, so only stored decks ever lack it.
   */
  name?: string

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

/**
 * What a spread is called: "Pages 3 & 4", "Page 12", "Cover".
 *
 * Derived rather than stored, like the pairing itself — and from `folioOf`
 * rather than the index, so a cover and a bare plate are counted the same way
 * here as they are on the page.
 */
export function spreadLabel(deck: Deck, index: number, kind: 'full' | 'pair'): string {
  if (kind === 'full') return 'Cover'
  const left = folioOf(deck, index)
  const right = folioOf(deck, index + 1)
  if (left === null && right === null) return 'Pages'
  if (right === null) return `Page ${left}`
  if (left === null) return `Page ${right}`
  return `Pages ${left} & ${right}`
}

/**
 * Every chapter this document actually uses, in the order it first uses them.
 *
 * Typing a chapter title on one page makes it offerable on every other, which
 * is the difference between a preset list and a document's own structure — a
 * report whose chapters aren't the six built in shouldn't require retyping them
 * page by page.
 *
 * Derived rather than stored: the set of chapters *is* the set of names on the
 * leaves, and keeping a second list beside it would only give the two something
 * to disagree about. Renaming a chapter on its last page simply removes it.
 */
export function chaptersInUse(deck: Deck, lang: Lang): string[] {
  const seen: string[] = []
  for (const leaf of deck.leaves) {
    const name = t(leaf.chapter, lang).trim()
    if (name && !seen.includes(name)) seen.push(name)
  }
  return seen
}

/**
 * The sections already used within one chapter.
 *
 * Scoped to the chapter rather than the whole document, because a section is a
 * part *of* a chapter: "Data collection" belongs under Methodology and offering
 * it under Conclusion would be noise.
 */
export function sectionsInChapter(deck: Deck, chapter: string, lang: Lang): string[] {
  const seen: string[] = []
  if (!chapter) return seen
  for (const leaf of deck.leaves) {
    if (t(leaf.chapter, lang).trim() !== chapter) continue
    const name = t(leaf.section, lang).trim()
    if (name && !seen.includes(name)) seen.push(name)
  }
  return seen
}

export const leafById = (deck: Deck, id: string): Leaf | undefined =>
  deck.leaves.find((l) => l.id === id)

/** A blank body leaf: paper, dense body copy, furniture on. */
export const createLeaf = (over: Partial<Leaf> = {}): Leaf => ({
  id: leafId(),
  surface: 'paper',
  bodySize: 'xs',
  blocks: [],
  ...over,
})

/**
 * Enforce the one rule about how a document is made of pages.
 *
 * **Every leaf is either a full-spread cover or one half of a facing pair.** A
 * lone A4 cannot exist: the document is read two pages at a time, the editor
 * shows two pages, the thumbnails are two pages, and `＋` adds two pages — so a
 * single unpaired leaf was a state the whole interface had no way to draw.
 *
 * Rather than asking every mutator to remember this, it is applied in the
 * store's `commit`, which every change to the document goes through. A verso
 * left without a recto — by deleting a page, or by turning a middle leaf into a
 * cover and shifting the pairing after it — is paired with a fresh blank one
 * here, at the moment it happens.
 *
 * Returns the original array untouched when the rule already holds, so the
 * spread cache and every memo keyed on `leaves` survive an edit that didn't
 * change the pagination.
 */
export function pairLeaves(leaves: Leaf[]): Leaf[] {
  if (!leaves.length) return [createLeaf(), createLeaf()]

  const out: Leaf[] = []
  let padded = false
  for (let i = 0; i < leaves.length; ) {
    const leaf = leaves[i]
    if (leaf.full) {
      out.push(leaf)
      i += 1
      continue
    }
    const next = leaves[i + 1]
    // A cover cannot be the right half of a pair, so a leaf followed by one
    // needs a recto of its own just as much as the last leaf does.
    if (next && !next.full) {
      out.push(leaf, next)
      i += 2
      continue
    }
    out.push(leaf, createLeaf({ surface: leaf.surface }))
    padded = true
    i += 1
  }
  return padded ? out : leaves
}

let seq = 0
export const leafId = (): string => `lf_${Date.now().toString(36)}_${(seq++).toString(36)}`
