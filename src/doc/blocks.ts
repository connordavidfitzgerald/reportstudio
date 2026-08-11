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
  text: string
}

/** The ruled caps band that introduces a subsection. */
export interface SubheadBlock extends BlockBase {
  kind: 'subhead'
  text: string
}

/** The opening paragraph of a section: larger, and never indented. */
export interface LedeBlock extends BlockBase {
  kind: 'lede'
  text: string
}

/**
 * Running text. Set with a first-line indent and no space between paragraphs —
 * classic book setting, and the strongest editorial signal in the redesign.
 */
export interface ParaBlock extends BlockBase {
  kind: 'para'
  text: string
  /** False for the first paragraph after a heading, which is set flush. */
  indent?: boolean
}

export interface ListBlock extends BlockBase {
  kind: 'list'
  items: string[]
}

/** A pulled sentence, set in the display voice on a swash. */
export interface QuoteBlock extends BlockBase {
  kind: 'quote'
  text: string
  attribution?: string
}

export type Block =
  | HeadingBlock
  | SubheadBlock
  | LedeBlock
  | ParaBlock
  | ListBlock
  | QuoteBlock

export type BlockKind = Block['kind']

/** Blocks that may be split across a page boundary. */
export const isSplittable = (b: Block): boolean => b.kind === 'para' || b.kind === 'list'

/** Headings hold onto what follows them; nothing else does by default. */
export const keepsWithNext = (b: Block): boolean =>
  b.keepWithNext ?? (b.kind === 'heading' || b.kind === 'subhead')

let seq = 0
export const blockId = (): BlockId => `bk_${Date.now().toString(36)}_${(seq++).toString(36)}`
