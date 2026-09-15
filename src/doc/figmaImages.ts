import type { ImageRef } from './imageRef'

/**
 * The photographs from the *Tools for Change* file.
 *
 * Exported from the Figma at 1.5–2× and re-encoded as WebP (9MB of source
 * bitmaps down to 1.5MB). They are bundled rather than uploaded because they
 * belong to the reference document: the seed should look like the report on
 * first run, not like a set of grey boxes.
 *
 * The cut-out keeps its alpha — it has to, since the cover title shows through
 * around the shape.
 *
 * A url-kind {@link ImageRef} points at the bundled asset. Anything the user
 * drops in later is a blob-kind ref in IndexedDB; nothing else distinguishes
 * them, so a seeded figure can be replaced like any other.
 */
const urls = import.meta.glob('../assets/figma/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

export type FigmaImageId =
  | 'cover-cutout'
  | 'portrait-amanda'
  | 'plate-group'
  | 'globe'
  | 'crowd-march'
  | 'plate-street'

/** A ref to a bundled photograph, or null if the asset is missing. */
export function figmaImage(id: FigmaImageId): ImageRef | null {
  const hit = Object.entries(urls).find(([path]) => path.endsWith(`/${id}.webp`))
  return hit ? { kind: 'url', src: hit[1] } : null
}
