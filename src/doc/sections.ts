import type { Deck, Page } from './types'
import type { Block } from './blocks'
import type { LocalizedText } from './localized'
import type { RenderPage } from '../render/page'
import { toRenderPage } from '../render/page'
import { flowSection } from '../render/flow'
import { measureCtx, renderAssetsForMeasuring } from '../render/measureCtx'

/**
 * A **section** is the unit a document is authored in. A **page** is the unit it
 * is rendered in. Separating them is what lets a 46-page report exist without
 * someone hand-placing 46 pages of boxes.
 *
 * ## Why `StaticSection extends Page`
 *
 * A hand-composed section *is* its page: same id, same elements, same palette.
 * Making that structural rather than a conversion keeps page derivation
 * allocation-free and preserves object identity — `PageStrip` bails out of
 * repainting a thumbnail on `prev.page === page`, and that check has to keep
 * working or typing repaints forty canvases instead of one.
 */
export interface StaticSection extends Page {
  kind: 'static'
}

/**
 * A stream of content that paginates into as many pages as it needs.
 *
 * The blocks are the document; the pages are a derivation. Nothing about where
 * the content landed is stored, so an edit upstream simply produces different
 * pages and no part of the document can go stale relative to another.
 */
export interface FlowSection {
  kind: 'flow'
  id: string
  /** Becomes the running head on every page the section occupies. */
  title?: LocalizedText
  paletteId?: string
  blocks: Block[]
}

export type Section = StaticSection | FlowSection

export const isStatic = (s: Section): s is StaticSection => s.kind === 'static'
export const isFlow = (s: Section): s is FlowSection => s.kind === 'flow'

/**
 * Every page in the deck, in reading order.
 *
 * Memoised on `deck.sections` identity. Every store mutator rebuilds that array
 * when and only when the document changes, so this is both exact and free — and
 * because a static section is its own page, those `Page` objects keep their
 * identity across calls even when the outer array is rebuilt.
 *
 * Flow sections are re-typeset on a miss. That is the expensive path, which is
 * precisely why the memo is keyed on document identity rather than on a
 * hand-maintained dirty flag.
 */
const pageCache = new WeakMap<readonly Section[], RenderPage[]>()

export function deckPages(deck: Deck): RenderPage[] {
  const cached = pageCache.get(deck.sections)
  if (cached) return cached

  const pages: RenderPage[] = []
  for (const section of deck.sections) {
    if (isStatic(section)) {
      pages.push(toRenderPage(section))
    } else {
      pages.push(
        ...flowSection(section, deck, measureCtx(), renderAssetsForMeasuring(), {
          startFolio: pages.length + 1,
          lang: deck.lang,
        }),
      )
    }
  }
  pageCache.set(deck.sections, pages)
  return pages
}

/** The section a page belongs to, or undefined if the page id is stale. */
export function sectionOfPage(deck: Deck, pageId: string): Section | undefined {
  return deck.sections.find(
    (s) => s.id === pageId || (isFlow(s) && pageId.startsWith(`${s.id}#`)),
  )
}
