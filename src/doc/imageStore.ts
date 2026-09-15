import { tx as idbTx, type Db } from '../store/idb'
import { supabase } from '../auth/client'
import { useAuth } from '../auth/useAuth'

/**
 * Where uploaded photographs live.
 *
 * A document can't hold an `HTMLImageElement` — it has no JSON form — so an
 * element stores a *reference* instead: a URL for bundled assets, or an id for
 * an upload. Decoding a reference back into an element is `doc/imageCache.ts`'s
 * job; putting the bytes somewhere they survive is this one's.
 *
 * Uploads used to go to IndexedDB, which meant a report opened on a second
 * machine painted grey boxes where the photographs should be. They now go to a
 * private Supabase Storage bucket at `<uid>/<id>`, where that first path
 * segment is the access boundary — which is also why an image id only has to be
 * unique within one account.
 *
 * ## Why bytes are downloaded rather than linked
 *
 * It would be less code to hand a signed URL straight to `img.src`. But the PDF
 * export reads pixels back out of a canvas — `canvas.toBlob` in
 * `export/exportPdf.ts` and `getImageData` in `export/paintPdf.ts` — and a
 * canvas that has drawn a cross-origin image is tainted, so both throw. Supabase
 * does send CORS headers and `crossOrigin` is set below, so a signed URL would
 * very probably work; "very probably" is the wrong standard for the feature the
 * product exists to deliver. A `blob:` URL is same-origin by construction and
 * depends on no header being configured correctly.
 *
 * ## The IndexedDB cache is a cache now, not the record
 *
 * Downloading every photograph again on every export would be absurd —
 * `imagesReady` decodes a whole deck at once. So bytes are kept locally after
 * the first fetch. The important difference from before is that losing this
 * data is now harmless: it re-downloads. That is what makes eviction by size and
 * age safe, where the old reference-counted sweep destroyed the only copy if its
 * keep-set was ever wrong — and `doc/imageCache.ts` records a time it was.
 */

export type { ImageRef } from './imageRef'
import type { ImageRef } from './imageRef'

const BUCKET = 'deck-images'

/**
 * The read-cache. Deliberately a different database from the old
 * `lehub.images.v1`, which is still out there holding pre-account uploads and
 * is read by `store/localImport.ts`. Separate names mean the two value shapes
 * can't collide and the legacy store can be dropped on its own schedule.
 */
const CACHE: Db = { name: 'lehub.imagecache.v1', store: 'images' }

interface CacheEntry {
  blob: Blob
  lastUsed: number
}

const uid = () => `img_${crypto.randomUUID()}`

const objectPath = (userId: string, id: string) => `${userId}/${id}`

const currentUserId = (): string | null => useAuth.getState().user?.id ?? null

// ---------------------------------------------------------------------------
// The local cache
// ---------------------------------------------------------------------------

const cacheGet = async (id: string): Promise<Blob | null> => {
  const entry = await idbTx<CacheEntry | undefined>(
    CACHE,
    'readonly',
    (s) => s.get(id) as IDBRequest<CacheEntry | undefined>,
  )
  if (!entry?.blob) return null
  // Touch it, so eviction can tell a working set from a stale one. Not awaited:
  // a failed touch costs an early eviction, which costs one re-download.
  void idbTx(CACHE, 'readwrite', (s) =>
    s.put({ blob: entry.blob, lastUsed: Date.now() }, id) as IDBRequest<IDBValidKey>,
  )
  return entry.blob
}

const cachePut = (id: string, blob: Blob): Promise<unknown> =>
  idbTx(CACHE, 'readwrite', (s) =>
    s.put({ blob, lastUsed: Date.now() }, id) as IDBRequest<IDBValidKey>,
  )

/** Roughly how much of this origin's quota the cache may hold. */
const CACHE_BUDGET_BYTES = 200 * 1024 * 1024
/** Entries untouched for this long go, whatever the total. */
const CACHE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Trim the cache on boot. Safe to fail, safe to over-delete.
 *
 * This replaces `pruneImageBlobs`, which swept by reference and needed to see
 * every document the user owned in order to be correct. That is not a question
 * a client can answer any more, and answering it wrongly deleted photographs
 * permanently. Evicting by age and size needs no such knowledge, and costs a
 * re-download when it guesses wrong.
 */
export async function evictImageCache(): Promise<void> {
  const keys = await idbTx<IDBValidKey[]>(
    CACHE,
    'readonly',
    (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>,
  )
  const values = await idbTx<CacheEntry[]>(
    CACHE,
    'readonly',
    (s) => s.getAll() as IDBRequest<CacheEntry[]>,
  )
  if (!keys || !values || keys.length !== values.length) return

  const now = Date.now()
  const entries = keys
    .map((key, i) => ({ key, ...values[i] }))
    .filter((e) => typeof e.key === 'string' && e.blob)
    .sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0)) // newest first

  let total = 0
  const doomed: IDBValidKey[] = []
  for (const entry of entries) {
    total += entry.blob.size
    const stale = now - (entry.lastUsed ?? 0) > CACHE_MAX_AGE_MS
    if (stale || total > CACHE_BUDGET_BYTES) doomed.push(entry.key)
  }

  await Promise.all(
    doomed.map((key) =>
      idbTx(CACHE, 'readwrite', (s) => s.delete(key) as unknown as IDBRequest<undefined>),
    ),
  )
}

// ---------------------------------------------------------------------------
// Reading and writing uploads
// ---------------------------------------------------------------------------

/**
 * Store an uploaded file, returning the reference to keep in the document.
 *
 * Null means the upload did not happen — no signed-in account, or the request
 * failed. `components/ImageField.tsx` keeps the previous image on a null, which
 * is the honest outcome: better than clearing the frame and looking like it
 * worked.
 */
export async function putImageBlob(blob: Blob): Promise<ImageRef | null> {
  const userId = currentUserId()
  if (!userId) return null

  const id = uid()
  try {
    const { error } = await supabase()
      .storage.from(BUCKET)
      .upload(objectPath(userId, id), blob, {
        contentType: blob.type || 'application/octet-stream',
        cacheControl: '31536000',
        upsert: false,
      })
    if (error) return null
  } catch {
    return null
  }

  // Seed the cache, so the session that just uploaded doesn't turn round and
  // download its own bytes back.
  await cachePut(id, blob)
  return { kind: 'blob', id }
}

/**
 * The stored bytes for an upload, or null if it is gone.
 *
 * `loadImageRef` below decodes to an element, which is what the renderer wants;
 * this returns the blob itself, which is what the `.lehub.json` transfer format
 * needs in order to carry an image to another machine.
 */
export async function getImageBlob(id: string): Promise<Blob | null> {
  const cached = await cacheGet(id)
  if (cached) return cached

  const userId = currentUserId()
  if (!userId) return null
  try {
    const { data, error } = await supabase().storage.from(BUCKET).download(objectPath(userId, id))
    if (error || !data) return null
    await cachePut(id, data)
    return data
  } catch {
    return null
  }
}

/**
 * Upload bytes under an id chosen by the caller.
 *
 * Only `store/localImport.ts` needs this — it carries pre-account uploads into
 * an account and wants ids stable across a whole deck, so that two pages
 * sharing a photograph still share it afterwards.
 */
export async function putImageBlobAs(id: string, blob: Blob): Promise<boolean> {
  const userId = currentUserId()
  if (!userId) return false
  try {
    const { error } = await supabase()
      .storage.from(BUCKET)
      .upload(objectPath(userId, id), blob, {
        contentType: blob.type || 'application/octet-stream',
        cacheControl: '31536000',
        upsert: true, // a resumed import may re-send one it already sent
      })
    if (error) return false
  } catch {
    return false
  }
  await cachePut(id, blob)
  return true
}

/** Best-effort removal of a document's uploads, for when a report is deleted. */
export async function removeImageBlobs(ids: string[]): Promise<void> {
  const userId = currentUserId()
  if (!userId || !ids.length) return
  try {
    await supabase()
      .storage.from(BUCKET)
      .remove(ids.map((id) => objectPath(userId, id)))
  } catch {
    /* an orphan costs storage; a failed delete must not fail the deletion */
  }
  await Promise.all(
    ids.map((id) =>
      idbTx(CACHE, 'readwrite', (s) => s.delete(id) as unknown as IDBRequest<undefined>),
    ),
  )
}

// Bundled assets (the category placeholders) are referenced by URL and get
// re-requested every time a category is applied. The bytes come from the HTTP
// cache, but the decode doesn't — so hold on to the decoded elements.
const byUrl = new Map<string, HTMLImageElement>()

/** Load an image element for a reference, or null if it can no longer be found. */
export async function loadImageRef(ref: ImageRef): Promise<HTMLImageElement | null> {
  let src: string
  if (ref.kind === 'url') {
    const cached = byUrl.get(ref.src)
    if (cached) return cached
    src = ref.src
  } else {
    const blob = await getImageBlob(ref.id)
    if (!blob) return null
    src = URL.createObjectURL(blob)
  }
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (ref.kind === 'url') byUrl.set(ref.src, img)
      resolve(img)
    }
    img.onerror = () => resolve(null)
    img.src = src
  })
}
