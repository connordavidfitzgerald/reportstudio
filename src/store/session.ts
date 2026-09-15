import type { Deck } from '../doc/types'
import { createDeck } from '../doc/defaults'
import { migrate, type StoredAny } from './migrations'

/**
 * The old single-slot session, kept only long enough to rescue it.
 *
 * Documents now live in an account (`store/library.ts`). This module no longer
 * writes anything: it exists so that a client who had work in a much earlier
 * build doesn't lose it on the upgrade.
 *
 * It used to be rescued on boot. It is now one more candidate in
 * `store/localImport.ts`, which asks before uploading anything — a boot-time
 * rescue would have meant silently copying whatever this browser was holding
 * into whichever account happened to sign in, which on a shared machine is
 * somebody else's report.
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
