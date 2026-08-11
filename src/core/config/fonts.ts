/**
 * The two brand voices. The `@font-face` declarations live in `src/index.css`
 * and the `.otf` files in `src/fonts/`; this module only names the families and
 * forces them to load so canvas rendering can use them.
 *
 * Measured from the *Tools for Change* redesign:
 *
 *   display → Review Condensed Heavy (800)
 *             running heads, folios, cover title, TOC rows, stat numbers,
 *             definition-list terms, pull-quote overlays.
 *   text    → Neue Haas Grotesk Display Pro, 65 Medium (500)
 *             chapter titles, ledes, body, sub-heads, captions.
 *
 * Note `text` is Neue Haas Grotesk, *not* Helvetica Neue Bold — the deck tool
 * shipped with Helvetica because that was the best guess before the redesign was
 * measured. Both real font files are still outstanding; see the stand-ins noted
 * in `src/index.css`.
 */
export interface BrandFont {
  /** CSS family name (must match the @font-face in index.css). */
  family: string
  weight: string
  /** Fallback stack used until (or if) the real font loads. */
  fallback: string
}

/** Review Condensed Heavy. */
export const DISPLAY_FONT: BrandFont = {
  family: 'Review Condensed',
  weight: '800',
  fallback: '"Arial Narrow", "Helvetica Neue Condensed", sans-serif',
}

/** Neue Haas Grotesk Display Pro 65 Medium. */
export const TEXT_FONT: BrandFont = {
  family: 'Neue Haas Grotesk',
  weight: '500',
  fallback: '"Helvetica Neue", Helvetica, Arial, sans-serif',
}

/**
 * Role names inherited from the poster app, where the two voices split along
 * header/secondary lines. They mean the same two fonts — prefer the `display` /
 * `text` names in new code, which match how the report's type roles are keyed.
 */
export const HEADER_FONT = DISPLAY_FONT
export const SECONDARY_FONT = TEXT_FONT

/** Resolve a `TypeRole.family` to its font. */
export const fontFor = (family: 'display' | 'text'): BrandFont =>
  family === 'display' ? DISPLAY_FONT : TEXT_FONT

/** Build a canvas `font` string. The custom family wins when loaded. */
export const fontString = (font: BrandFont, sizePx: number): string =>
  `${font.weight} ${sizePx}px "${font.family}", ${font.fallback}`

/**
 * Force the brand fonts to download so they're available to canvas rendering.
 * `document.fonts.load` triggers the lazy @font-face fetch (canvas draws never
 * would on their own), then we await overall readiness.
 */
export async function loadFonts(): Promise<void> {
  await Promise.all(
    [DISPLAY_FONT, TEXT_FONT].map((f) =>
      document.fonts.load(`${f.weight} 64px "${f.family}"`),
    ),
  )
  await document.fonts.ready
}
