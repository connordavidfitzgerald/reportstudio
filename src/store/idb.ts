/**
 * The IndexedDB plumbing, shared by the two things that need it: uploaded
 * images (`doc/imageStore.ts`) and saved documents (`store/library.ts`).
 *
 * They are separate databases on purpose. Images are megabytes and are swept
 * against what the documents reference; documents are kilobytes and must never
 * be at risk from that sweep. Keeping them apart also means adding a store to
 * one never triggers a version upgrade on the other.
 *
 * ## Failure is a null, not a throw
 *
 * Every call resolves `null` when storage is unavailable — private browsing,
 * a disabled origin, a quota refusal. A document editor that threw on boot
 * because IndexedDB was off would be a blank screen; one that returns null
 * degrades to "this session won't persist", which is survivable and visible.
 */

export interface Db {
  /** Database name, e.g. `lehub.docs.v1`. */
  name: string
  /** The single object store inside it. */
  store: string
}

const open = (db: Db): Promise<IDBDatabase | null> =>
  new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(db.name, 1)
    } catch {
      return resolve(null) // private mode / storage disabled
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(db.store)) req.result.createObjectStore(db.store)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
  })

/** Run one request against the store, resolving null on any failure. */
export function tx<T>(
  db: Db,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return open(db).then(
    (handle) =>
      new Promise<T | null>((resolve) => {
        if (!handle) return resolve(null)
        try {
          const req = run(handle.transaction(db.store, mode).objectStore(db.store))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}
