import { blockId, type Block, type BlockSeed } from '../doc/blocks'
import type { Leaf } from '../doc/types'

/** Spelled as in `CHAPTER_PRESETS`, so the panel marks it as the current one. */
const FINDINGS = 'Findings and Implications'

/**
 * Page archetypes, derived from the 11 spreads rather than invented.
 *
 * Each one is a shape that recurs in the file: the definition-list page appears
 * four times, the chapter opener twice, the full-bleed plate three times. A
 * template seeds a page's components; it is not a layout the page is locked
 * into, because there is no layout to lock — position falls out of the order
 * and the column runs.
 *
 * They deliberately carry placeholder copy of the right *shape* (three
 * definition rows, six chart bars) so applying one shows whether the archetype
 * suits the content before any real words are typed.
 */

export interface Template {
  id: string
  label: string
  /** A short note on where this shape comes from in the file. */
  note: string
  build(): Partial<Leaf>
}

const b = (block: BlockSeed): Block => ({ ...block, id: blockId() }) as Block

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    label: 'Blank',
    note: 'An empty page, to build up from components.',
    build: () => ({ surface: 'paper', bodySize: 'xs', blocks: [] }),
  },
  {
    id: 'cover',
    label: 'Cover',
    note: 'The only page composed across the gutter.',
    build: () => ({
      full: true,
      bare: true,
      surface: 'paper',
      bodySize: 'l',
      blocks: [
        b({
          kind: 'cover',
          title: 'Tools for\nChange',
          subtitle: 'Understanding the needs of climate justice organizers in Canada',
          imageRef: null,
          wordmark: 'Le HUB',
        }),
      ],
    }),
  },
  {
    id: 'colophon',
    label: 'Colophon',
    note: 'Spread 2 verso: a short statement high, credits at the foot.',
    build: () => ({
      surface: 'paper',
      bodySize: 's',
      blocks: [
        b({
          kind: 'para',
          indent: false,
          col: 0,
          span: 6,
          text: 'This report is produced by the Climate Justice Organizing HUB, a project of the Small Change Fund.',
        }),
        b({ kind: 'spacer', height: 380 }),
        b({
          kind: 'credits',
          col: 0,
          span: 4,
          rows: [
            { label: 'Main Author', value: '—' },
            { label: 'Data Collection', value: '—' },
            { label: 'Editors', value: '—' },
            { label: 'Report Design', value: '—' },
          ],
        }),
      ],
    }),
  },
  {
    id: 'author',
    label: 'Author',
    note: 'Spread 2 recto: text and image both in the outer five columns.',
    build: () => ({
      surface: 'paper',
      bodySize: 'xs',
      chapter: 'Introduction',
      section: 'About the author',
      blocks: [
        b({ kind: 'para', indent: false, col: 4, span: 5, text: 'Biography.' }),
        b({ kind: 'spacer', height: 160 }),
        b({ kind: 'figure', imageRef: null, col: 4, span: 5, aspect: 1.48 }),
      ],
    }),
  },
  {
    id: 'tableOfContents',
    label: 'Table of Contents',
    note: 'Chapter rows on swashes, sub-rows indented, folios ranged right.',
    build: () => ({
      surface: 'paper',
      bodySize: 'xs',
      chapter: 'Table of contents',
      blocks: [
        b({ kind: 'tocEntry', label: 'Executive summary', folio: 6 }),
        b({ kind: 'tocEntry', label: 'Introduction', folio: 12 }),
        b({
          kind: 'tocEntry',
          label: 'Methodology',
          folio: 13,
          sections: [
            { label: 'participant recruitment', folio: 13 },
            { label: 'data collection', folio: 13 },
            { label: 'data analysis', folio: 14 },
          ],
        }),
      ],
    }),
  },
  {
    id: 'plate',
    label: 'Full-bleed plate',
    note: 'An image to the trim, with the credit on a swash.',
    build: () => ({
      bare: true,
      surface: 'paper',
      bodySize: 'xs',
      plate: { imageRef: null },
      blocks: [
        b({ kind: 'spacer', height: 700 }),
        b({ kind: 'text', text: 'Photo courtesy of —', role: 'caption', col: 4, span: 5 }),
      ],
    }),
  },
  {
    id: 'statement',
    label: 'Statement',
    note: 'Spread 4 recto: the shouted number, a plate, and the qualifier.',
    build: () => ({
      surface: 'paper',
      bodySize: 'xs',
      blocks: [
        b({
          kind: 'statement',
          text: 'Le HUB members spoke with 21 organizers from 16 organizations across 6 provinces.',
          highlights: ['21 organizers', '16 organizations', '6 provinces'],
        }),
        b({ kind: 'figure', imageRef: null, aspect: 1.08 }),
        b({ kind: 'text', text: '(Ontario, Quebec, British Columbia)', role: 'statementNote' }),
      ],
    }),
  },
  {
    id: 'defList',
    label: 'Definition list',
    note: 'The executive-summary shape — four spreads use it.',
    build: () => ({
      surface: 'paper',
      bodySize: 'xs',
      chapter: 'Executive Summary',
      blocks: [
        b({
          kind: 'defList',
          rows: [
            { term: 'Campaign development', def: 'Definition.' },
            { term: 'Canada-specific resources', def: 'Definition.' },
            { term: 'Community care & organizing culture', def: 'Definition.' },
          ],
        }),
      ],
    }),
  },
  {
    id: 'newChapter',
    label: 'New Chapter',
    note: 'Title, definition, then body low on the page.',
    build: () => ({
      surface: 'ochre',
      bodySize: 's',
      chapter: FINDINGS,
      section: 'Doing (campaigns/actions)',
      blocks: [
        b({ kind: 'heading', text: 'Campaign Development' }),
        b({ kind: 'deck', text: 'The process of ideating, developing, and carrying out a campaign.' }),
        b({ kind: 'spacer', height: 280 }),
        b({ kind: 'rule' }),
        b({ kind: 'para', text: 'Body copy.' }),
      ],
    }),
  },
  {
    id: 'methodology',
    label: 'Ruled sections',
    note: 'A lede, then ruled sub-heads over dense body copy.',
    build: () => ({
      surface: 'paper',
      bodySize: 'xs',
      chapter: 'Methodology',
      blocks: [
        b({ kind: 'para', indent: false, size: 'm', text: 'Opening statement.' }),
        b({ kind: 'spacer', height: 60 }),
        b({ kind: 'subhead', text: 'Participant recruitment' }),
        b({ kind: 'para', text: 'Body copy.' }),
        b({ kind: 'subhead', text: 'Data collection' }),
        b({ kind: 'para', text: 'Body copy.' }),
      ],
    }),
  },
  {
    id: 'chart',
    label: 'Bar chart',
    note: 'The methodology recto: six proportional bars with fitted percentages.',
    build: () => ({
      surface: 'paper',
      bodySize: 'xs',
      chapter: 'Methodology',
      blocks: [
        b({
          kind: 'chart',
          series: [
            { label: 'Doing', sublabel: 'Campaign/Action', value: 40 },
            { label: 'Being', sublabel: 'Culture/Relating', value: 25 },
            { label: 'Doing + Being', sublabel: 'Campaign/Action + Culture/Relating', value: 20 },
            { label: 'Being + Structural Factors', value: 10 },
            { label: 'Structural Factors', value: 7.5 },
            { label: 'Canadian Context', value: 2.5 },
          ],
        }),
      ],
    }),
  },
  {
    id: 'resources',
    label: 'Resources',
    note: 'Spread 11 recto: an inset quote, then linked resources.',
    build: () => ({
      surface: 'ochre',
      bodySize: 'm',
      chapter: FINDINGS,
      section: 'Doing (campaigns/actions)',
      blocks: [
        b({ kind: 'quote', col: 1, span: 7, text: '“Quotation.”' }),
        b({ kind: 'rule' }),
        b({ kind: 'para', col: 1, span: 7, indent: false, text: 'Body copy.' }),
        b({ kind: 'rule' }),
        b({ kind: 'sectionHeading', text: 'Resources' }),
        b({ kind: 'links', items: [{ label: 'Groundswell', note: 'A series of seven workshops.' }] }),
        b({ kind: 'rule' }),
        b({ kind: 'sectionHeading', text: 'Related Articles' }),
        b({ kind: 'links', items: [{ label: 'Building coalitions' }] }),
      ],
    }),
  },
  {
    id: 'body',
    label: 'Running text',
    note: 'A single column of indented paragraphs.',
    build: () => ({
      surface: 'paper',
      bodySize: 'l',
      blocks: [b({ kind: 'para', text: 'Body copy.' }), b({ kind: 'para', text: 'Body copy.' })],
    }),
  },
]

/**
 * The templates the panel offers, in the order the Figma lists them.
 *
 * The rest are not deleted. `plate`, `defList`, `methodology`, `chart` and
 * `body` still build the pages the transcription is made of and are still named
 * by saved leaves' `templateId`; they are simply not shapes anyone should be
 * starting a new page from, now that a page is built up from components.
 */
const OFFERED = [
  'author',
  'blank',
  'cover',
  'colophon',
  'newChapter',
  'resources',
  'statement',
  'tableOfContents',
] as const

export const OFFERED_TEMPLATES: Template[] = OFFERED.map(
  (id) => TEMPLATES.find((t) => t.id === id)!,
)

/**
 * Ids that were renamed when the list was cut down, so a leaf saved under the
 * old name still resolves to its template rather than silently losing it.
 */
const ALIASES: Record<string, string> = {
  bio: 'author',
  chapter: 'newChapter',
  contents: 'tableOfContents',
}

export const templateById = (id: string): Template | undefined =>
  TEMPLATES.find((t) => t.id === (ALIASES[id] ?? id))
