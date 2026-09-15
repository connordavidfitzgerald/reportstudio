import type { ImageRef } from './imageRef'
import { GAP, type BodySizeId, type InkAlphaId, type SurfaceId } from '../config/brand'
import type { LocalizedText } from './localized'
import type { MarkMap } from './marks'

/**
 * The component vocabulary.
 *
 * This is a transcription, not a design: every kind below exists because one of
 * the 11 spreads in the *Tools for Change* file needs it, and nothing exists
 * that none of them use. When a twelfth spread needs something new, add a kind —
 * don't reach for a generic box.
 *
 * A block says *what a thing is*, *which columns it occupies*, and — once
 * somebody has dragged it — *which row line it starts on*. It has never been
 * able to say more than that about where it sits, and still can't: `top` is a
 * floor the flow may push past, not a coordinate (see {@link BlockBase.top}),
 * so a mis-stacked page — two components overlapping, one above the measure —
 * stays unrepresentable rather than merely discouraged.
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
  /**
   * Where this block would like its top edge, in page points.
   *
   * ## A floor, not a coordinate
   *
   * The compositor stacks the page exactly as it always did, and then, for a
   * block that has one of these, takes `max(whereTheFlowPutIt, top)`. So it can
   * push a block *down* the page from where the flow would have put it, and can
   * never pull it up into the block above: two components cannot be made to
   * overlap, and nothing can be dragged off the top of the measure. A page
   * nobody has dragged anything on has none of these and stacks unchanged.
   *
   * ## Why the flow stopped being the whole story
   *
   * It used to be `gapBefore` — extra room *before* a block, which the flow then
   * carried down into everything after it. That is the correct model for a
   * document and the wrong one for a page you are arranging by hand: dragging
   * one component down the page shoved every component below it down too, so
   * placing the second thing moved the first, and placing the third moved both.
   * People who are not typesetters read that as the editor fighting them.
   *
   * A top that the flow cannot pull back up gives the same guarantee (no
   * overlap, nothing above the measure) without the knock-on. `moveBlockTo`
   * pins the rest of the leaf where it already sits when a drag lands, so the
   * thing you dropped is the only thing that moved.
   *
   * ## It is always on a snap line
   *
   * Written only by a drag, and only ever to a line the drag offered: a row line
   * of the {@link import('../config/brand').ROWS} grid, the foot of a
   * neighbouring block plus `GAP.block`, or the bottom margin less this block's
   * own height. See `placementAt` in `components/canvas/useBlockDrag.ts`.
   * Absent — which is every block until somebody moves it — means pure flow.
   */
  top?: number
  /** Force this block onto a new leaf. */
  breakBefore?: boolean
  /** Don't strand this block at the foot of a leaf. Default true for headings. */
  keepWithNext?: boolean
  /**
   * Set this block in the other brand voice.
   *
   * Absent — which is the normal case — means the voice its kind implies: a
   * chapter title is display, body copy is text (see `config/brand.ts`, where
   * the split is by *function*, not by size). This is the override for the
   * occasion when a paragraph wants to shout, and it is on the base rather than
   * on the text kinds because the toolbar offers it wherever there are words.
   *
   * Note the display voice is always set in caps, so switching to it changes
   * the case as well as the face — see `editableStyle` in `render/compose.ts`.
   */
  voice?: 'display' | 'text'
  /**
   * Bold, italic, underline and links, as ranges over this block's fields.
   *
   * Keyed by field path, so `['rows', 2, 'term']` and `['text']` each carry
   * their own. Absent means plain text, which is what nearly every block is —
   * see `doc/marks.ts` for why they live beside the text rather than in it.
   */
  marks?: MarkMap
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
 * Running text at the leaf's body size.
 *
 * `indent` opts into the classic book setting the file uses on its long-form
 * pages: a flat 64pt first line, no space between paragraphs. It is **off by
 * default**, which is the opposite of what this block used to do.
 *
 * The reason is that the default is what an empty paragraph gets when somebody
 * adds one, and a lone indented paragraph on a page is not book setting — it is
 * a typo. Indent-by-default only reads as a design where paragraphs run on in a
 * column, which is a decision about the page, not about the block. Documents
 * written before this flip carry an explicit `indent: true` (migration v9), so
 * nothing already set reflows.
 */
export interface ParaBlock extends BlockBase {
  kind: 'para'
  text: LocalizedText
  /** True for running text set as a book sets it. See above. */
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

/**
 * Vertical air. The file leaves real gaps on the chapter openers.
 *
 * `'fill'` absorbs whatever is left on the leaf, pushing everything after it to
 * the foot. Several pages are bottom-aligned that way — the colophon credits,
 * the author's portrait — and expressing those as a measured gap means the page
 * silently overruns its foot rule as soon as the copy above grows by a line.
 * Two fill spacers on one leaf split the remainder between them.
 */
export interface SpacerBlock extends BlockBase {
  kind: 'spacer'
  /** Points, or `'fill'` for whatever is left. */
  height: number | 'fill'
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
 * The phrases that sit *on* the swash are `h` marks over `text` (see
 * `doc/marks.ts`); everything else is set at the `strong` ink alpha over the
 * bare surface. On the exec-summary plate that is "21 ORGANIZERS",
 * "16 ORGANIZATIONS" and "6 PROVINCES".
 *
 * They used to be a `highlights: string[]` of phrases matched against the text
 * at paint time. Migration v9 converted them to marks.
 */
export interface StatementBlock extends BlockBase {
  kind: 'statement'
  text: LocalizedText
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

/**
 * Rows and columns of text, on the nine-column grid.
 *
 * ## `widths` are weights, not spans
 *
 * The obvious model is "column 1 is three grid columns wide". It breaks the
 * moment the block itself is resized — drag a table from nine columns down to
 * six and every stored width is now a lie, and the painter has to either
 * overflow the measure or silently rewrite the document as it draws.
 *
 * So a width is a *share*. `[2, 1, 1]` means the first column gets twice what
 * the others do, whatever the block currently spans, and `render/compose.ts`
 * allocates whole grid columns against those shares at paint time. The table
 * is always on the grid and always inside its own run, and neither fact depends
 * on the document being kept in step with itself.
 *
 * ## Not splittable
 *
 * A table that ran over a page break would need its header repeated on the
 * second page, its rows split only between rows, and a rule at both edges of
 * the break. None of that is hard, and all of it is a second feature — see
 * `isSplittable` below, where the choice is stated rather than assumed.
 */
export interface TableBlock extends BlockBase {
  kind: 'table'
  /** Relative share of the measure per column. Length is the column count. */
  widths: number[]
  /** Set the first row as a header: caps, with a rule under it. */
  header?: boolean
  /** Row-major: `rows[r][c]`. Every row has `widths.length` cells. */
  rows: LocalizedText[][]
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
  /**
   * A colour field behind the image, which the image then sits inset on.
   *
   * The executive-summary globe is drawn this way: a 515 × 557 pink panel with
   * a 464pt cut-out centred on it. The panel is the block's full width and the
   * image is inset by {@link inset} on every side.
   */
  panel?: SurfaceId
  /** Points the image is inset from the panel. Ignored without a panel. */
  inset?: number
}

/**
 * A colour band with text in it, running to the trim.
 *
 * The caption on the contents-facing plate is one of these: a pink field from
 * the left margin to the right edge of the page, 115pt tall, with the text
 * padded 10pt inside it. It is not a caption on a swash and it does not sit on
 * the measure — which is exactly why it needs its own kind rather than being
 * bent out of {@link TextBlock}.
 */
export interface BandBlock extends BlockBase {
  kind: 'band'
  text: LocalizedText
  surface: SurfaceId
  /** Which edges run past the margin to the trim. */
  bleed?: 'left' | 'right' | 'both' | 'none'
  /** Points of padding inside the band. */
  pad?: number
  /** Body size for the text inside. */
  size?: BodySizeId
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
// Cover
// ---------------------------------------------------------------------------

/**
 * The table of contents, worked out from the document rather than typed.
 *
 * Carries nothing at all — every row, every section under it and every page
 * number comes from `deriveContents` at paint time. That is the whole feature:
 * set a chapter on a page in Page Settings and it appears here; move a spread
 * and the numbers follow; and the contents can never quietly disagree with the
 * pages it points at, which is exactly what {@link TocEntryBlock} could always
 * do, since its folio was a number somebody typed and nothing ever checked.
 *
 * `tocEntry` is kept for the row somebody wants to place and word by hand, and
 * for the documents that already contain them.
 */
export interface ContentsBlock extends BlockBase {
  kind: 'contents'
}

/**
 * The cover, as one component.
 *
 * It is a single block rather than a stack of generic ones because it is the
 * only page in the document that is genuinely *composed*: the cut-out overlaps
 * the title, the title bleeds past the margin, and the image runs off the foot
 * of the page. Expressing that as a flow of blocks would mean inventing
 * absolute offsets for each part and calling them a stack.
 *
 * Its geometry is measured from the file and lives in the painter — see
 * `render/compose.ts`. Only the content is authored here.
 */
export interface CoverBlock extends BlockBase {
  kind: 'cover'
  title: LocalizedText
  subtitle: LocalizedText
  imageRef: ImageRef | null
  /** The wordmark at the foot. Set in mixed case, deliberately. */
  wordmark?: LocalizedText
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
  | TableBlock
  | FigureBlock
  | BandBlock
  | ChartBlock
  | TocEntryBlock
  | ContentsBlock
  | CoverBlock
  | TextBlock

export type BlockKind = Block['kind']

/**
 * A block without its id — one union member at a time.
 *
 * `Omit<Block, 'id'>` looks like it should do this and does something quite
 * different: `keyof` a union is the *intersection* of its keys, so that
 * expression collapses to just the fields every kind shares and silently
 * rejects `text`, `rows`, `series` and the rest. Mapping over the kinds keeps
 * each member intact, so a seed is checked against its own shape.
 */
export type BlockSeed = {
  [K in BlockKind]: Omit<Extract<Block, { kind: K }>, 'id'>
}[BlockKind]

/**
 * Blocks that may be split across a leaf boundary.
 *
 * Definition and link lists split *between* rows, never inside one — a term
 * separated from its definition would be worse than a short page.
 */
/**
 * The clearance between a dragged block and the one it is tucked under.
 *
 * `GAP.block` — the gap the design system already puts between every two
 * components — so "put this directly below that" produces the spacing the
 * stack would have produced anyway, and a block cannot come to rest 3pt under
 * its neighbour looking like a collision.
 *
 * This is one of the snap targets a vertical drag offers; the others are the
 * row lines in `config/brand.ts`. Note that neither is a baseline grid, which
 * that module is emphatic the design does not have: this snaps where a
 * *component* starts, never the lines of type inside it.
 */
export const DROP_CLEARANCE = GAP.block

export const isSplittable = (b: Block): boolean =>
  // Deliberately not `table`: see the note on {@link TableBlock}. A table that
  // broke across leaves would need its header repeated on the second page and
  // a rule at both sides of the break, and half of that is worse than none.
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
  b.kind === 'quoteOverlay' ||
  b.kind === 'tocEntry' ||
  // A statement only wants one if some of its words are actually highlighted.
  // It is the common case, but an unhighlighted statement on a pink page is
  // fine and warning about it would be noise.
  (b.kind === 'statement' && hasHighlight(b))

/** Does any field of this block carry a highlight mark, in any language? */
const hasHighlight = (b: Block): boolean =>
  Object.values(b.marks ?? {}).some((byLang) =>
    Object.values(byLang).some((marks) => marks?.some((m) => m.h)),
  )

export const swashClashes = (b: Block, surface: SurfaceId): boolean =>
  wantsSwash(b) && surface === 'pink'

let seq = 0
export const blockId = (): BlockId => `bk_${Date.now().toString(36)}_${(seq++).toString(36)}`
