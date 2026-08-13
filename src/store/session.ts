import type { Deck } from '../doc/types'
import { createDeck } from '../doc/defaults'
import { migrate, type StoredAny } from './migrations'

/**
 * The old single-slot session, kept only long enough to rescue it.
 *
 * Documents now live in IndexedDB (`store/library.ts`). This module no longer
 * writes anything: it exists so that a client who had work in the previous
 * build doesn't lose it on the upgrade. `adoptLegacySession` runs once on boot,
 * moves whatever it finds into the library, and clears the key.
 *
 * Delete this file once no browser can plausibly still be holding the key.
 */

const KEY = 'lehub.report.session.v1'

/** The stored deck, or null if there is none (or it is too old to carry). */
export function loadLegacySession(): Deck | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(KEY)
  } catch {
    return null
  }
  if (!raw) return null
  let stored
  try {
    stored = migrate(JSON.parse(raw) as StoredAny)
  } catch {
    return null
  }
  if (!stored || !stored.deck.leaves.length) return null
  // Spread over fresh defaults so a document written before a field was added
  // still loads with that field present.
  return { ...createDeck(stored.deck.leaves), ...stored.deck }
}

export function clearLegacySession(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* nothing to do — a failed clear just means the old key lingers */
  }
}
