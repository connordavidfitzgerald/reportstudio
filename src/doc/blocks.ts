import type { ImageRef } from './imageStore'
import type { BodySizeId, InkAlphaId, SurfaceId } from '../config/brand'
import type { LocalizedText } from './localized'

/**
 * The component vocabulary.
 *
 * This is a transcription, not a design: every kind below exists because one of
 * the 11 spreads in the *Tools for Change* file needs it, and nothing exists
 * that none of them use. When a twelfth spread needs something new, add a kind —
 * don't reach for a generic box.
 *
 * A block says *what a thing is* and *which columns it occupies*. It never says
 * what vertical position it has: that is the compositor's return value, which is
 * what makes a mis-stacked page unrepresentable rather than merely discouraged.
 *
 * Every text-bearing field is {@link LocalizedText}, which is a plain string
 * until it actually needs a translation.
 */

export type BlockId = string

interface BlockBase {
  id: BlockId
  /**
   * Column run within the leaf's nine columns. Defaults to the full measure
   * (col 0, span 9).
   *
   * The file only ever uses a handful of runs — full, `col 1 span 7` for quotes
   * and figures, `col 4 span 5` for the about-author column, `col 0 span 6` for
   * the colophon — and all of them land on real column lines. See
   * `config/brand.ts` for the measurements.
   */
  col?: number
  span?: number
  /** Force this block onto a new leaf. */
  breakBefore?: boolean
  /** Don't strand this block at the foot of a leaf. Default true for headings. */
  keepWithNext?: boolean
}

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

/** Chapter opener. 53.8pt in the *text* voice — see the note in `brand.ts`. */
export interface HeadingBlock extends BlockBase {
  kind: 'heading'
  text: LocalizedText
}

/** The definition sitting under a chapter title, at 25.9. */
export interface DeckBlock extends BlockBase {
  kind: 'deck'
  text: LocalizedText
}

/**
 * Running text at the leaf's body size, first-line indented by a flat 64pt with
 * no space between paragraphs.
 */
export interface ParaBlock extends BlockBase {
  kind: 'para'
  text: LocalizedText
  /** False for an opening paragraph, which is set flush. */
  indent?: boolean
  /** Override the leaf's body size for this one block. */
  size?: BodySizeId
}

/** The ruled caps band that introduces a subsection: rule, label, rule, 23.2pt. */
export interface SubheadBlock extends BlockBase {
  kind: 'subhead'
  text: LocalizedText
}

/** "Resources", "Related Articles" — a 25.9pt heading inside a body page. */
export interface SectionHeadingBlock extends BlockBase {
  kind: 'sectionHeading'
  text: LocalizedText
}

/** A bare hairline separator. The findings pages use these between passages. */
export interface RuleBlock extends BlockBase {
  kind: 'rule'
}

/** Vertical air. The file leaves real gaps on the chapter openers. */
export interface SpacerBlock extends BlockBase {
  kind: 'spacer'
  /** Points. */
  height: number
}

/**
 * A pulled passage, set at 18pt and inset to seven columns. Unlike
 * {@link QuoteOverlayBlock} this is plain text on the page, not a swash.
 */
export interface QuoteBlock extends BlockBase {
  kind: 'quote'
  text: LocalizedText
  attribution?: LocalizedText
}

// ---------------------------------------------------------------------------
// Shouted
// ---------------------------------------------------------------------------

/**
 * The big condensed statement, on a swash that hugs each wrapped line.
 *
 * `highlights` are the phrases that sit *on* the swash; everything else is set
 * at the `strong` ink alpha over the bare surface. On the exec-summary plate
 * that is "21 ORGANIZERS", "16 ORGANIZATIONS" and "6 PROVINCES".
 */
export interface StatementBlock extends BlockBase {
  kind: 'statement'
  text: LocalizedText
  highlights?: string[]
  /** The "(Ontario, Quebec, …)" line under it. */
  note?: LocalizedText
}

/**
 * Condensed caps centred over a photograph, on a per-line swash.
 *
 * Distinct from `statement` because it is a caption on a plate rather than a
 * block in a flow: it is positioned within a {@link PlateLeaf}, not stacked.
 */
export interface QuoteOverlayBlock extends BlockBase {
  kind: 'quoteOverlay'
  text: LocalizedText
  /** Fraction of leaf height for the overlay's centre. */
  atY?: number
}

// ---------------------------------------------------------------------------
// Set blocks
// ---------------------------------------------------------------------------

/**
 * Term and definition, ruled above each row — the executive-summary spread.
 *
 * The term sits in columns 0–2 and the definition in 5–8, which is the widest
 * gap in the design and the reason those pages read as a glossary rather than a
 * table. Rows split between one another but never inside one.
 */
export interface DefListBlock extends BlockBase {
  kind: 'defList'
  rows: { term: LocalizedText; def: LocalizedText }[]
}

/** Bulleted items, optionally in two columns as the methodology page does. */
export interface BulletListBlock extends BlockBase {
  kind: 'bulletList'
  items: LocalizedText[]
  columns?: 1 | 2
}

/** A resources block: underlined links, each with an optional trailing note. */
export interface LinksBlock extends BlockBase {
  kind: 'links'
  items: { label: LocalizedText; href?: string; note?: LocalizedText }[]
}

/** Stacked label/value credits — the colophon. */
export interface CreditsBlock extends BlockBase {
  kind: 'credits'
  rows: { label: LocalizedText; value: LocalizedText }[]
}

// ---------------------------------------------------------------------------
// Figures
// ---------------------------------------------------------------------------

/** An image, with an optional caption on a swash under it. */
export interface FigureBlock extends BlockBase {
  kind: 'figure'
  imageRef: ImageRef | null
  caption?: LocalizedText
  /** Height as a multiple of the block's own width. */
  aspect?: number
  /** Cover-fit focal point, 0..1 on each axis. Defaults to centred. */
  focus?: { x: number; y: number }
}

/**
 * The horizontal bar chart: a colour bar, a fitted condensed percentage, a
 * label and an optional lighter sub-label.
 *
 * A bar's width *is* its value, which makes it the one deliberate exception to
 * the column grid in the whole system.
 */
export interface ChartBlock extends BlockBase {
  kind: 'chart'
  series: { label: LocalizedText; sublabel?: LocalizedText; value: number }[]
  /** Appended to each value. Empty for a plain count. */
  unit?: string
  /** Full-scale value. Omit to use the largest in the series. */
  max?: number
}

// ---------------------------------------------------------------------------
// Contents
// ---------------------------------------------------------------------------

/**
 * One table-of-contents entry: a chapter row on a swash with its folio, plus
 * indented sub-rows.
 *
 * `qualifier` is the parenthetical set smaller inline — "doing
 * **(campaigns/actions)**" — which the file sets at 14 against the row's 18.
 */
export interface TocEntryBlock extends BlockBase {
  kind: 'tocEntry'
  label: LocalizedText
  folio: number
  sections?: { label: LocalizedText; qualifier?: LocalizedText; folio: number }[]
}

// ---------------------------------------------------------------------------
// Generic
// ---------------------------------------------------------------------------

/**
 * A free run of text in any of the named roles.
 *
 * The escape hatch, deliberately last and deliberately narrow: it can only pick
 * a role that already exists, so it can express a heading in an unusual place
 * but not an off-system size.
 */
export interface TextBlock extends BlockBase {
  kind: 'text'
  text: LocalizedText
  role: 'runningHead' | 'caption' | 'credits' | 'link' | 'statementNote' | 'subhead'
  alpha?: InkAlphaId
  align?: 'left' | 'center' | 'right'
}

export type Block =
  | HeadingBlock
  | DeckBlock
  | ParaBlock
  | SubheadBlock
  | SectionHeadingBlock
  | RuleBlock
  | SpacerBlock
  | QuoteBlock
  | StatementBlock
  | QuoteOverlayBlock
  | DefListBlock
  | BulletListBlock
  | LinksBlock
  | CreditsBlock
  | FigureBlock
  | ChartBlock
  | TocEntryBlock
  | TextBlock

export type BlockKind = Block['kind']

/**
 * Blocks that may be split across a leaf boundary.
 *
 * Definition and link lists split *between* rows, never inside one — a term
 * separated from its definition would be worse than a short page.
 */
export const isSplittable = (b: Block): boolean =>
  b.kind === 'para' || b.kind === 'bulletList' || b.kind === 'defList' || b.kind === 'links'

/** Headings hold onto what follows them; nothing else does by default. */
export const keepsWithNext = (b: Block): boolean =>
  b.keepWithNext ??
  (b.kind === 'heading' || b.kind === 'subhead' || b.kind === 'sectionHeading' || b.kind === 'deck')

/**
 * Which surfaces a block reads correctly on.
 *
 * Only used to warn in the editor: a pink swash on a pink page is invisible, and
 * `swashFor` already falls back, but a statement is the one block where that
 * fallback changes the design rather than rescuing it.
 */
export const wantsSwash = (b: Block): boolean =>
  b.kind === 'statement' || b.kind === 'quoteOverlay' || b.kind === 'tocEntry'

export const swashClashes = (b: Block, surface: SurfaceId): boolean =>
  wantsSwash(b) && surface === 'pink'

let seq = 0
export const blockId = (): BlockId => `bk_${Date.now().toString(36)}_${(seq++).toString(36)}`
