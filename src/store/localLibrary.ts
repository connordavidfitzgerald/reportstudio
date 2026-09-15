import type { Deck } from '../doc/types'
import { createDeck } from '../doc/defaults'
import { tx } from './idb'
import { migrate, type Stored, type StoredAny } from './migrations'

/**
 * The documents that were saved in this browser before there were accounts.
 *
 * This is the read half of what `store/library.ts` used to be. Reports now live
 * on the server, but the ones already sitting in this origin's IndexedDB are
 * somebody's work, and the header comment that used to be in `library.ts` was
 * written precisely to stop an upgrade throwing that work away.
 *
 * So the old database is still here and still readable — `store/localImport.ts`
 * offers to move it into the signed-in account. Nothing writes to it any more.
 * Delete this file once no browser can plausibly still be holding the database.
 */

const DB = { name: 'lehub.docs.v1', store: 'docs' }

interface Record_ {
  id: string
  name: string
  updatedAt: number
  pages: number
  stored: Stored
}

export interface LocalDocument {
  /** The old client-minted `doc_<ts36>_<seq36>` id. Never reused server-side. */
  id: string
  name: string
  updatedAt: number
  deck: Deck
}

/** Every readable document in the old database, newest first. */
export async function listLocalDocuments(): Promise<LocalDocument[]> {
  const rows = await tx<Record_[]>(DB, 'readonly', (s) => s.getAll() as IDBRequest<Record_[]>)
  if (!rows) return []

  const out: LocalDocument[] = []
  for (const row of rows) {
    if (!row?.stored || typeof row.id !== 'string') continue
    const stored = migrate(row.stored as unknown as StoredAny)
    // A document too old to migrate is skipped rather than failing the import:
    // one unreadable row must not block the other six.
    if (!stored || !stored.deck.leaves.length) continue
    out.push({
      id: row.id,
      name: row.name || 'Untitled report',
      updatedAt: row.updatedAt ?? 0,
      deck: { ...createDeck(stored.deck.leaves), ...stored.deck },
    })
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}
