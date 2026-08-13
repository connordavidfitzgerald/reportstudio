import type { BodySizeId, SurfaceId } from '../../config/brand'

/**
 * The choice lists the editors and the page panel share.
 *
 * Plain data in its own module so the component files export only components —
 * and so the page's body-size control and a paragraph's override can't drift
 * into naming the same four sizes differently.
 *
 * The names are the client's, not the design system's: `xs`/`s`/`m`/`l` is what
 * the code calls them, and it tells someone choosing a size nothing at all.
 */
export const BODY_SIZE_OPTIONS: { value: BodySizeId; label: string }[] = [
  { value: 'xs', label: 'Compact' },
  { value: 's', label: 'Normal' },
  { value: 'm', label: 'Roomy' },
  { value: 'l', label: 'Large' },
]

/**
 * The papers, named and ordered as the client names them.
 *
 * `paper` is "Cream" and `ochre` is "Yellow": the ids describe the ink they were
 * sampled from, the labels describe what someone choosing a page sees. Keyed
 * off `SURFACES` so a fifth paper can't be added there and quietly go missing
 * here.
 */
const SURFACE_LABELS: Record<SurfaceId, string> = {
  paper: 'Cream',
  lime: 'Lime',
  pink: 'Pink',
  ochre: 'Yellow',
}

export const SURFACE_OPTIONS: { value: SurfaceId; label: string }[] = (
  Object.keys(SURFACE_LABELS) as SurfaceId[]
).map((id) => ({ value: id, label: SURFACE_LABELS[id] }))

/**
 * How wide a component is, in the nine columns of the measure.
 *
 * Not invented: these are the four runs the *Tools for Change* file actually
 * uses (see `doc/blocks.ts` on `BlockBase.col`), so choosing one lands on a real
 * column line by construction. Shared by the canvas toolbar and the per-block
 * editor, which is the point of it living here — two lists of named runs would
 * drift the first time a fifth was needed.
 */
export interface ColumnRunOption {
  id: string
  label: string
  col: number
  span: number
}

export const COLUMN_RUNS: ColumnRunOption[] = [
  { id: 'full', label: 'Full width', col: 0, span: 9 },
  { id: 'inset', label: 'Inset', col: 1, span: 7 },
  { id: 'outer', label: 'Outer column', col: 4, span: 5 },
  { id: 'half', label: 'Left half', col: 0, span: 6 },
]
