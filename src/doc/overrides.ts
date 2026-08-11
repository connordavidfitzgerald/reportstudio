import type { Block, BlockId } from './blocks'
import type { PageElement } from './types'

/**
 * Adjustments that survive re-flow.
 *
 * Most per-page intent does *not* belong here. A forced page break lives on the
 * block (`breakBefore`), so deleting the block deletes the break — correctly,
 * with no reconciliation code at all. Only two things genuinely outlive any one
 * block and therefore need anchoring: an element pinned onto a page, and a
 * page's styling.
 *
 * Keeping that surface small is the point. Every anchored thing is something
 * that can be orphaned, and orphan handling is where these tools lose people's
 * trust.
 */

/**
 * What an override is attached to.
 *
 * Two legitimate intents, and guessing between them is worse than asking:
 *
 * - `block` — *follow the content*. "This photo belongs with this paragraph."
 *   When text grows upstream and everything reflows, the photo moves with the
 *   paragraph. The default, and what people usually mean.
 * - `ordinal` — *hold the page*. "Page 12, because it faces the chart on 13."
 *   Position is the point; the content around it may change.
 */
export type Anchor =
  | { at: 'block'; blockId: BlockId }
  | { at: 'ordinal'; ordinal: number }

export interface PinOverride {
  kind: 'pin'
  id: string
  anchor: Anchor
  /** Lives here, not in the block stream — it has a Box and is placed on a grid. */
  element: PageElement
  /**
   * `band` makes flowed text stop short of it; `none` lets text run underneath.
   * Not a shaped runaround — the brand has none, and shape-aware wrapping is
   * weeks of work for no editorial gain.
   */
  obstruct: 'band' | 'none'
}

export interface PageStyleOverride {
  kind: 'page-style'
  id: string
  anchor: Anchor
  paletteId?: string
  /** `page` styles only the anchored page; `from` styles it and everything after. */
  scope: 'page' | 'from'
}

export type Override = PinOverride | PageStyleOverride

let seq = 0
export const overrideId = (): string => `ov_${Date.now().toString(36)}_${(seq++).toString(36)}`

/**
 * Re-point overrides whose anchor blocks are being deleted.
 *
 * Runs inside the store mutator that performs the deletion, not in the flow
 * engine: at deletion time the surviving neighbours are known for free, and
 * afterwards they are gone. It also keeps the flow engine pure and total — it
 * only ever *resolves* an anchor, never repairs one.
 *
 * Policy, in order: the next surviving block, else the previous, else degrade to
 * holding whatever page it had. **Nothing is ever discarded.** An override that
 * ends up resolving to nothing is reported as an orphan and listed in the UI
 * with re-anchor and delete actions — silent loss here is exactly how a tool
 * teaches people not to trust it.
 */
export function repairAnchors(
  blocks: Block[],
  removed: Set<BlockId>,
  overrides: Override[],
  pageOf: (blockId: BlockId) => number | undefined,
): Override[] {
  if (!overrides.length) return overrides

  return overrides.map((ov): Override => {
    const anchor = ov.anchor
    if (anchor.at !== 'block' || !removed.has(anchor.blockId)) return ov

    const index = blocks.findIndex((b) => b.id === anchor.blockId)
    const after = blocks.slice(index + 1).find((b) => !removed.has(b.id))
    const before = [...blocks.slice(0, index)].reverse().find((b) => !removed.has(b.id))
    const next = after ?? before

    if (next) return { ...ov, anchor: { at: 'block', blockId: next.id } }

    // The whole stream went: fall back to holding the page it was on, so the
    // override survives to be re-anchored rather than disappearing with it.
    return { ...ov, anchor: { at: 'ordinal', ordinal: pageOf(anchor.blockId) ?? 0 } }
  })
}
