import { useSyncExternalStore } from 'react'
import { loadImageRef, type ImageRef } from './imageStore'
import type { Deck, Leaf } from './types'

/**
 * Decoded images, keyed by reference, living *outside* the document.
 *
 * The poster app kept the live `HTMLImageElement` on its state next to the
 * serializable ref and stripped it before saving. With elements nested two
 * levels deep that strip becomes a recursive walk — and worse, an undo snapshot
 * would hold references to decoded bitmaps, pinning tens of megabytes per step.
 *
 * Here a document is plain JSON all the way down: `saveSession` is a bare
 * `JSON.stringify`, duplicating a page shares one decode automatically, and
 * there is no rehydration pass to run after a reload.
 *
 * A module-level cache, published
 * through `useSyncExternalStore` so a component repaints when a load lands.
 */

export const refKey = (ref: ImageRef): string =>
  ref.kind === 'url' ? `u:${ref.src}` : `b:${ref.id}`

const cache = new Map<string, HTMLImageElement>()
/** In-flight loads, so N elements sharing a ref trigger one decode. */
const pending = new Map<string, Promise<HTMLImageElement | null>>()
/** Refs that resolved to nothing (deleted blob, dead URL) — don't retry forever. */
const failed = new Set<string>()

let version = 0
const listeners = new Set<() => void>()

function publish(): void {
  version++
  for (const l of listeners) l()
}

/** Decode a reference, or return the cached element. Idempotent per ref. */
export function preload(ref: ImageRef): Promise<HTMLImageElement | null> {
  const key = refKey(ref)
  const hit = cache.get(key)
  if (hit) return Promise.resolve(hit)
  if (failed.has(key)) return Promise.resolve(null)

  let inFlight = pending.get(key)
  if (!inFlight) {
    inFlight = loadImageRef(ref).then((img) => {
      pending.delete(key)
      if (img) cache.set(key, img)
      else failed.add(key)
      publish()
      return img
    })
    pending.set(key, inFlight)
  }
  return inFlight
}

/**
 * The decoded image for a reference *right now*, kicking off a load if it isn't
 * there yet. Synchronous by design: the render path must never await, and a
 * missing image simply doesn't paint until the load lands and triggers a repaint.
 */
export function getImage(ref: ImageRef | null): HTMLImageElement | null {
  if (!ref) return null
  const key = refKey(ref)
  const hit = cache.get(key)
  if (hit) return hit
  if (!failed.has(key)) void preload(ref)
  return null
}

/** Every image reference on a leaf: its plate, and any figure blocks. */
function leafRefs(leaf: Leaf): ImageRef[] {
  const refs: ImageRef[] = []
  if (leaf.plate?.imageRef) refs.push(leaf.plate.imageRef)
  for (const block of leaf.blocks) {
    if (block.kind === 'figure' && block.imageRef) refs.push(block.imageRef)
  }
  return refs
}

/** Every image reference in a deck, de-duplicated. */
export function collectImageRefs(deck: Deck): ImageRef[] {
  const seen = new Map<string, ImageRef>()
  for (const leaf of deck.leaves) {
    for (const ref of leafRefs(leaf)) seen.set(refKey(ref), ref)
  }
  return [...seen.values()]
}

/** Blob ids still referenced by a deck — the keep-set for `pruneImageBlobs`. */
export function collectBlobIds(deck: Deck): string[] {
  return collectImageRefs(deck)
    .filter((r) => r.kind === 'blob')
    .map((r) => (r as { kind: 'blob'; id: string }).id)
}

/**
 * Resolves once every reference has decoded (or definitively failed). Export
 * gates on this — without it a long deck silently writes out blank image boxes
 * for anything that hadn't been scrolled into view yet.
 */
export async function imagesReady(refs: ImageRef[]): Promise<void> {
  await Promise.all(refs.map(preload))
}

/** Kick off loads for one leaf, so scrolling to it doesn't wait on a paint. */
export function preloadLeaf(leaf: Leaf): void {
  for (const ref of leafRefs(leaf)) void preload(ref)
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/**
 * A counter that increments whenever a decode lands. Components don't read it —
 * they subscribe to it so that `getImage` starts returning something.
 */
export function useImageCache(): number {
  return useSyncExternalStore(
    subscribe,
    () => version,
    () => version,
  )
}
