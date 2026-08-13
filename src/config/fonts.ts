/**
 * The two brand voices, and the four cuts each of them can be set in.
 *
 * The `@font-face` declarations live in `src/index.css` and the `.otf` files in
 * `src/fonts/`; this module names the families and forces them to load, since a
 * canvas draw never triggers the lazy fetch.
 *
 * See `config/brand.ts` for which type roles use which voice — the split is by
 * function, not by size, and chapter titles being the *text* voice is the part
 * that surprises people.
 *
 * ## Why every cut has its own family name
 *
 * `"Neue Haas Grotesk Bd"` rather than `"Neue Haas Grotesk"` at weight 700, and
 * a separate family again for the italic. Two reasons, and both are things that
 * fail silently:
 *
 *   - A canvas asked for an italic of a family with no registered italic face
 *     will *synthesise* an oblique by shearing the roman. It looks approximately
 *     right on screen and is not the typeface.
 *   - The PDF exporter recovers the face from the recorded `ctx.font` string,
 *     and `export/pdfFonts.ts` keys it on the quoted family alone. Two cuts
 *     sharing a family name would map to one embedded font, and the PDF would
 *     print roman where the screen showed italic.
 *
 * With distinct families both problems are impossible rather than merely
 * unlikely, and neither the recorder nor the parser needs to know cuts exist.
 */

export interface BrandFont {
  /** CSS family name; must match the @font-face in index.css. */
  family: string
  weight: string
  /** Used only if the real font fails to load. */
  fallback: string
}

export type Voice = 'display' | 'text'
export type FontVariant = 'regular' | 'bold' | 'italic' | 'boldItalic'

const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif'
const CONDENSED = '"Arial Narrow", "Helvetica Neue Condensed", sans-serif'

/** Review Condensed Heavy. */
export const DISPLAY_FONT: BrandFont = {
  family: 'Review Condensed',
  weight: '800',
  fallback: CONDENSED,
}

/** Neue Haas Grotesk Display Pro, 65 Medium. */
export const TEXT_FONT: BrandFont = {
  family: 'Neue Haas Grotesk',
  weight: '500',
  fallback: SANS,
}

/**
 * Every cut, by voice.
 *
 * Review Condensed Heavy is already the boldest weight the family has, so the
 * display voice maps `bold` back onto the roman: bolding a statement is a no-op
 * by design, and the toolbar disables the control there rather than pretending.
 */
export const FONTS: Record<Voice, Record<FontVariant, BrandFont>> = {
  display: {
    regular: DISPLAY_FONT,
    bold: DISPLAY_FONT,
    italic: { family: 'Review Condensed It', weight: '800', fallback: CONDENSED },
    boldItalic: { family: 'Review Condensed It', weight: '800', fallback: CONDENSED },
  },
  text: {
    regular: TEXT_FONT,
    bold: { family: 'Neue Haas Grotesk Bd', weight: '700', fallback: SANS },
    italic: { family: 'Neue Haas Grotesk It', weight: '500', fallback: SANS },
    boldItalic: { family: 'Neue Haas Grotesk BdIt', weight: '700', fallback: SANS },
  },
}

export const variantFor = (bold?: boolean, italic?: boolean): FontVariant =>
  bold && italic ? 'boldItalic' : bold ? 'bold' : italic ? 'italic' : 'regular'

export const fontFor = (voice: Voice, variant: FontVariant = 'regular'): BrandFont =>
  FONTS[voice][variant]

/** A canvas `font` string. The custom family wins once loaded. */
export const fontString = (font: BrandFont, sizePx: number): string =>
  `${font.weight} ${sizePx}px "${font.family}", ${font.fallback}`

/** Every distinct cut, for loading and for embedding. */
export const ALL_FONTS: BrandFont[] = [
  ...new Map(
    [...Object.values(FONTS.display), ...Object.values(FONTS.text)].map((f) => [f.family, f]),
  ).values(),
]

/**
 * Force every cut to download.
 *
 * Every measured line break in the document depends on these metrics, so
 * nothing should lay out until this resolves — `index.css` uses
 * `font-display: block` for the same reason. The interface's own face
 * (ABC Favorit) is deliberately *not* here: it never touches a canvas, so
 * blocking the first paint on it would be paying the document's price for
 * nothing.
 */
export async function loadFonts(): Promise<void> {
  await Promise.all(
    ALL_FONTS.map((f) => document.fonts.load(`${f.weight} 64px "${f.family}"`)),
  )
  await document.fonts.ready
}
