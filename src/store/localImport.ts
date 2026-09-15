import type { Deck } from '../doc/types'
import { collectBlobIds } from '../doc/imageCache'
import { putImageBlobAs } from '../doc/imageStore'
import { tx } from './idb'
import { documentId, saveDocument } from './library'
import { listLocalDocuments, type LocalDocument } from './localLibrary'
import { clearLegacySession, loadLegacySession } from './session'

/**
 * Moving work made before there were accounts into an account.
 *
 * Every report in this origin's IndexedDB was made by somebody who had no way
 * to sign in, and the previous design said out loud that losing it was the
 * failure to avoid. So the old database is read, offered, and — only on a yes —
 * uploaded.
 *
 * ## Why it asks
 *
 * A browser is not a person. The reports sitting in this origin may belong to
 * whoever used the machine last, and silently copying a colleague's work into
 * the account that happens to be signed in now is not something that can be
 * taken back. So this never runs on its own: it counts what is there and lets
 * `components/LocalImportDialog.tsx` ask.
 *
 * ## Why nothing is deleted
 *
 * The local copies stay after a successful import. They are the only fallback
 * if the upload was half a report, and they cost nothing to leave. The
 * per-document record of what has already been carried is what stops a second
 * run duplicating anything.
 */

/** Pre-account uploads. Read-only now; `doc/imageStore.ts` writes elsewhere. */
const LEGACY_IMAGES = { name: 'lehub.images.v1', store: 'images' }

const doneKey = (userId: string) => `lehub.imported:${userId}`
const carriedKey = (userId: string) => `lehub.imported.docs:${userId}`

const read = (key: string): string[] => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

const write = (key: string, value: unknown): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* losing the record costs a second prompt, not correctness */
  }
}

/** The legacy single-slot session, as one more candidate alongside the library. */
const legacyAsDocument = (): LocalDocument | null => {
  const deck = loadLegacySession()
  if (!deck) return null
  return {
    id: 'legacy-session',
    name: deck.name ?? 'My report',
    updatedAt: 0,
    deck,
  }
}

/** Everything in this browser that this account has not already taken. */
export async function pendingLocalWork(userId: string): Promise<LocalDocument[]> {
  try {
    if (localStorage.getItem(doneKey(userId)) === 'never') return []
  } catch {
    /* unreadable storage just means we ask again */
  }
  const carried = new Set(read(carriedKey(userId)))
  const legacy = legacyAsDocument()
  const all = [...(legacy ? [legacy] : []), ...(await listLocalDocuments())]
  return all.filter((doc) => !carried.has(doc.id))
}

const legacyImageBlob = (id: string): Promise<Blob | null> =>
  tx<Blob | undefined>(LEGACY_IMAGES, 'readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>)
    .then((b) => b ?? null)

/**
 * Carry one document up.
 *
 * Images keep their original ids. They only have to be unique within an
 * account, since the storage path is `<uid>/<id>` — and keeping them means two
 * pages that shared a photograph (a duplicated spread, say) still share one
 * object afterwards, with no ref rewriting at all.
 */
async function carry(doc: LocalDocument): Promise<boolean> {
  const ids = collectBlobIds(doc.deck)
  for (const id of ids) {
    const blob = await legacyImageBlob(id)
    // A missing blob is survivable — the ref will resolve to a placeholder,
    // exactly as it already does locally. A failed *upload* is not, because it
    // would silently produce a report with holes in it.
    if (!blob) continue
    if (!(await putImageBlobAs(id, blob))) return false
  }
  // A new id: the old `doc_<ts36>_<seq36>` scheme is not a uuid and, being
  // derived from a timestamp, is not unique across two people either.
  return saveDocument(documentId(), doc.deck as Deck)
}

export interface ImportOutcome {
  imported: number
  failed: number
}

/** Upload the given documents, remembering each one that lands. */
export async function importLocalWork(
  userId: string,
  docs: LocalDocument[],
): Promise<ImportOutcome> {
  const carried = new Set(read(carriedKey(userId)))
  let imported = 0
  let failed = 0

  for (const doc of docs) {
    if (await carry(doc)) {
      imported++
      carried.add(doc.id)
      // Recorded per document, so a run that dies half way through resumes
      // rather than sending the first three again.
      write(carriedKey(userId), [...carried])
      if (doc.id === 'legacy-session') clearLegacySession()
    } else {
      failed++
    }
  }

  if (!failed) markDone(userId)
  return { imported, failed }
}

/** Don't ask this account again. */
export function markDone(userId: string): void {
  try {
    localStorage.setItem(doneKey(userId), 'done')
    // The un-namespaced pointer from before accounts holds a `doc_*` id that
    // now means nothing.
    localStorage.removeItem('lehub.report.lastOpened')
  } catch {
    /* nothing to do */
  }
}

/** Don't ask, ever, on this browser. */
export function markNever(userId: string): void {
  try {
    localStorage.setItem(doneKey(userId), 'never')
  } catch {
    /* nothing to do */
  }
}
