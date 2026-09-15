import type { Block, BlockKind } from './blocks'
import { t, type Lang, type LocalizedText } from './localized'

/**
 * Which components are lists, and what one of their rows is made of.
 *
 * ## Why this exists
 *
 * Five components hold repeating rows — a definition list, a bulleted list, a
 * resources list, the colophon credits and a bar chart — and until now the only
 * way to add or remove one was `RepeatableRows` in the side panel: an "Add a
 * row" button under a stack of labelled inputs, a screen away from the page the
 * row appears on.
 *
 * Replacing that with Enter and Backspace on the page could have been five
 * special cases in the editor's key handler. It is one table instead, because
 * five hand-written versions of "what is the last field of a row" is five
 * chances for a list to behave subtly unlike its neighbours — and because a
 * sixth list component (the table, say) should get the behaviour by being
 * described here rather than by someone remembering to add it.
 *
 * ## What a shape says
 *
 * `fields` is the row's *text* fields in the order a caret moves through them.
 * A field of `null` means the row has no shape at all and simply is its value,
 * which is what a bulleted item is.
 *
 * Only fields that are **always** on the page belong here, and that is a real
 * constraint rather than a tidiness rule. A painter marks an optional field
 * only when it has something to draw — `render/compose.ts` emits a region for a
 * link's note, or a bar's sub-label, `if (item.note)` — so an absent one cannot
 * hold a caret, and naming it as the row's last field would mean Enter never
 * reached the key that opens a new row. Hence a link row is `['label']` and not
 * `['label', 'note']`, even though a note is very much part of a link.
 *
 * `href` on a link and `value` on a bar are absent for the other reason: they
 * are not words. `value` is typed on the page as a number (see
 * `TextRegion.numeric`), and `href` is set through the link key on the toolbar.
 */
export interface RowShape {
  /** The block field holding the array. */
  list: string
  /** The row's text fields, in caret order. `null` where the row is the value. */
  fields: (string | null)[]
  /** An empty row of this shape. */
  blank(): unknown
}

const SHAPES: Partial<Record<BlockKind, RowShape>> = {
  defList: { list: 'rows', fields: ['term', 'def'], blank: () => ({ term: '', def: '' }) },
  bulletList: { list: 'items', fields: [null], blank: () => '' },
  links: { list: 'items', fields: ['label'], blank: () => ({ label: '' }) },
  credits: { list: 'rows', fields: ['label', 'value'], blank: () => ({ label: '', value: '' }) },
  chart: { list: 'series', fields: ['label'], blank: () => ({ label: '', value: 0 }) },
}

export const rowShape = (kind: BlockKind): RowShape | undefined => SHAPES[kind]

/** Where a field path falls in a list, if it falls in one at all. */
export interface RowAt {
  shape: RowShape
  index: number
  /** Which of `shape.fields` this is. */
  field: number
}

/**
 * Resolve a dotted field path against a block's row shape.
 *
 * Paths look like `rows.2.term`, `items.0` or `series.1.sublabel`, which is
 * exactly what the painters emit — so this reads the path the caret already
 * has rather than asking the caller to keep a parallel idea of where it is.
 */
export function rowAt(block: Block, path: string): RowAt | undefined {
  const shape = rowShape(block.kind)
  if (!shape) return undefined
  const parts = path.split('.')
  if (parts[0] !== shape.list) return undefined
  const index = Number(parts[1])
  if (!Number.isInteger(index) || index < 0) return undefined
  const field = shape.fields.indexOf(parts[2] ?? null)
  return field < 0 ? undefined : { shape, index, field }
}

/** The dotted path of one field of one row. */
export const rowPath = (shape: RowShape, index: number, field: number): string => {
  const name = shape.fields[field]
  return name === null ? `${shape.list}.${index}` : `${shape.list}.${index}.${name}`
}

const listOf = (block: Block, shape: RowShape): unknown[] =>
  ((block as unknown as Record<string, unknown>)[shape.list] as unknown[]) ?? []

export const rowCount = (block: Block, shape: RowShape): number => listOf(block, shape).length

/**
 * Is every text field of this row empty?
 *
 * The test for whether Backspace should delete the row rather than a character.
 * Only the *text* fields count: a bar whose label has been cleared is an empty
 * row even though its value is still `0`, because `0` is what an untouched bar
 * has and treating it as content would make an empty bar undeletable.
 */
export function rowEmpty(block: Block, shape: RowShape, index: number, lang: Lang): boolean {
  const row = listOf(block, shape)[index]
  if (row === undefined) return false
  return shape.fields.every((name) => {
    const value = (name === null ? row : (row as Record<string, unknown>)[name]) as LocalizedText
    return t(value, lang).trim() === ''
  })
}

/** The list with a blank row inserted after `index`. */
export function withRowAfter(block: Block, shape: RowShape, index: number): Partial<Block> {
  const next = [...listOf(block, shape)]
  next.splice(index + 1, 0, shape.blank())
  return { [shape.list]: next } as Partial<Block>
}

/** The list with `index` removed. */
export function withoutRow(block: Block, shape: RowShape, index: number): Partial<Block> {
  const next = listOf(block, shape).filter((_, i) => i !== index)
  return { [shape.list]: next } as Partial<Block>
}
