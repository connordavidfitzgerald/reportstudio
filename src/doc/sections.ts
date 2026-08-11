import type { Deck, Page } from './types'

/**
 * A **section** is the unit a document is authored in. A **page** is the unit it
 * is rendered in. They are not the same thing, and separating them is what lets
 * a 46-page report exist without someone hand-placing 46 pages of boxes.
 *
 * Today there is one kind of section and it contributes exactly one page, so the
 * two are still 1:1 and nothing behaves differently. The seam is here so that
 * `FlowSection` — a stream of content blocks that paginates into however many
 * pages it needs — is an addition rather than a rewrite.
 *
 * ## Why `StaticSection extends Page`
 *
 * A hand-composed section *is* its page: same id, same elements, same palette.
 * Making that structural rather than a conversion keeps
 * {@link sectionPages} allocation-free and, more importantly, preserves object
 * identity — `PageStrip` bails out of repainting a thumbnail on `prev.page ===
 * page`, and that check has to keep working or typing repaints forty canvases
 * instead of one.
 */
export interface StaticSection extends Page {
  kind: 'static'
}

/**
 * Union of one, for now. `FlowSection` joins it in the flow phase; when it does,
 * TypeScript will flag every site that assumes `.elements` exists, which is
 * exactly the review list that phase needs.
 */
export type Section = StaticSection

export const isStatic = (s: Section): s is StaticSection => s.kind === 'static'

/**
 * The pages a section contributes, in order. A static section contributes
 * itself; a flow section will contribute the result of paginating its blocks.
 */
export function sectionPages(section: Section): Page[] {
  return [section]
}

/**
 * Every page in the deck, in reading order.
 *
 * Memoised on `deck.sections` identity. Every store mutator rebuilds that array
 * when and only when the document changes, so this is both exact and free — and
 * because a static section is its own page, the individual `Page` objects keep
 * their identity across calls even when the outer array is rebuilt.
 */
const pageCache = new WeakMap<readonly Section[], Page[]>()

export function deckPages(deck: Deck): Page[] {
  const cached = pageCache.get(deck.sections)
  if (cached) return cached
  const pages = deck.sections.flatMap(sectionPages)
  pageCache.set(deck.sections, pages)
  return pages
}

/** The section a page belongs to, or undefined if the page id is stale. */
export function sectionOfPage(deck: Deck, pageId: string): Section | undefined {
  return deck.sections.find((s) => sectionPages(s).some((p) => p.id === pageId))
}
