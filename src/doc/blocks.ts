import type { ImageRef } from '../core/imageStore'
import type { LocalizedText } from './localized'

/**
 * The authoring vocabulary for flowed content.
 *
 * A block says *what a thing is* — a chapter title, a paragraph, a pull quote —
 * and never where it goes. Position is the paginator's return value, which is why
 * blocks carry no `Box`: an off-grid or mis-paginated block is unrepresentable
 * rather than merely discouraged, the same guarantee `Box` gives hand-placed
 * elements.
 *
 * Blocks compile to the existing `PageElement` vocabulary (see `render/flow.ts`),
 * so flowed content reaches the same measuring and drawing code as everything
 * else. There is no second renderer.
 *
 * Every text-bearing field is {@link LocalizedText}, which is a plain string
 * until it actually needs a translation.
 */

export type BlockId = string

interface BlockBase {
  id: BlockId
  /**
   * Force a page break *before* this block.
   *
   * Deliberately a field on the block rather than an anchored override: delete
   * the block and the break dies with it, correctly, with no reconciliation code
   * to write. Only things that outlive any single block — pinned elements, page
   * styling — need anchors.
   */
  breakBefore?: boolean
  /**
   * Don't leave this block stranded as the last thing on a page. Defaults to true
   * for headings and sub-heads, which is where it matters.
   */
  keepWithNext?: boolean
}

/** Chapter opener. Large, sentence case, in the text voice. */
export interface HeadingBlock extends BlockBase {
  kind: 'heading'
  text: LocalizedText
}

/** The ruled caps band that introduces a subsection. */
export interface SubheadBlock extends BlockBase {
  kind: 'subhead'
  text: LocalizedText
}

/** The opening paragraph of a section: larger, and never indented. */
export interface LedeBlock extends BlockBase {
  kind: 'lede'
  text: LocalizedText
}

/**
 * Running text. Set with a first-line indent and no space between paragraphs —
 * classic book setting, and the strongest editorial signal in the redesign.
 */
export interface ParaBlock extends BlockBase {
  kind: 'para'
  text: LocalizedText
  /** False for the first paragraph after a heading, which is set flush. */
  indent?: boolean
}

export interface ListBlock extends BlockBase {
  kind: 'list'
  items: LocalizedText[]
  /** Two columns, as the open-codes page in the redesign does. */
  columns?: 1 | 2
}

/** A pulled sentence, set in the display voice on a swash. */
export interface QuoteBlock extends BlockBase {
  kind: 'quote'
  text: LocalizedText
  attribution?: LocalizedText
}

/**
 * Term and definition in two columns, ruled between rows — the executive-summary
 * spread.
 */
export interface DefListBlock extends BlockBase {
  kind: 'defList'
  rows: { term: LocalizedText; def: LocalizedText }[]
}

/** An image with an optional caption and photo credit. */
export interface FigureBlock extends BlockBase {
  kind: 'figure'
  imageRef: ImageRef | null
  caption?: LocalizedText
  credit?: LocalizedText
  /** Screened through the CMYK halftone, as the redesign does for cut-outs. */
  halftone?: boolean
  /** Height as a fraction of the content column width. */
  aspect?: number
}

/**
 * The horizontal bar chart: a colour bar, a giant condensed percentage, a label
 * and an optional sub-label.
 */
export interface ChartBlock extends BlockBase {
  kind: 'chart'
  series: { label: LocalizedText; sublabel?: LocalizedText; value: number }[]
  /** Appended to each value. Empty for a plain count. */
  unit?: string
  /** Full-scale value. Omit to use the largest in the series. */
  max?: number
}

/** A resources block: a heading, then underlined links with notes. */
export interface LinksBlock extends BlockBase {
  kind: 'links'
  title: LocalizedText
  items: { label: LocalizedText; href?: string; note?: LocalizedText }[]
}

/** Condensed caps with phrases picked out on a swash. */
export interface StatementBlock extends BlockBase {
  kind: 'statement'
  text: LocalizedText
}

export type Block =
  | HeadingBlock
  | SubheadBlock
  | LedeBlock
  | ParaBlock
  | ListBlock
  | QuoteBlock
  | DefListBlock
  | FigureBlock
  | ChartBlock
  | LinksBlock
  | StatementBlock

export type BlockKind = Block['kind']

/**
 * Blocks that may be split across a page boundary.
 *
 * Definition lists and link lists split *between rows*, never inside one; a term
 * separated from its definition would be worse than a short page.
 */
export const isSplittable = (b: Block): boolean =>
  b.kind === 'para' || b.kind === 'list' || b.kind === 'defList' || b.kind === 'links'

/** Headings hold onto what follows them; nothing else does by default. */
export const keepsWithNext = (b: Block): boolean =>
  b.keepWithNext ?? (b.kind === 'heading' || b.kind === 'subhead')

let seq = 0
export const blockId = (): BlockId => `bk_${Date.now().toString(36)}_${(seq++).toString(36)}`
