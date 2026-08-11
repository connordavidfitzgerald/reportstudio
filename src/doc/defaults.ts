import { DEFAULT_PAPER_OPACITY } from '../core/config/constants'
import { PALETTES } from '../core/config/palettes'
import { PAPERS } from '../core/config/papers'
import { getFormat, type FormatId } from '../config/formats'
import type {
  BlockElement,
  Box,
  Deck,
  ImageElement,
  LogoElement,
  PageElement,
  TextElement,
} from './types'
import type { FlowSection, StaticSection } from './sections'
import { blockId } from './blocks'

let seq = 0
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${(seq++).toString(36)}`

export const pageId = () => uid('pg')
export const elementId = () => uid('el')

const DEFAULT_PAPER_IDS = ['paper1']

/**
 * Per-kind defaults. A restored session spreads each stored element over the
 * matching entry, so a document saved before a field existed still loads and
 * simply picks up that field's default.
 */
export const ELEMENT_DEFAULTS = {
  text: {
    kind: 'text',
    text: '',
    variant: 'badge',
    step: 0,
    align: 'left',
    vAlign: 'top',
    bg: 'secondary',
    autoHeight: true,
  } satisfies Omit<TextElement, 'id' | 'box'>,
  image: {
    kind: 'image',
    imageRef: null,
    halftone: null,
  } satisfies Omit<ImageElement, 'id' | 'box'>,
  block: {
    kind: 'block',
    bg: 'highlight',
  } satisfies Omit<BlockElement, 'id' | 'box'>,
  logo: {
    kind: 'logo',
  } satisfies Omit<LogoElement, 'id' | 'box'>,
} as const

type OfKind<K extends PageElement['kind']> = Extract<PageElement, { kind: K }>

/** Build an element of `kind` at `box`, with any fields you want to override. */
export function createElement<K extends PageElement['kind']>(
  kind: K,
  box: Box,
  overrides: Partial<OfKind<K>> = {},
): OfKind<K> {
  // The spread is sound — `ELEMENT_DEFAULTS[kind]` is the full element of that
  // kind minus id/box — but TS can't relate an indexed lookup on a generic `K`
  // back to the union member, so the assertion goes through `unknown`.
  return {
    ...ELEMENT_DEFAULTS[kind],
    ...overrides,
    id: elementId(),
    box,
  } as unknown as OfKind<K>
}

/**
 * A hand-composed section, which is also exactly one page — see
 * `doc/sections.ts` for why those are the same object.
 */
export function createSection(
  elements: PageElement[] = [],
  templateId?: string,
): StaticSection {
  return { kind: 'static', id: pageId(), elements, templateId }
}

/**
 * A first page with something on it, so a fresh session opens on real type
 * rather than an empty rectangle. Replaced by the template library in due
 * course — this is scaffolding, not a template.
 */
function createStarterPage(format: FormatId): StaticSection {
  const f = getFormat(format)
  const half = Math.round(f.cols / 2)
  return createSection([
    createElement('text', { col: 0, row: 1, colSpan: f.cols, rowSpan: 3 }, {
      text: 'Le Hub',
      variant: 'header',
      autoFit: true,
      bg: 'outline',
    }),
    createElement('text', { col: 0, row: 5, colSpan: half, rowSpan: 2 }, {
      text: 'Presentations and reports,\nbuilt on the brand grid.',
      variant: 'badge',
      step: 1,
      bg: 'highlight',
    }),
  ])
}

/**
 * A flow section seeded with the shape a report section actually takes, so a new
 * one opens on something typeset rather than an empty region.
 */
export function createFlowSection(title = 'Section'): FlowSection {
  return {
    kind: 'flow',
    id: pageId(),
    title,
    blocks: [
      { id: blockId(), kind: 'heading', text: 'Chapter title' },
      { id: blockId(), kind: 'lede', text: 'The opening paragraph, set larger and flush left.' },
      { id: blockId(), kind: 'subhead', text: 'Subsection' },
      { id: blockId(), kind: 'para', text: 'Running text, set with a first-line indent and no space between paragraphs.', indent: false },
      { id: blockId(), kind: 'para', text: 'The second paragraph onward carries the indent, which is what makes the setting read as a book rather than a web page.' },
    ],
  }
}

/**
 * Flow-section presets.
 *
 * `conclusion` and `appendix` are the two archetypes the Figma redesign stops
 * short of, so they are *designed* from the system's own parts rather than
 * transcribed: a conclusion is a lede plus ruled sub-sections, an appendix is a
 * definition list and a resources block.
 */
export const FLOW_PRESETS: { id: string; label: string; make: () => FlowSection }[] = [
  {
    id: 'chapter',
    label: 'Chapter',
    make: () => createFlowSection('Section'),
  },
  {
    id: 'conclusion',
    label: 'Conclusion',
    make: () => ({
      kind: 'flow',
      id: pageId(),
      title: 'Conclusion',
      blocks: [
        { id: blockId(), kind: 'heading', text: 'Conclusion' },
        { id: blockId(), kind: 'lede', text: 'What the findings add up to, in a paragraph.' },
        { id: blockId(), kind: 'subhead', text: 'Considerations for funders' },
        { id: blockId(), kind: 'para', text: '', indent: false },
        { id: blockId(), kind: 'subhead', text: 'Localized support' },
        { id: blockId(), kind: 'para', text: '', indent: false },
        { id: blockId(), kind: 'subhead', text: 'Movement-wide support' },
        { id: blockId(), kind: 'para', text: '', indent: false },
      ],
    }),
  },
  {
    id: 'appendix',
    label: 'Appendix',
    make: () => ({
      kind: 'flow',
      id: pageId(),
      title: 'Appendix & questions',
      blocks: [
        { id: blockId(), kind: 'heading', text: 'Appendix' },
        {
          id: blockId(),
          kind: 'defList',
          rows: [{ term: 'Interview question', def: 'The question as it was asked.' }],
        },
        {
          id: blockId(),
          kind: 'links',
          title: 'Resources',
          items: [{ label: 'A resource', href: '' }],
        },
      ],
    }),
  },
]

export function createDeck(format: FormatId = 'slide'): Deck {
  return {
    format,
    lang: 'en',
    paletteId: PALETTES[0].id,
    paperIds: [...DEFAULT_PAPER_IDS],
    paperOpacities: Object.fromEntries(
      PAPERS.filter((p) => p.src).map((p) => [p.id, p.defaultOpacity ?? DEFAULT_PAPER_OPACITY]),
    ),
    sections: [createStarterPage(format)],
  }
}

/**
 * A sensible box for a newly created element, anchored at the cell the user
 * clicked and clamped onto the page. Spans are in *fractions of the grid* rather
 * than fixed cell counts, so they read the same on a 12-column slide and a
 * 6-column report.
 */
export function defaultBox(format: FormatId, kind: PageElement['kind'], at: { col: number; row: number }): Box {
  const f = getFormat(format)
  const spans: Record<PageElement['kind'], [number, number]> = {
    // [fraction of columns, fraction of rows]
    text: [1 / 2, 1 / 6],
    image: [1 / 2, 1 / 3],
    block: [1 / 3, 1 / 6],
    logo: [1 / 6, 1 / 12],
  }
  const [fc, fr] = spans[kind]
  const colSpan = Math.max(1, Math.round(f.cols * fc))
  const rowSpan = Math.max(1, Math.round(f.rows * fr))
  return {
    col: Math.min(at.col, f.cols - colSpan),
    row: Math.min(at.row, f.rows - rowSpan),
    colSpan,
    rowSpan,
  }
}
