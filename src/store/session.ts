import type { Deck } from '../doc/types'
import { createDeck } from '../doc/defaults'
import { CURRENT_VERSION, migrate, type StoredAny, type StoredV3 } from './migrations'

/**
 * The storage key, deliberately NOT versioned alongside the schema. Bumping it
 * would orphan every existing session rather than let `migrations.ts` decide
 * what to do with it — the schema version lives inside the payload.
 */
const KEY = 'lehub.report.session.v1'

/** Refuse to write a payload near the ~5MB localStorage quota. */
const MAX_BYTES = 2_000_000

export function saveSession(deck: Deck, leafIndex = 0): void {
  try {
    // A document is plain JSON all the way down — decoded images live in
    // `doc/imageCache.ts`, so there is nothing to strip out first.
    const json = JSON.stringify({ v: CURRENT_VERSION, deck, leafIndex } satisfies StoredV3)
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

/**
 * The stored document, or null if there is none (or it predates v3 — see
 * `migrations.ts` for why those are dropped rather than converted).
 */
export function loadSession(): Deck | null {
  let stored: StoredV3 | null
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    stored = migrate(JSON.parse(raw) as StoredAny)
  } catch {
    return null
  }
  if (!stored || !stored.deck.leaves.length) return null
  // Spread over fresh defaults so a document written before a field was added
  // still loads with that field present.
  return { ...createDeck(stored.deck.leaves), ...stored.deck }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do — a failed clear just means the old session stays */
  }
}
