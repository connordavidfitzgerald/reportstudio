/**
 * Types owned by the brand rendering core. Everything here describes *how
 * something looks*, never what document it belongs to — that keeps `src/core/`
 * free of any dependency on the deck model in `src/doc/types.ts`.
 */

export type Rect = { x: number; y: number; w: number; h: number }

/** Horizontal alignment, shared by every text primitive. */
export type TextAlign = 'left' | 'center' | 'right'

/** Corner anchoring, used by the icon set in `ui.tsx`. */
export type SecondaryPos = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface Palette {
  id: string
  label: string
  /** Page fill. */
  background: string
  /** Background behind secondary/body text. */
  secondaryBg: string
  /** Background behind a label chip. */
  highlight: string
}

export interface PaperPreset {
  id: string
  label: string
  /** null = "None". Otherwise a URL/import to the full-resolution texture. */
  src: string | null
  /**
   * Small stand-in shown while `src` downloads. Every paper is enabled by
   * default, so the previews give the first paint a texture in a few KB.
   */
  previewSrc: string | null
  blend: GlobalCompositeOperation
  defaultOpacity: number
}

export interface HalftoneParams {
  /** Halftone cell size in page pixels (dot pitch). */
  dotScale: number
  contrast: number
  brightness: number
  saturation: number
  /** Lift (+) or deepen (-) the dark tones. Range -1..1, 0 = neutral. */
  shadows: number
  /** Brighten (+) or recover (-) the bright tones. Range -1..1, 0 = neutral. */
  highlights: number
  /** Screen angles in degrees for C, M, Y, K. */
  angleC: number
  angleM: number
  angleY: number
  angleK: number
  /** Dot edge softness (0 = crisp, higher = softer). */
  sharpness: number
}

/**
 * The shape `elements.ts` needs to render one run of secondary text. The deck's
 * `TextElement` is structurally compatible, so it can be passed straight in —
 * this is deliberately the *smallest* contract, not a document type.
 */
export interface TextBlockLike {
  text: string
  /** Fitted badges hugging each wrapped line, or a fixed-width block. */
  style: 'fitted' | 'paragraph'
  side: TextAlign
}
