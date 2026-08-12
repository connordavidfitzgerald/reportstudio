import { blockId, type Block, type BlockKind } from './blocks'
import { leafId, type Deck, type Leaf } from './types'

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
    case 'text':
      return { id, kind, text: 'Photo courtesy of —', role: 'caption' }
  }
}

/** A blank body leaf: paper, dense body copy, furniture on. */
export const createLeaf = (over: Partial<Leaf> = {}): Leaf => ({
  id: leafId(),
  surface: 'paper',
  bodySize: 'xs',
  blocks: [],
  ...over,
})

export const createDeck = (leaves: Leaf[] = [createLeaf()]): Deck => ({
  lang: 'en',
  leaves,
  startFolio: 1,
  overlayOpacity: { grunge265: 0.45, sunset001: 0.35 },
})

/**
 * Human labels for the insert menu, in the order they're offered.
 *
 * Ordered by how often the 11 spreads reach for them, not alphabetically: the
 * things you add to most pages should not be at the bottom of a list.
 */
export const BLOCK_LABELS: Record<BlockKind, string> = {
  para: 'Paragraph',
  heading: 'Chapter title',
  deck: 'Chapter definition',
  sectionHeading: 'Section heading',
  subhead: 'Ruled sub-head',
  defList: 'Definition list',
  figure: 'Image',
  chart: 'Bar chart',
  statement: 'Statement',
  quote: 'Pull quote',
  quoteOverlay: 'Quote over image',
  links: 'Links',
  bulletList: 'Bullet list',
  tocEntry: 'Contents entry',
  credits: 'Credits',
  rule: 'Rule',
  spacer: 'Spacer',
  text: 'Caption / small text',
}

export const BLOCK_ORDER = Object.keys(BLOCK_LABELS) as BlockKind[]
