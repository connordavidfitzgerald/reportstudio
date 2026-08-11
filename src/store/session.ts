import type { Deck, Page, PageElement } from '../doc/types'
import { createDeck, ELEMENT_DEFAULTS } from '../doc/defaults'

const KEY = 'lehub.deck.session.v1'

/**
 * The stored payload carries a schema version. The poster app relied purely on
 * spreading stored state over fresh defaults, which covers *added* fields but
 * silently mis-loads a renamed or restructured one. An element-driven schema
 * will churn far more than a flat state object did, so the seam goes in now
 * rather than after the first breaking change.
 */
const VERSION = 1

/** Refuse to write a payload big enough to be near the ~5MB localStorage quota. */
const MAX_BYTES = 2_000_000

interface Stored {
  v: number
  deck: Deck
  currentPageId: string
}

export function saveSession(deck: Deck, currentPageId: string): void {
  try {
    // A document is plain JSON all the way down — decoded images live in
    // `doc/imageCache.ts`, so there is nothing to strip out first.
    const json = JSON.stringify({ v: VERSION, deck, currentPageId } satisfies Stored)
    if (json.length > MAX_BYTES) {
      console.warn(
        `[session] not saving: ${(json.length / 1e6).toFixed(1)}MB exceeds the ${MAX_BYTES / 1e6}MB limit.`,
      )
      return
    }
    localStorage.setItem(KEY, json)
  } catch (err) {
    console.warn('[session] save failed', err)
  }
}

function migrate(stored: Stored): Stored {
  // No migrations yet. Each future version bump adds a step here, in order.
  return stored
}

/** Spread stored data over fresh defaults so older sessions still load. */
function reviveElement(raw: PageElement): PageElement | null {
  const defaults = ELEMENT_DEFAULTS[raw?.kind as keyof typeof ELEMENT_DEFAULTS]
  if (!defaults || !raw.id || !raw.box) return null
  return { ...defaults, ...raw } as PageElement
}

function revivePage(raw: Page): Page | null {
  if (!raw?.id) return null
  const elements = (raw.elements ?? []).map(reviveElement).filter((e): e is PageElement => !!e)
  return { ...raw, elements }
}

export function loadSession(): { deck: Deck; currentPageId: string } | null {
  let stored: Stored
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    stored = migrate(JSON.parse(raw) as Stored)
  } catch {
    return null
  }

  const base = createDeck()
  const pages = (stored.deck?.pages ?? []).map(revivePage).filter((p): p is Page => !!p)
  if (!pages.length) return null

  const deck: Deck = { ...base, ...stored.deck, pages }
  const currentPageId = pages.some((p) => p.id === stored.currentPageId)
    ? stored.currentPageId
    : pages[0].id
  return { deck, currentPageId }
}
