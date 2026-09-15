/**
 * How a document points at a picture.
 *
 * This type lives alone, in a file that imports nothing, on purpose. It is
 * referenced from `doc/types.ts`, `doc/blocks.ts`, `doc/figmaImages.ts` and
 * `render/compose.ts` — and those modules are loaded by the `npm run check:*`
 * scripts under node, where `import.meta.env` does not exist.
 *
 * `doc/imageStore.ts`, which resolves these references, talks to Supabase. If
 * the type lived there, then the day any of those four call sites needed a
 * runtime helper alongside the type, their `import type` would become a value
 * import and drag the Supabase client into the check scripts' module graph,
 * where it would fail at import time. Keeping the type here makes that
 * impossible rather than merely unlikely.
 */

export type ImageRef =
  /** A bundled asset, served from the site. */
  | { kind: 'url'; src: string }
  /** An upload, stored per-account at `<uid>/<id>`. */
  | { kind: 'blob'; id: string }
