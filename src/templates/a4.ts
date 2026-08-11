import { createElement } from '../doc/defaults'
import { box, frac, type Template } from './types'

/**
 * The A4 report archetypes, transcribed from the *Tools for Change* redesign.
 *
 * These are the pages that are *composed* rather than flowed — a cover, a
 * contents page, a chapter opener, a full-bleed photo, a colophon. Everything
 * between them is a flow section, which is why there is no "body page" template
 * here: composing running text page by page is exactly what the flow engine
 * exists to stop anyone doing.
 *
 * Two archetypes at the end (conclusion and appendix) had to be *designed*
 * rather than transcribed — the Figma redesign stops before them — so they are
 * built from the system's own parts rather than copied.
 */
export const A4_TEMPLATES: Template[] = [
  {
    id: 'a4-cover',
    label: 'Cover',
    formats: ['a4'],
    // Giant condensed title over a cut-out image, subtitle on a swash, logo
    // centred at the foot — the redesign's cover, on one page rather than the
    // spread it was drawn across.
    build: ({ g }) => [
      createElement('text', box(0, 0, g.cols, frac(g.rows, 0.22)), {
        text: 'TOOLS FOR\nCHANGE',
        variant: 'header',
        autoFit: true,
        bg: 'outline',
      }),
      createElement('image', box(0, frac(g.rows, 0.24), g.cols, frac(g.rows, 0.5)), {
        halftone: null,
      }),
      createElement('text', box(1, frac(g.rows, 0.58), g.cols - 2, frac(g.rows, 0.06)), {
        text: 'Understanding the needs of climate justice organizers',
        variant: 'badge',
        step: 2,
        align: 'center',
        bg: 'highlight',
      }),
      createElement('logo', box(frac(g.cols, 0.42), g.rows - 4, frac(g.cols, 0.16), 2)),
    ],
  },
  {
    id: 'a4-contents',
    label: 'Contents',
    formats: ['a4'],
    // Entries on swashes with page numbers — the folio column is the point, so
    // it gets its own columns rather than being tabbed into the same box.
    build: ({ g }) => {
      const rows = ['Executive summary', 'Introduction', 'Methodology', 'Findings', 'Conclusion']
      const top = frac(g.rows, 0.12)
      const step = frac(g.rows, 0.07)
      return [
        createElement('text', box(0, frac(g.rows, 0.04), g.cols, 2), {
          text: 'TABLE OF CONTENTS',
          variant: 'plain',
          step: 0,
        }),
        ...rows.flatMap((label, i) => [
          createElement('text', box(0, top + i * step, g.cols - 2, step), {
            text: label.toUpperCase(),
            variant: 'header',
            step: 4,
            bg: 'highlight',
          }),
          createElement('text', box(g.cols - 2, top + i * step, 2, step), {
            text: String(6 + i * 4),
            variant: 'plain',
            step: 4,
            align: 'right',
          }),
        ]),
      ]
    },
  },
  {
    id: 'a4-chapter',
    label: 'Chapter opener',
    formats: ['a4'],
    build: ({ g }) => [
      createElement('text', box(0, frac(g.rows, 0.08), g.cols, frac(g.rows, 0.14)), {
        text: 'Campaign\nDevelopment',
        variant: 'plain',
        step: 8,
      }),
      createElement('text', box(0, frac(g.rows, 0.26), g.cols, frac(g.rows, 0.12)), {
        text: 'The process of ideating, developing, and carrying out a campaign, including creating a theory of change and choosing effective tactics.',
        variant: 'paragraph',
        step: 4,
        bg: 'none',
      }),
    ],
  },
  {
    id: 'a4-photo',
    label: 'Full-bleed photo',
    formats: ['a4'],
    // The colour field IS the page background here, so the image runs to the
    // trim and the caption sits on a swash over it.
    build: ({ g }) => [
      createElement('image', box(0, 0, g.cols, g.rows), { halftone: null }),
      createElement('text', box(0, g.rows - 4, g.cols, 3), {
        text: 'Photo courtesy of —',
        variant: 'badge',
        step: 0,
        bg: 'highlight',
      }),
    ],
  },
  {
    id: 'a4-statement',
    label: 'Statement',
    formats: ['a4'],
    build: ({ g }) => [
      createElement('text', box(0, frac(g.rows, 0.2), g.cols, frac(g.rows, 0.3)), {
        text: 'LE HUB MEMBERS SPOKE WITH 21 ORGANIZERS FROM 16 ORGANIZATIONS ACROSS 6 PROVINCES.',
        variant: 'header',
        autoFit: true,
        bg: 'highlight',
      }),
    ],
  },
  {
    id: 'a4-colophon',
    label: 'Colophon',
    formats: ['a4'],
    // Stacked label/value credits, small, low on the page — the last spread.
    build: ({ g }) => {
      const credits = [
        'Main author\n—',
        'Data collection\n—',
        'Editors\n—',
        'Report design\n—',
      ]
      const top = frac(g.rows, 0.55)
      const step = frac(g.rows, 0.08)
      return [
        createElement('text', box(0, frac(g.rows, 0.08), frac(g.cols, 0.6), frac(g.rows, 0.2)), {
          text: 'This report is produced by the Climate Justice Organizing HUB.',
          variant: 'paragraph',
          step: 0,
        }),
        ...credits.map((text, i) =>
          createElement('text', box(0, top + i * step, frac(g.cols, 0.5), step), {
            text,
            variant: 'plain',
            step: 0,
          }),
        ),
      ]
    },
  },
]
