import { blockId, type Block, type BlockKind } from './blocks'
import { createLeaf, type Deck, type Leaf } from './types'

// `createLeaf` and `pairLeaves` live in `./types`, beside `deckSpreads`: they
// are the same pagination rule stated as constructors rather than as a reader.
// Re-exported here because this is where the document's seeds live.
export { createLeaf, pairLeaves } from './types'

/**
 * Seeds for every component and leaf.
 *
 * Placeholder copy is deliberately real-shaped — a paragraph's worth of words
 * for a paragraph, three rows for a definition list — because a component that
 * seeds with "Lorem" or an empty string gives no sense of whether it belongs on
 * the page, which is the only question the person inserting it is asking.
 */

const LOREM =
  'Grassroots climate justice organizing is a dynamic, emergent and experimental ' +
  'process, and the conditions organizers work in change faster than the ' +
  'resources built to support them.'

export function createBlock(kind: BlockKind): Block {
  const id = blockId()
  switch (kind) {
    case 'heading':
      return { id, kind, text: 'Campaign Development' }
    case 'deck':
      return {
        id,
        kind,
        text: 'The process of ideating, developing, and carrying out a campaign.',
      }
    case 'sectionHeading':
      return { id, kind, text: 'Resources' }
    case 'para':
      return { id, kind, text: LOREM }
    case 'quote':
      return { id, kind, text: `“${LOREM}”`, col: 1, span: 7 }
    case 'subhead':
      return { id, kind, text: 'Participant recruitment' }
    case 'rule':
      return { id, kind }
    case 'spacer':
      return { id, kind, height: 40 }
    case 'statement':
      return {
        id,
        kind,
        text: 'Le HUB members spoke with 21 organizers from 16 organizations across 6 provinces.',
        highlights: ['21 organizers', '16 organizations', '6 provinces'],
      }
    case 'quoteOverlay':
      return { id, kind, text: '“There are lots of people who are excited about things.”', col: 1, span: 7 }
    case 'defList':
      return {
        id,
        kind,
        rows: [
          { term: 'Campaign development', def: 'The process of ideating, developing, and carrying out a campaign.' },
          { term: 'Funding', def: 'Reliable, sustainable, and non-restrictive sources of funding.' },
          { term: 'Polycrisis', def: 'Multiplicity of overlapping social, economic and environmental crises.' },
        ],
      }
    case 'bulletList':
      return {
        id,
        kind,
        columns: 2,
        items: [
          'Campaign development',
          'Hard organizing skills',
          'Media and communications',
          'Security culture',
          'Funding',
          'Polycrisis',
        ],
      }
    case 'links':
      return {
        id,
        kind,
        items: [
          { label: 'Groundswell', note: 'A series of seven workshops designed to equip participants.' },
          { label: 'Building coalitions' },
        ],
      }
    case 'credits':
      return {
        id,
        kind,
        col: 0,
        span: 4,
        rows: [
          { label: 'Main Author', value: '—' },
          { label: 'Data Collection', value: '—' },
          { label: 'Editors', value: '—' },
          { label: 'Report Design', value: '—' },
        ],
      }
    case 'figure':
      return { id, kind, imageRef: null, col: 1, span: 7, aspect: 1.35 }
    case 'band':
      return { id, kind, text: 'Photo courtesy of —', surface: 'pink', bleed: 'right', size: 'm' }
    case 'chart':
      return {
        id,
        kind,
        series: [
          { label: 'Doing', sublabel: 'Campaign/Action', value: 40 },
          { label: 'Being', sublabel: 'Culture/Relating', value: 25 },
          { label: 'Structural Factors', value: 7.5 },
        ],
      }
    case 'tocEntry':
      return {
        id,
        kind,
        label: 'Executive summary',
        folio: 6,
        sections: [{ label: 'participant recruitment', folio: 13 }],
      }
    case 'cover':
      return {
        id,
        kind,
        title: 'Tools for\nChange',
        subtitle: 'Understanding the needs of climate justice organizers in Canada',
        imageRef: null,
        wordmark: 'Le HUB',
      }
    case 'text':
      return { id, kind, text: 'Photo courtesy of —', role: 'caption' }
  }
}

export const createDeck = (leaves: Leaf[] = [createLeaf(), createLeaf()]): Deck => ({
  name: 'Untitled report',
  lang: 'en',
  leaves,
  startFolio: 1,
  overlayOpacity: { grunge265: 0.45, sunset001: 0.35 },
})

/**
 * What the editor opens on with no saved session: the *Tools for Change*
 * transcription, rather than a blank page.
 *
 * Opening on the reference document means the design system is visible
 * immediately and every archetype is one click away to copy — and it keeps the
 * transcription honest, since a component that regressed would show up on boot
 * rather than in a test nobody runs.
 */
export { toolsForChange as seedDeck } from './toolsForChange'

/**
 * What each component is called and what it is for, in the order offered.
 *
 * Ordered by how often the 11 spreads reach for them, not alphabetically: the
 * things you add to most pages should not be at the bottom of a list. The
 * groups are for scanning — twenty flat choices is a wall, and someone who has
 * never laid out a page cannot tell "Statement" from "Pull quote" from the name
 * alone, which is what `hint` is for.
 */
export type BlockGroup = 'Text' | 'Lists & data' | 'Pictures' | 'Layout'

export interface BlockInfo {
  label: string
  group: BlockGroup
  hint: string
}

export const BLOCK_INFO: Record<BlockKind, BlockInfo> = {
  para: { label: 'Paragraph', group: 'Text', hint: 'Running body copy.' },
  heading: { label: 'Chapter title', group: 'Text', hint: 'The big opener at the top of a chapter.' },
  deck: { label: 'Chapter definition', group: 'Text', hint: 'The one-line definition under a chapter title.' },
  sectionHeading: { label: 'Section heading', group: 'Text', hint: '“Resources”, “Related articles”.' },
  subhead: { label: 'Ruled sub-head', group: 'Text', hint: 'A small caps label between two hairlines.' },
  quote: { label: 'Pull quote', group: 'Text', hint: 'A passage set larger and inset from the measure.' },
  statement: { label: 'Statement', group: 'Text', hint: 'A shouted sentence with phrases on colour.' },
  text: { label: 'Caption / small text', group: 'Text', hint: 'A photo credit or a note.' },

  defList: { label: 'Definition list', group: 'Lists & data', hint: 'Terms on the left, definitions on the right.' },
  bulletList: { label: 'Bullet list', group: 'Lists & data', hint: 'Short items, in one column or two.' },
  links: { label: 'Links', group: 'Lists & data', hint: 'Underlined resources, each with an optional note.' },
  credits: { label: 'Credits', group: 'Lists & data', hint: 'Role and name, stacked — the colophon.' },
  chart: { label: 'Bar chart', group: 'Lists & data', hint: 'Horizontal bars whose width is their value.' },
  tocEntry: { label: 'Contents entry', group: 'Lists & data', hint: 'A chapter row with its page number.' },

  figure: { label: 'Image', group: 'Pictures', hint: 'A photograph in a frame, with an optional caption.' },
  quoteOverlay: { label: 'Quote over image', group: 'Pictures', hint: 'Condensed caps centred on a picture.' },
  band: { label: 'Colour band', group: 'Pictures', hint: 'A colour field with text, running to the page edge.' },
  cover: { label: 'Cover', group: 'Pictures', hint: 'The front of the report. One per document.' },

  rule: { label: 'Rule', group: 'Layout', hint: 'A hairline across the measure.' },
  spacer: { label: 'Space', group: 'Layout', hint: 'A measured gap, or one that absorbs what is left.' },
}

/** Just the names, for the places that only need one. */
export const BLOCK_LABELS: Record<BlockKind, string> = Object.fromEntries(
  Object.entries(BLOCK_INFO).map(([kind, info]) => [kind, info.label]),
) as Record<BlockKind, string>

export const BLOCK_ORDER = Object.keys(BLOCK_INFO) as BlockKind[]

/** The insert menu, grouped, keeping each group's frequency ordering. */
export const BLOCK_GROUPS: { group: BlockGroup; kinds: BlockKind[] }[] = (
  ['Text', 'Lists & data', 'Pictures', 'Layout'] as BlockGroup[]
).map((group) => ({
  group,
  kinds: BLOCK_ORDER.filter((kind) => BLOCK_INFO[kind].group === group),
}))

/**
 * What the panel offers, grouped and labelled as the Figma has it.
 *
 * Eleven of the twenty kinds. **The other nine are not gone** — `cover`,
 * `tocEntry`, `chart`, `band`, `quoteOverlay`, `credits`, `links`,
 * `sectionHeading` and `deck` still paint, still round-trip, and are still what
 * the Cover, Table of Contents and chapter-opener templates build. They are
 * simply not things to start from a blank page with, and a wall of twenty
 * choices was the reason the panel needed cutting down in the first place.
 *
 * So `BLOCK_ORDER` and `BLOCK_LABELS` stay exhaustive — every kind still needs a
 * name for the canvas's own labels — and only this list is short.
 */
export const OFFERED_GROUPS: { group: string; kinds: BlockKind[] }[] = [
  { group: 'Text (regular)', kinds: ['heading', 'para', 'subhead', 'text'] },
  { group: 'Text (display)', kinds: ['statement', 'quote'] },
  { group: 'Lists and Data', kinds: ['defList', 'bulletList'] },
  { group: 'Media', kinds: ['figure'] },
  { group: 'Layout', kinds: ['rule', 'spacer'] },
]

/**
 * The short name a component goes by in the palette.
 *
 * Deliberately not `BLOCK_INFO.label`: that one has to be unambiguous wherever
 * it appears — "Caption / small text", "Chapter title" — while the palette has a
 * group heading above it doing half the work.
 */
export const OFFERED_LABELS: Partial<Record<BlockKind, string>> = {
  heading: 'Heading',
  para: 'Paragraph',
  subhead: 'Sub-heading',
  text: 'Caption',
  statement: 'Statement',
  quote: 'Quote',
  defList: 'Definitions',
  bulletList: 'Bullet list',
  figure: 'Image',
  rule: 'Rule',
  spacer: 'Spacer',
}
