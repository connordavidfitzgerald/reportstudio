/**
 * The two brand voices. The `@font-face` declarations live in `src/index.css`
 * and the `.otf` files in `src/fonts/`; this module names the families and
 * forces them to load, since a canvas draw never triggers the lazy fetch.
 *
 * See `config/brand.ts` for which type roles use which voice — the split is by
 * function, not by size, and chapter titles being the *text* voice is the part
 * that surprises people.
 */

export interface BrandFont {
  /** CSS family name; must match the @font-face in index.css. */
  family: string
  weight: string
  /** Used only if the real font fails to load. */
  fallback: string
}

/** Review Condensed Heavy. */
export const DISPLAY_FONT: BrandFont = {
  family: 'Review Condensed',
  weight: '800',
  fallback: '"Arial Narrow", "Helvetica Neue Condensed", sans-serif',
}

/** Neue Haas Grotesk Display Pro, 65 Medium. */
export const TEXT_FONT: BrandFont = {
  family: 'Neue Haas Grotesk',
  weight: '500',
  fallback: '"Helvetica Neue", Helvetica, Arial, sans-serif',
}

export const fontFor = (voice: 'display' | 'text'): BrandFont =>
  voice === 'display' ? DISPLAY_FONT : TEXT_FONT

/** A canvas `font` string. The custom family wins once loaded. */
export const fontString = (font: BrandFont, sizePx: number): string =>
  `${font.weight} ${sizePx}px "${font.family}", ${font.fallback}`

/**
 * Force both faces to download.
 *
 * Every measured line break in the document depends on these metrics, so
 * nothing should lay out until this resolves — `index.css` uses
 * `font-display: block` for the same reason.
 */
export async function loadFonts(): Promise<void> {
  await Promise.all(
    [DISPLAY_FONT, TEXT_FONT].map((f) => document.fonts.load(`${f.weight} 64px "${f.family}"`)),
  )
  await document.fonts.ready
}
