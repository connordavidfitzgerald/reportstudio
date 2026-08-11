import type { Palette } from '../types'

/**
 * The Le HUB page surfaces, measured from the *Tools for Change* redesign.
 *
 * One palette per surface a page can take. `background` is the full-bleed colour
 * field; `highlight` is the swash — the rectangle behind a run of text on TOC
 * rows, the cover subtitle, pull quotes and stat callouts.
 *
 * The swash is pink on every surface except pink itself, which falls back to
 * paper. Text is never in here: it is always ink (black at 70%) over whichever
 * surface the page is, which is why `TEXT_COLOR` in `constants.ts` is an alpha
 * and not a blended hex.
 *
 * These four hexes are duplicated in `src/config/brand.ts`, which documents where
 * each one was measured from. They are literals here so `src/core/` stays
 * self-contained and portable back to the poster app — keep the two in step.
 */
export const PALETTES: Palette[] = [
  {
    id: 'paper',
    label: 'Paper',
    background: '#FFF8EC',
    secondaryBg: '#FF669E',
    highlight: '#FF669E',
  },
  {
    id: 'lime',
    label: 'Lime',
    background: '#99CC00',
    secondaryBg: '#FF669E',
    highlight: '#FF669E',
  },
  {
    id: 'ochre',
    label: 'Ochre',
    background: '#CC9900',
    secondaryBg: '#FF669E',
    highlight: '#FF669E',
  },
  {
    id: 'pink',
    label: 'Pink',
    background: '#FF669E',
    secondaryBg: '#FFF8EC',
    highlight: '#FFF8EC',
  },
]

export const getPalette = (id: string): Palette =>
  PALETTES.find((p) => p.id === id) ?? PALETTES[0]
