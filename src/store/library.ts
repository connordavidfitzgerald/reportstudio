import { useSyncExternalStore } from 'react'
import type { Deck } from '../doc/types'
import { createDeck } from '../doc/defaults'
import { collectBlobIds } from '../doc/imageCache'
import { tx } from './idb'
import { CURRENT_VERSION, migrate, type Stored, type StoredAny } from './migrations'

/**
 * Saved documents.
 *
 * The editor used to keep exactly one document, in localStorage, under a key
 * whose payload was discarded on every schema bump. That was defensible while
 * the only document was a transcription being corrected against the Figma. It
 * is not defensible once the documents are somebody's reports: there was no way
 * to keep two, no way to name one, a 2MB ceiling, and an upgrade silently threw
 * the work away.
 *
 * So: several named documents in IndexedDB, a pointer to the one last open, and
 * `migrations.ts` carrying payloads forward instead of dropping them. The
 * `.lehub.json` download in `doc/transfer.ts` is the backstop for everything
 * this can't survive — a cleared origin, a different browser, a lost laptop.
 */

const DB = { name: 'lehub.docs.v1', store: 'docs' }

/** Which document to reopen on boot. Small enough to belong in localStorage. */
const LAST_OPENED = 'lehub.report.lastOpened'

let seq = 0
export const documentId = (): string => `doc_${Date.now().toString(36)}_${(seq++).toString(36)}`

/** One row of the documents list. The deck itself is not read to build these. */
export interface DocumentSummary {
  id: string
  name: string
  updatedAt: number
  pages: number
}

interface Record_ {
  id: string
  name: string
  updatedAt: number
  pages: number
  stored: Stored
}

export const DEFAULT_NAME = 'Untitled report'

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

export async function listDocuments(): Promise<DocumentSummary[]> {
  const rows = await tx<Record_[]>(DB, 'readonly', (s) => s.getAll() as IDBRequest<Record_[]>)
  if (!rows) return []
  return rows
    .filter((r) => r && typeof r.id === 'string')
    .map(({ id, name, updatedAt, pages }) => ({ id, name, updatedAt, pages }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * Load one document, or null if it is missing or too old to carry forward.
 *
 * Spread over fresh defaults, so a deck written before a field was added loads
 * with that field present rather than `undefined` reaching the painters.
 */
export async function loadDocument(id: string): Promise<Deck | null> {
  const row = await tx<Record_>(DB, 'readonly', (s) => s.get(id) as IDBRequest<Record_>)
  if (!row?.stored) return null
  const stored = migrate(row.stored as unknown as StoredAny)
  if (!stored || !stored.deck.leaves.length) return null
  return { ...createDeck(stored.deck.leaves), ...stored.deck }
}

export async function saveDocument(id: string, deck: Deck): Promise<boolean> {
  const row: Record_ = {
    id,
    name: deck.name?.trim() || DEFAULT_NAME,
    updatedAt: Date.now(),
    pages: deck.leaves.length,
    stored: { v: CURRENT_VERSION, deck, leafIndex: 0 },
  }
  const ok = await tx(DB, 'readwrite', (s) => s.put(row, id) as IDBRequest<IDBValidKey>)
  return ok !== null
}

export async function deleteDocument(id: string): Promise<void> {
  await tx(DB, 'readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>)
  if (lastOpened() === id) setLastOpened(null)
}

/**
 * Every uploaded-image id that any saved document still points at.
 *
 * This is the keep-set for the boot-time `pruneImageBlobs` sweep, and it has to
 * span the whole library. Sweeping against the open document alone — which is
 * all there was to sweep against when only one document could exist — would
 * delete the photographs out of every *other* report the client has saved, and
 * they would find out weeks later when they opened one.
 */
export async function collectLibraryBlobIds(): Promise<string[]> {
  const rows = await tx<Record_[]>(DB, 'readonly', (s) => s.getAll() as IDBRequest<Record_[]>)
  if (!rows) return []
  const ids = new Set<string>()
  for (const row of rows) {
    if (!row?.stored?.deck) continue
    for (const id of collectBlobIds(row.stored.deck)) ids.add(id)
  }
  return [...ids]
}

export function lastOpened(): string | null {
  try {
    return localStorage.getItem(LAST_OPENED)
  } catch {
    return null
  }
}

export function setLastOpened(id: string | null): void {
  try {
    if (id) localStorage.setItem(LAST_OPENED, id)
    else localStorage.removeItem(LAST_OPENED)
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
 * `error` is its own state rather than a silent failure because the one thing
 * worse than not saving is looking like you did.
 */
export type SaveState = 'saved' | 'saving' | 'error'

let saveState: SaveState = 'saved'
const listeners = new Set<() => void>()

function publish(next: SaveState): void {
  if (next === saveState) return
  saveState = next
  for (const l of listeners) l()
}

/** How long after the last keystroke to write. Long enough that typing a
 *  paragraph is one save, short enough that a stray reload costs nothing. */
const DEBOUNCE_MS = 600

let timer: ReturnType<typeof setTimeout> | null = null
let queued: { id: string; deck: Deck } | null = null

async function flush(): Promise<void> {
  const job = queued
  queued = null
  timer = null
  if (!job) return
  publish('saving')
  const ok = await saveDocument(job.id, job.deck)
  // A save that landed while a later one was queued isn't "saved" yet.
  publish(ok ? (queued ? 'saving' : 'saved') : 'error')
}

/** Queue a save, collapsing a burst of edits into one write. */
export function scheduleSave(id: string, deck: Deck): void {
  queued = { id, deck }
  publish('saving')
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => void flush(), DEBOUNCE_MS)
}

/** Write anything outstanding now — on tab hide, and before a document swap. */
export async function flushSave(): Promise<void> {
  if (timer) clearTimeout(timer)
  await flush()
}

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
