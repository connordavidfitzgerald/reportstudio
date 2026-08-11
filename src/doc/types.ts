import type { HalftoneParams, TextAlign } from '../core/types'
import type { ImageRef } from '../core/imageStore'
import type { FormatId } from '../config/formats'
import type { Section } from './sections'

/**
 * A grid box — the *only* positional state an element has. There are no pixel
 * coordinates anywhere in the document, so an off-grid element can't be
 * expressed. Snapping is structural, not a rule the editor has to enforce.
 */
export interface Box {
  col: number
  row: number
  colSpan: number
  rowSpan: number
}

interface ElementBase {
  id: string
  box: Box
  /** Locked elements are skipped by hit-testing (template furniture, page numbers). */
  locked?: boolean
}

/**
 * Which primitive in `core/elements.ts` draws this text, and therefore how it
 * behaves:
 *   header    → notched outline fitted to the text  (drawHeaderBlock)
 *   badge     → a fitted box hugging each wrapped line  (drawFittedParagraphs)
 *   paragraph → a full-width block with a fitted last line  (drawParagraph)
 *   plain     → glyphs only, no background
 */
export type TextVariant = 'header' | 'badge' | 'paragraph' | 'plain'

/**
 * A background colour named by its *role* in the palette rather than by hex, so
 * changing the deck's palette restyles every page at once.
 */
export type BgRole = 'outline' | 'secondary' | 'highlight' | 'background' | 'ink' | 'none'

export interface TextElement extends ElementBase {
  kind: 'text'
  text: string
  variant: TextVariant
  /** Step on the modular scale: size = shortEdge × typeStep(step). Never a raw px value. */
  step: number
  /** `header` only: size the type to fill the box width instead of using `step`. */
  autoFit?: boolean
  align: TextAlign
  vAlign: 'top' | 'middle' | 'bottom'
  bg: BgRole
  /**
   * True (the default) = `box.rowSpan` follows the measured text height, so a box
   * grows downward as you type. False = the user dragged the bottom edge and owns
   * the height from then on.
   */
  autoHeight: boolean
}

export interface ImageElement extends ElementBase {
  kind: 'image'
  /**
   * The image's serializable origin — and the *only* thing stored. The decoded
   * `HTMLImageElement` lives outside the document in `doc/imageCache.ts`, so a
   * page is plain JSON, persisting is a bare `JSON.stringify`, and a history
   * snapshot can never pin megabytes of decoded bitmap.
   */
  imageRef: ImageRef | null
  /** Cover-fit focal point, 0..1 on each axis. Defaults to centred. */
  focus?: { x: number; y: number }
  /** null = draw the source image untouched, no shader pass. */
  halftone: HalftoneParams | null
}

/** A flat palette-colour rectangle — the colour-field blocks in the brand system. */
export interface BlockElement extends ElementBase {
  kind: 'block'
  bg: BgRole
}

export interface LogoElement extends ElementBase {
  kind: 'logo'
}

export type PageElement = TextElement | ImageElement | BlockElement | LogoElement
export type ElementKind = PageElement['kind']

export interface Page {
  id: string
  /** Per-page palette override; falls back to the deck's. */
  paletteId?: string
  /** Paint order — later elements sit on top. */
  elements: PageElement[]
  /** Which template seeded this page, for reference only. */
  templateId?: string
}

export interface Deck {
  format: FormatId
  paletteId: string
  /** Active paper textures, layered in order. Empty = none. */
  paperIds: string[]
  /** Per-paper opacity (0..1), keyed by paper id. */
  paperOpacities: Record<string, number>
  /**
   * What the document is authored as. Rendered pages are derived from this via
   * `deckPages()` in `doc/sections.ts` — today 1:1, but a flow section will
   * expand to as many pages as its content needs.
   */
  sections: Section[]
}
