import { createElement } from '../doc/defaults'
import type { PageElement } from '../doc/types'
import { box, frac, type Template } from './types'

/**
 * Presentation templates. Every one is authored against `g.cols` / `g.rows`
 * rather than literal counts, so the same definition holds if the grid changes.
 * Placeholder copy is real prose in the brand voice — lorem reads as unfinished
 * and gets left in.
 */
export const SLIDE_TEMPLATES: Template[] = [
  {
    id: 'title',
    label: 'Title',
    formats: ['slide'],
    build: ({ g }) => [
      createElement('image', box(0, 0, g.cols, g.rows), { halftone: null }),
      createElement('text', box(1, frac(g.rows, 0.15), g.cols - 2, 3), {
        text: 'Presentation title',
        variant: 'header',
        autoFit: true,
        bg: 'outline',
      }),
      createElement('text', box(1, frac(g.rows, 0.55), frac(g.cols, 0.45), 1), {
        text: 'Subtitle or date',
        variant: 'badge',
        step: 1,
        bg: 'highlight',
      }),
      createElement('logo', box(1, g.rows - 2, 2, 1)),
    ],
  },
  {
    id: 'section',
    label: 'Section',
    formats: ['slide'],
    build: ({ g }) => [
      createElement('text', box(1, 1, 2, 1), {
        text: '01',
        variant: 'badge',
        step: 1,
        bg: 'highlight',
      }),
      createElement('text', box(1, frac(g.rows, 0.35), g.cols - 2, 3), {
        text: 'Section name',
        variant: 'header',
        autoFit: true,
        bg: 'outline',
      }),
    ],
  },
  {
    id: 'agenda',
    label: 'Contents',
    formats: ['slide'],
    build: ({ g }) => {
      const rowStart = 3
      const entries = ['Introduction', 'Context', 'Approach', 'Results', 'Next steps']
      const els: PageElement[] = [
        createElement('text', box(1, 1, frac(g.cols, 0.4), 1), {
          text: 'Contents',
          variant: 'header',
          step: 4,
          bg: 'outline',
        }),
      ]
      // One element per entry, so each drags and restyles independently.
      entries.forEach((label, i) => {
        els.push(
          createElement('text', box(1, rowStart + i, 1, 1), {
            text: `0${i + 1}`,
            variant: 'badge',
            step: 0,
            bg: 'highlight',
          }),
          createElement('text', box(3, rowStart + i, g.cols - 4, 1), {
            text: label,
            variant: 'badge',
            step: 1,
            bg: 'secondary',
          }),
        )
      })
      return els
    },
  },
  {
    id: 'heading-body',
    label: 'Heading + body',
    formats: ['slide'],
    build: ({ g }) => [
      createElement('text', box(1, 1, g.cols - 2, 2), {
        text: 'Section heading',
        variant: 'header',
        step: 4,
        bg: 'outline',
      }),
      createElement('text', box(1, 4, frac(g.cols, 0.6), 4), {
        text: 'Supporting copy goes here. Keep it to a few lines — a slide is a prompt, not a document.',
        variant: 'paragraph',
        step: 0,
        bg: 'secondary',
      }),
    ],
  },
  {
    id: 'two-up',
    label: 'Two column',
    formats: ['slide'],
    build: ({ g }) => {
      const half = g.cols / 2
      return [
        createElement('text', box(1, 1, g.cols - 2, 2), {
          text: 'Comparison',
          variant: 'header',
          step: 4,
          bg: 'outline',
        }),
        createElement('text', box(1, 4, half - 2, 1), {
          text: 'First',
          variant: 'badge',
          step: 1,
          bg: 'highlight',
        }),
        createElement('text', box(1, 5, half - 2, 3), {
          text: 'The left-hand argument, stated plainly.',
          variant: 'paragraph',
          step: 0,
          bg: 'secondary',
        }),
        createElement('text', box(half + 1, 4, half - 2, 1), {
          text: 'Second',
          variant: 'badge',
          step: 1,
          bg: 'highlight',
        }),
        createElement('text', box(half + 1, 5, half - 2, 3), {
          text: 'The right-hand argument, stated plainly.',
          variant: 'paragraph',
          step: 0,
          bg: 'secondary',
        }),
      ]
    },
  },
  {
    id: 'image-left',
    label: 'Image + text',
    formats: ['slide'],
    build: ({ g }) => {
      const split = frac(g.cols, 0.5)
      return [
        createElement('image', box(0, 0, split, g.rows), { halftone: null }),
        createElement('text', box(split + 1, 2, g.cols - split - 2, 2), {
          text: 'Headline',
          variant: 'header',
          step: 4,
          bg: 'outline',
        }),
        createElement('text', box(split + 1, 5, g.cols - split - 2, 3), {
          text: 'A short paragraph beside the image.',
          variant: 'paragraph',
          step: 0,
          bg: 'secondary',
        }),
      ]
    },
  },
  {
    id: 'full-image',
    label: 'Full image',
    formats: ['slide'],
    build: ({ g }) => [
      createElement('image', box(0, 0, g.cols, g.rows), { halftone: null }),
      createElement('text', box(1, g.rows - 2, frac(g.cols, 0.5), 1), {
        text: 'Caption',
        variant: 'badge',
        step: 0,
        bg: 'highlight',
      }),
    ],
  },
  {
    id: 'quote',
    label: 'Quote',
    formats: ['slide'],
    build: ({ g }) => [
      createElement('text', box(1, frac(g.rows, 0.25), g.cols - 2, 3), {
        text: 'A line worth putting on its own slide.',
        variant: 'header',
        autoFit: true,
        bg: 'outline',
        align: 'center',
      }),
      createElement('text', box(1, frac(g.rows, 0.7), g.cols - 2, 1), {
        text: 'Attribution',
        variant: 'badge',
        step: 0,
        align: 'center',
        bg: 'highlight',
      }),
    ],
  },
  {
    id: 'stats',
    label: 'Three up',
    formats: ['slide'],
    build: ({ g }) => {
      // The whole reason the grid divides by three.
      const third = g.cols / 3
      const values = ['72%', '3.4k', '18']
      const labels = ['Completion', 'Participants', 'Partners']
      return values.flatMap((value, i) => [
        createElement('text', box(i * third + 1, 3, third - 1, 2), {
          text: value,
          variant: 'header',
          autoFit: true,
          bg: 'outline',
        }),
        createElement('text', box(i * third + 1, 6, third - 1, 1), {
          text: labels[i],
          variant: 'badge',
          step: 0,
          bg: 'secondary',
        }),
      ])
    },
  },
  {
    id: 'closing',
    label: 'Closing',
    formats: ['slide'],
    build: ({ g }) => [
      createElement('logo', box(frac(g.cols, 0.42), frac(g.rows, 0.4), 2, 1)),
      createElement('text', box(1, frac(g.rows, 0.6), g.cols - 2, 1), {
        text: 'lehub.example — hello@lehub.example',
        variant: 'badge',
        step: 0,
        align: 'center',
        bg: 'highlight',
      }),
    ],
  },
  { id: 'blank', label: 'Blank', formats: ['slide', 'letter'], build: () => [] },
]
