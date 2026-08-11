# `src/core` — the Le Hub brand rendering core

Every file here is **synced from `~/projects/ig-poster-generator`**, the Instagram
poster generator. They are the pure, React-free (or React-only-primitive) pieces
that define the brand's *look*: the CMYK halftone shader, the notched-outline
text treatment, the fitted-badge drawing primitives, the paper-texture overlay,
the type scale, palettes and the shared control-panel components.

## Rules

1. **Fix bugs and change brand tokens in the poster app first**, then copy the
   file across. The poster is the client-facing original; the two must not drift.
2. Nothing in here may import from `src/doc`, `src/render`, `src/store` or
   `src/components`. The dependency arrow points one way: app → core. If a core
   file needs a type, it goes in `core/types.ts`.
3. Sizes are always expressed as a fraction of the canvas short edge, never in
   absolute pixels, so every primitive works at any page size and export scale.

## Deltas from the poster app

These are the only intentional differences; keep the list current.

- `types.ts` — new. Holds the visual types the poster kept in its app-level
  `src/types.ts` (`Palette`, `PaperPreset`, `HalftoneParams`, `Rect`,
  `TextAlign`, `SecondaryPos`), plus `TextBlockLike`.
- `elements.ts` — the secondary-text helpers took the poster's `Paragraph`;
  they now take `TextBlockLike`, the two-and-a-bit fields they actually read.
- `config/constants.ts` — dropped `ASPECTS` (see `src/config/formats.ts`),
  `MAX_PARAGRAPHS` and `EDITORIAL_HEADER_SIZES`, all poster-layout-only.
  `TYPE_BASE` is still exported but the app doesn't use it: step 0 is re-based
  per format in `src/config/formats.ts`, because 3.5% of the short edge is right
  for a poster on a phone and is 21pt body copy on a printed report.
- `halftone/halftoneRenderer.ts` — three changes, all forced by deck scale:
  - the LRU budget is **pixels** (24M ≈ 96MB), not 16 entries. A 3840×2160
    snapshot is 33MB, so counting entries budgets the wrong thing.
  - `getHalftone` takes `{ cache: false }`, used per page during export — those
    results are used once and would otherwise evict the live preview.
  - it returns `null` instead of throwing when WebGL is missing, and exports
    `isHalftoneAvailable()`. A thrown `'WebGL not available'` was survivable in a
    one-poster tool and would kill a 40-page export here.
- `imageStore.ts` — `DB_NAME` is `lehub.images.v1`. Decoding a ref into an
  element now belongs to `src/doc/imageCache.ts`, which keeps decoded bitmaps
  out of the document and therefore out of undo snapshots.
- Import paths rewritten for the flatter `core/` layout.
