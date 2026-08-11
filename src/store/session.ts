import type { Deck, PageElement } from '../doc/types'
import { deckPages, type Section } from '../doc/sections'
import { createDeck, ELEMENT_DEFAULTS } from '../doc/defaults'
import { CURRENT_VERSION, migrate, type StoredAny, type StoredV2 } from './migrations'

/**
 * The storage key, deliberately NOT versioned alongside the schema. Bumping it
 * would orphan every existing session rather than migrate it — the schema
 * version lives inside the payload and is handled by `migrations.ts`. The `v1`
 * suffix here only distinguishes this key from any future unrelated one.
 */
const KEY = 'lehub.deck.session.v1'

/**
 * The stored payload carries a schema version. The poster app relied purely on
 * spreading stored state over fresh defaults, which covers *added* fields but
 * silently mis-loads a renamed or restructured one. An element-driven schema
 * will churn far more than a flat state object did, so the seam goes in now
 * rather than after the first breaking change.
 */
const VERSION = CURRENT_VERSION

/** Refuse to write a payload big enough to be near the ~5MB localStorage quota. */
const MAX_BYTES = 2_000_000

type Stored = StoredV2

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

/** Spread stored data over fresh defaults so older sessions still load. */
function reviveElement(raw: PageElement): PageElement | null {
  const defaults = ELEMENT_DEFAULTS[raw?.kind as keyof typeof ELEMENT_DEFAULTS]
  if (!defaults || !raw.id || !raw.box) return null
  return { ...defaults, ...raw } as PageElement
}

function reviveSection(raw: Section): Section | null {
  if (!raw?.id) return null
  const elements = (raw.elements ?? []).map(reviveElement).filter((e): e is PageElement => !!e)
  // `kind` is asserted rather than trusted: anything reaching here has been
  // through the migration above, and a hand-edited or truncated entry missing
  // the field still loads. Once flow sections exist this becomes a branch, and
  // the type checker will say so.
  return { ...raw, kind: 'static', elements }
}

export function loadSession(): { deck: Deck; currentPageId: string } | null {
  let stored: Stored
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    stored = migrate(JSON.parse(raw) as StoredAny)
  } catch {
    return null
  }

  const base = createDeck()
  const sections = (stored.deck?.sections ?? [])
    .map(reviveSection)
    .filter((s): s is Section => !!s)
  if (!sections.length) return null

  const deck: Deck = { ...base, ...stored.deck, sections }
  const pages = deckPages(deck)
  const currentPageId = pages.some((p) => p.id === stored.currentPageId)
    ? stored.currentPageId
    : pages[0].id
  return { deck, currentPageId }
}
