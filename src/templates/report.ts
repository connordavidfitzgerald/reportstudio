import { createElement } from '../doc/defaults'
import type { PageElement } from '../doc/types'
import { box, frac, type Template } from './types'

/**
 * Report templates for the 6-column Letter page.
 *
 * Body copy sits at step 0, which is ~10pt on this format — see the per-format
 * type base in `config/formats.ts`. There is no text threading between pages, so
 * a long section is composed page by page.
 */
export const REPORT_TEMPLATES: Template[] = [
  {
    id: 'cover',
    label: 'Cover',
    formats: ['letter'],
    build: ({ g }) => [
      createElement('image', box(0, 0, g.cols, frac(g.rows, 0.55)), { halftone: null }),
      createElement('text', box(1, frac(g.rows, 0.62), g.cols - 2, 3), {
        text: 'Report title',
        variant: 'header',
        autoFit: true,
        bg: 'outline',
      }),
      createElement('text', box(1, frac(g.rows, 0.82), frac(g.cols, 0.6), 1), {
        text: 'Subtitle',
        variant: 'badge',
        step: 1,
        bg: 'highlight',
      }),
      createElement('text', box(1, frac(g.rows, 0.88), frac(g.cols, 0.4), 1), {
        text: 'July 2026',
        variant: 'badge',
        step: 0,
        bg: 'secondary',
      }),
      createElement('logo', box(1, g.rows - 2, 1, 1)),
    ],
  },
  {
    id: 'toc',
    label: 'Contents',
    formats: ['letter'],
    build: ({ g }) => {
      const entries = ['Summary', 'Context', 'Method', 'Findings', 'Recommendations']
      const els: PageElement[] = [
        createElement('text', box(1, 1, g.cols - 2, 2), {
          text: 'Contents',
          variant: 'header',
          step: 4,
          bg: 'outline',
        }),
      ]
      entries.forEach((label, i) => {
        const row = 4 + i * 2
        els.push(
          createElement('text', box(1, row, g.cols - 3, 1), {
            text: label,
            variant: 'plain',
            step: 1,
            bg: 'none',
          }),
          createElement('text', box(g.cols - 2, row, 1, 1), {
            text: String(i + 2),
            variant: 'plain',
            step: 1,
            align: 'right',
            bg: 'none',
          }),
        )
      })
      return els
    },
  },
  {
    id: 'chapter',
    label: 'Chapter',
    formats: ['letter'],
    build: ({ g }) => [
      createElement('block', box(0, 0, g.cols, frac(g.rows, 0.45)), { bg: 'highlight' }),
      createElement('text', box(1, 2, 1, 1), {
        text: '01',
        variant: 'badge',
        step: 1,
        bg: 'secondary',
      }),
      createElement('text', box(1, frac(g.rows, 0.2), g.cols - 2, 3), {
        text: 'Chapter title',
        variant: 'header',
        autoFit: true,
        bg: 'outline',
      }),
    ],
  },
  {
    id: 'body',
    label: 'Body',
    formats: ['letter'],
    build: ({ g }) => [
      createElement('text', box(1, 1, g.cols - 2, 2), {
        text: 'Section heading',
        variant: 'header',
        step: 4,
        bg: 'outline',
      }),
      createElement('text', box(1, 4, g.cols - 2, 6), {
        text: 'Body copy for this section. Compose the page block by block — there is no threading between pages, so each block is placed where you want it.',
        variant: 'plain',
        step: 0,
        bg: 'none',
      }),
      createElement('text', box(1, 11, g.cols - 2, 5), {
        text: 'A second block of body copy, separated so it can be moved or restyled on its own.',
        variant: 'plain',
        step: 0,
        bg: 'none',
      }),
      createElement('text', box(g.cols - 2, g.rows - 1, 1, 1), {
        text: '2',
        variant: 'plain',
        step: 0,
        align: 'right',
        bg: 'none',
      }),
    ],
  },
  {
    id: 'body-two-col',
    label: 'Two column',
    formats: ['letter'],
    build: ({ g }) => {
      const half = g.cols / 2
      return [
        createElement('text', box(1, 1, g.cols - 2, 2), {
          text: 'Section heading',
          variant: 'header',
          step: 4,
          bg: 'outline',
        }),
        createElement('text', box(1, 4, half - 1, 8), {
          text: 'The left column of body copy.',
          variant: 'plain',
          step: 0,
          bg: 'none',
        }),
        createElement('text', box(half + 1, 4, half - 2, 8), {
          text: 'The right column of body copy.',
          variant: 'plain',
          step: 0,
          bg: 'none',
        }),
      ]
    },
  },
  {
    id: 'body-figure',
    label: 'Body + figure',
    formats: ['letter'],
    build: ({ g }) => [
      createElement('text', box(1, 1, g.cols - 2, 2), {
        text: 'Section heading',
        variant: 'header',
        step: 4,
        bg: 'outline',
      }),
      createElement('image', box(1, 4, g.cols - 2, 5), { halftone: null }),
      createElement('text', box(1, 9, g.cols - 2, 1), {
        text: 'Figure 1 — caption',
        variant: 'badge',
        step: 0,
        bg: 'highlight',
      }),
      createElement('text', box(1, 11, g.cols - 2, 5), {
        text: 'Commentary on the figure above.',
        variant: 'plain',
        step: 0,
        bg: 'none',
      }),
    ],
  },
  {
    id: 'pull-quote',
    label: 'Pull quote',
    formats: ['letter'],
    build: ({ g }) => [
      createElement('text', box(1, 2, g.cols - 2, 5), {
        text: 'Body copy leading into the quote below.',
        variant: 'plain',
        step: 0,
        bg: 'none',
      }),
      createElement('text', box(1, 8, g.cols - 2, 3), {
        text: 'The sentence worth pulling out of the page.',
        variant: 'badge',
        step: 2,
        bg: 'highlight',
      }),
      createElement('text', box(1, 12, g.cols - 2, 5), {
        text: 'Body copy continuing after the quote.',
        variant: 'plain',
        step: 0,
        bg: 'none',
      }),
    ],
  },
  {
    id: 'back-cover',
    label: 'Back cover',
    formats: ['letter'],
    build: ({ g }) => [
      createElement('block', box(0, 0, g.cols, g.rows), { bg: 'highlight' }),
      createElement('logo', box(1, frac(g.rows, 0.4), 1, 1)),
      createElement('text', box(1, frac(g.rows, 0.55), g.cols - 2, 1), {
        text: 'lehub.example — hello@lehub.example',
        variant: 'badge',
        step: 0,
        bg: 'secondary',
      }),
    ],
  },
]
