import type { BlockKind } from '../../doc/blocks'

/**
 * Has this kind anything to set that isn't typed on the page?
 *
 * Read by the canvas to decide whether to show the control on a selected block
 * at all. It must agree with the switch below — a kind that answers true and
 * then renders nothing puts an empty card on the page, and one that answers
 * false while having settings hides them completely. Both lists are exhaustive
 * over `BlockKind`, so adding a kind breaks compilation in two places rather
 * than silently doing the wrong thing in one.
 */
const HAS_SETTINGS: Record<BlockKind, boolean> = {
  band: true,
  bulletList: true,
  chart: true,
  cover: true,
  figure: true,
  links: true,
  quoteOverlay: true,
  spacer: true,
  table: true,
  text: true,
  tocEntry: true,

  contents: false,
  credits: false,
  deck: false,
  defList: false,
  heading: false,
  para: false,
  quote: false,
  rule: false,
  sectionHeading: false,
  statement: false,
  subhead: false,
}

export const hasBlockSettings = (kind: BlockKind): boolean => HAS_SETTINGS[kind]
