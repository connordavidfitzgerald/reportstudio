/**
 * Persistent storage for uploaded images. A document can't hold an
 * `HTMLImageElement` — it has no JSON form — so an element stores a *reference*
 * instead: a URL for bundled assets, or an IndexedDB key for an upload. Uploads
 * go to IndexedDB rather than localStorage because a photo is megabytes and
 * would blow the 5MB quota.
 *
 * Decoding a reference back into an element is `doc/imageCache.ts`'s job.
 */

import { tx as idbTx } from '../store/idb'

export type ImageRef = { kind: 'url'; src: string } | { kind: 'blob'; id: string }

const DB = { name: 'lehub.images.v1', store: 'images' }

let seq = 0
const uid = () => `img_${Date.now().toString(36)}_${(seq++).toString(36)}`

const tx = <T,>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> => idbTx(DB, mode, run)

/** Store an uploaded file, returning the reference to keep in the poster state. */
export async function putImageBlob(blob: Blob): Promise<ImageRef | null> {
  const id = uid()
  const ok = await tx('readwrite', (s) => s.put(blob, id) as IDBRequest<IDBValidKey>)
  return ok === null ? null : { kind: 'blob', id }
}

/**
 * The stored bytes for an upload, or null if it is gone.
 *
 * `loadImageRef` below decodes to an element, which is what the renderer wants;
 * this returns the blob itself, which is what the `.lehub.json` transfer format
 * needs in order to carry an image to another machine.
 */
export const getImageBlob = (id: string): Promise<Blob | null> =>
  tx('readonly', (s) => s.get(id) as IDBRequest<Blob | undefined>).then((b) => b ?? null)

/** Drop every stored upload that no page references any more. */
export async function pruneImageBlobs(keep: Iterable<string>): Promise<void> {
  const keepSet = new Set(keep)
  const keys = await tx('readonly', (s) => s.getAllKeys() as IDBRequest<IDBValidKey[]>)
  if (!keys) return
  await Promise.all(
    keys
      .filter((k) => typeof k === 'string' && !keepSet.has(k))
      .map((k) => tx('readwrite', (s) => s.delete(k) as unknown as IDBRequest<undefined>)),
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
    const blob = await tx('readonly', (s) => s.get(ref.id) as IDBRequest<Blob | undefined>)
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
