import { useSyncExternalStore } from 'react'
import type { Deck, Leaf } from '../doc/types'
import { createDeck } from '../doc/defaults'
import { collectBlobIds } from '../doc/imageCache'
import { removeImageBlobs } from '../doc/imageStore'
import { supabase } from '../auth/client'
import { useAuth } from '../auth/useAuth'
import { CURRENT_VERSION, migrate, type StoredAny } from './migrations'

/**
 * Saved documents.
 *
 * Reports used to live in this browser — IndexedDB for the documents, another
 * IndexedDB for the photographs, and nothing tying either to a person. That
 * meant a report was lost with a cleared origin, a second laptop, or a
 * colleague opening the app on their own machine. Now a report belongs to an
 * account: `decks` in Postgres, guarded by row-level security, with the
 * `.lehub.json` download in `doc/transfer.ts` still there as the backstop for
 * everything a server can't survive either.
 *
 * ## Empty and failed are different answers
 *
 * This is the change that matters most in moving off IndexedDB. A local read
 * failed roughly never, so returning `[]` for both "you have no reports" and
 * "the read did not work" cost nothing. Over a network the second case is
 * ordinary, and conflating them tells somebody with forty reports that they
 * have none — and, worse, lets `bootstrap()` mistake them for a first-time
 * visitor and start a new document over the top. Hence `listDocuments`
 * returning a result rather than a bare array.
 *
 * ## Saving retries
 *
 * A failed local write meant storage was refused and would stay refused. A
 * failed network write usually means a tunnel. The autosave below keeps the
 * unsaved payload and retries with backoff instead of settling into `error`
 * and waiting for another keystroke that may never come.
 */

const TABLE = 'decks'

/** Which document to reopen on boot, per account. */
const lastOpenedKey = (userId: string) => `lehub.report.lastOpened:${userId}`

export const documentId = (): string => crypto.randomUUID()

/** One row of the documents list. The deck itself is not read to build these. */
export interface DocumentSummary {
  id: string
  name: string
  updatedAt: number
  pages: number
  /**
   * The document's first page, for the thumbnail — denormalised into its own
   * column so the list still never reads a whole deck. Null on rows saved
   * before the column existed; they fill in on the next save.
   */
  cover: Leaf | null
}

export const DEFAULT_NAME = 'Untitled report'

/** The signed-in account, or null. Every query below is scoped to it. */
const currentUserId = (): string | null => useAuth.getState().user?.id ?? null

/** True for the failures worth retrying — a connection, not a rejection. */
export const isNetworkError = (err: unknown): boolean => {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const message = err instanceof Error ? err.message : String(err ?? '')
  return /failed to fetch|networkerror|load failed|timeout|fetch failed/i.test(message)
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

export interface DocumentList {
  rows: DocumentSummary[]
  /** Non-null when the list could not be read. Distinct from an empty list. */
  error: string | null
}

export async function listDocuments(): Promise<DocumentList> {
  if (!currentUserId()) return { rows: [], error: 'You are not signed in.' }
  try {
    // No `where user_id` — row-level security supplies it, and the
    // (user_id, updated_at desc) index serves the sort.
    const { data, error } = await supabase()
      .from(TABLE)
      .select('id, name, pages, updated_at, cover')
      .order('updated_at', { ascending: false })

    if (error) return { rows: [], error: error.message }
    return {
      rows: (data ?? []).map((r) => ({
        id: r.id as string,
        name: (r.name as string) || DEFAULT_NAME,
        updatedAt: new Date(r.updated_at as string).getTime(),
        pages: (r.pages as number) ?? 0,
        cover: (r.cover as Leaf | null) ?? null,
      })),
      error: null,
    }
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : 'Could not reach the server.' }
  }
}

/**
 * Load one document, or null if it is missing, not ours, or too old to carry.
 *
 * Spread over fresh defaults, so a deck written before a field was added loads
 * with that field present rather than `undefined` reaching the painters.
 */
export async function loadDocument(id: string): Promise<Deck | null> {
  if (!currentUserId()) return null
  try {
    const { data, error } = await supabase()
      .from(TABLE)
      .select('stored')
      .eq('id', id)
      .maybeSingle()

    if (error || !data?.stored) return null
    const stored = migrate(data.stored as StoredAny)
    if (!stored || !stored.deck.leaves.length) return null
    return { ...createDeck(stored.deck.leaves), ...stored.deck }
  } catch {
    return null
  }
}

export async function saveDocument(id: string, deck: Deck): Promise<boolean> {
  const userId = currentUserId()
  if (!userId) return false
  try {
    // Upsert rather than insert-then-update: `useDeck` mints an id and installs
    // it before the first write lands, so a save may be either the first or the
    // hundredth for that id, and a failed first write self-heals on the next.
    const { error } = await supabase().from(TABLE).upsert({
      id,
      user_id: userId,
      name: deck.name?.trim() || DEFAULT_NAME,
      pages: deck.leaves.length,
      cover: deck.leaves[0] ?? null,
      stored: { v: CURRENT_VERSION, deck, leafIndex: 0 },
    })
    if (error) throw new Error(error.message)
    return true
  } catch (err) {
    lastSaveWasNetwork = isNetworkError(err)
    return false
  }
}

/**
 * Delete a report, and the photographs only it was using.
 *
 * Deleting the images here is safe in a way the old origin-wide sweep was not,
 * because an image id is never shared between two documents: `putImageBlob` and
 * `fromTransferJson` both mint fresh ids, so the only sharing is *within* one
 * deck, where `duplicateSpread` and `duplicateBlock` copy a ref verbatim. That
 * is the assumption this rests on — if a future feature ever makes two
 * documents point at one object, this has to become a reference check first.
 */
export async function deleteDocument(id: string): Promise<boolean> {
  if (!currentUserId()) return false

  // Read the deck before the row goes, so its images can be named afterwards.
  const deck = await loadDocument(id)

  try {
    const { error } = await supabase().from(TABLE).delete().eq('id', id)
    if (error) return false
  } catch {
    return false
  }

  if (lastOpened() === id) setLastOpened(null)
  // Best effort: an orphaned object costs storage, a thrown error costs trust.
  if (deck) await removeImageBlobs(collectBlobIds(deck))
  return true
}

export function lastOpened(): string | null {
  const userId = currentUserId()
  if (!userId) return null
  try {
    return localStorage.getItem(lastOpenedKey(userId))
  } catch {
    return null
  }
}

export function setLastOpened(id: string | null): void {
  const userId = currentUserId()
  if (!userId) return
  try {
    if (id) localStorage.setItem(lastOpenedKey(userId), id)
    else localStorage.removeItem(lastOpenedKey(userId))
  } catch {
    /* a pointer we can't write just means the next boot opens the newest */
  }
}

// ---------------------------------------------------------------------------
// Autosave
// ---------------------------------------------------------------------------

/**
 * What the toolbar shows.
 *
 * `error` and `offline` are separate because the remedies are different: one is
 * "this will not work, get a copy out", the other is "this is still trying".
 * Neither is silent, because the one thing worse than not saving is looking
 * like you did.
 */
export type SaveState = 'saved' | 'saving' | 'offline' | 'error'

let saveState: SaveState = 'saved'
const listeners = new Set<() => void>()
/** Set by `saveDocument` so `flush` can tell a tunnel from a rejection. */
let lastSaveWasNetwork = false

function publish(next: SaveState): void {
  if (next === saveState) return
  saveState = next
  for (const l of listeners) l()
}

/**
 * How long after the last keystroke to write.
 *
 * Longer than the 600ms this used when the write was local. PostgREST has no
 * partial-jsonb update, so every save re-uploads the whole document; at 600ms
 * somebody typing steadily would push a few hundred kilobytes twice a second
 * for no benefit. A hard flush still runs on tab-hide and document swap, so
 * the extra delay is not extra exposure in the cases that matter.
 */
const DEBOUNCE_MS = 1500

/** Backoff between retries, in milliseconds. The last value repeats. */
const BACKOFF_MS = [2_000, 5_000, 15_000, 30_000]

let timer: ReturnType<typeof setTimeout> | null = null
let queued: { id: string; deck: Deck } | null = null
let attempt = 0

async function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  const job = queued
  if (!job) return

  publish('saving')
  lastSaveWasNetwork = false
  const ok = await saveDocument(job.id, job.deck)

  if (ok) {
    attempt = 0
    // Only clear the job if nothing newer arrived while this was in flight.
    if (queued === job) {
      queued = null
      publish('saved')
    } else {
      publish('saving')
      schedule(0)
    }
    return
  }

  // Keep `queued` — the edit is not saved, and dropping it here is how work
  // disappears. Retry until it lands or the tab goes away.
  publish(lastSaveWasNetwork ? 'offline' : 'error')
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
  attempt++
  schedule(delay)
}

function schedule(delay: number): void {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), delay)
}

/** Queue a save, collapsing a burst of edits into one write. */
export function scheduleSave(id: string, deck: Deck): void {
  queued = { id, deck }
  attempt = 0
  publish('saving')
  schedule(DEBOUNCE_MS)
}

/** Write anything outstanding now — on tab hide, and before a document swap. */
export async function flushSave(): Promise<void> {
  await flush()
}

/** True when an edit is still waiting to reach the server. */
export const hasUnsavedWork = (): boolean => queued !== null

export function useSaveState(): SaveState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => {
        listeners.delete(cb)
      }
    },
    () => saveState,
    () => saveState,
  )
}

// A connection coming back is the one signal worth acting on immediately —
// otherwise a queued save sits out its backoff for no reason.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (queued) {
      attempt = 0
      schedule(0)
    }
  })
}
