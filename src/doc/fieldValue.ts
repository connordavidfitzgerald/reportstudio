import type { Block } from './blocks'
import { t, type Lang, type LocalizedText } from './localized'
import type { FieldPath } from '../render/compose'

/**
 * Reading and writing the field a caret is in.
 *
 * A {@link TextRegion} names its field as a path — `['rows', 2, 'term']` — and
 * two different places need to resolve one: the inline editor, which reads and
 * writes it, and the hit layer, which needs the *text* of a field before there
 * is an editor, to work out which character a click landed on. So the walk
 * lives here rather than inside the editor component.
 */

/** Read what a region points at: `LocalizedText`, or a number for a numeric field. */
export function readAt(block: Block, path: FieldPath): LocalizedText | number | undefined {
  let node: unknown = block
  for (const key of path) {
    if (node === null || node === undefined) return undefined
    node = (node as Record<string | number, unknown>)[key]
  }
  return node as LocalizedText | number | undefined
}

/** The plain text of one field, exactly as the editor will hold it. */
export function fieldText(block: Block, path: FieldPath, lang: Lang): string {
  const stored = readAt(block, path)
  return typeof stored === 'number' ? String(stored) : t(stored as LocalizedText, lang)
}

/** A dotted path, as the caret stores it, back to the array form `readAt` walks. */
export const pathOf = (dotted: string): FieldPath =>
  dotted.split('.').map((seg) => (/^\d+$/.test(seg) ? Number(seg) : seg))

/**
 * A patch that replaces the value at `path`, copying every container on the way.
 *
 * Returns only the block's *top-level* field, because that is what `updateBlock`
 * merges — so editing `['rows', 2, 'term']` produces `{ rows: [...] }` with one
 * new row and the rest shared.
 */
export function patchAt(
  block: Block,
  path: FieldPath,
  value: LocalizedText | number,
): Partial<Block> {
  const clone = (node: unknown, at: number): unknown => {
    if (at === path.length) return value
    const key = path[at]
    if (Array.isArray(node)) {
      return node.map((item, i) => (i === key ? clone(item, at + 1) : item))
    }
    const obj = (node ?? {}) as Record<string | number, unknown>
    return { ...obj, [key]: clone(obj[key], at + 1) }
  }
  const next = clone(block, 0) as Record<string | number, unknown>
  return { [path[0]]: next[path[0]] } as Partial<Block>
}
