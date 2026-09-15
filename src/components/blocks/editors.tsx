import { type SurfaceId } from '../../config/brand'
import type {
  BandBlock,
  BulletListBlock,
  ChartBlock,
  CoverBlock,
  FigureBlock,
  LinksBlock,
  QuoteOverlayBlock,
  SpacerBlock,
  TableBlock,
  TextBlock,
  TocEntryBlock,
} from '../../doc/blocks'
import { t } from '../../doc/localized'
import { useDeck } from '../../store/useDeck'
import { ImageField } from '../ImageField'
import { Choice, Field, NumberField, Toggle } from './fields'
import { BODY_SIZE_OPTIONS, SURFACE_OPTIONS } from './options'

/**
 * The settings a component has that are **not** words on the page.
 *
 * ## What is no longer here
 *
 * Every text field. This file used to hold a `LocalizedField` for each of a
 * block's strings — a paragraph's body, a quote and its attribution, a
 * definition list's terms, the cover's title — and a `RepeatableRows` to add
 * and remove rows. All of that is typed on the page now: the painters emit a
 * region for every run of words they draw (`render/compose.ts`), the caret goes
 * in it, and Enter and Backspace open and close rows (`doc/rows.ts`).
 *
 * Which leaves a much smaller and much clearer question for this file: what
 * about a component is *not* a thing you could point at? A figure's image, a
 * band's paper, how many columns a list runs in, a link's address. Those have
 * no representation on the page to click, so they need a control — and only
 * those do.
 *
 * ## The shape of what is left
 *
 * Eight kinds have settings. The other twelve have none at all and return null,
 * which is what `hasBlockSettings` in `./index.tsx` reports, so no control
 * appears on a paragraph promising something behind it and then showing an
 * empty card.
 */

export function QuoteOverlayEditor({
  block,
  patch,
}: {
  block: QuoteOverlayBlock
  patch: (p: Partial<QuoteOverlayBlock>) => void
}) {
  return (
    <NumberField
      label="Height on the page"
      value={Math.round((block.atY ?? 0.5) * 100)}
      min={0}
      max={100}
      step={5}
      suffix="% from the top"
      onChange={(v) => patch({ atY: v / 100 })}
    />
  )
}

export function SpacerEditor({
  block,
  patch,
}: {
  block: SpacerBlock
  patch: (p: Partial<SpacerBlock>) => void
}) {
  const fill = block.height === 'fill'
  return (
    <>
      <Toggle
        label="Absorb whatever space is left"
        checked={fill}
        onChange={(on) => patch({ height: on ? 'fill' : 40 })}
        hint="Pushes everything after it to the foot of the page, and keeps it there as the copy above grows."
      />
      <NumberField
        label="Height"
        value={block.height === 'fill' ? 0 : block.height}
        min={0}
        max={700}
        step={10}
        suffix="pt"
        disabled={fill}
        onChange={(height) => patch({ height })}
      />
    </>
  )
}

export function TextEditor({
  block,
  patch,
}: {
  block: TextBlock
  patch: (p: Partial<TextBlock>) => void
}) {
  return (
    <>
      <Choice
        label="Style"
        value={block.role}
        options={[
          { value: 'caption', label: 'Caption' },
          { value: 'credits', label: 'Credit' },
          { value: 'runningHead', label: 'Head' },
          { value: 'statementNote', label: 'Note' },
        ]}
        onChange={(role) => patch({ role })}
      />
      <Choice
        label="Align"
        value={block.align ?? 'left'}
        options={[
          { value: 'left', label: 'Left' },
          { value: 'center', label: 'Centre' },
          { value: 'right', label: 'Right' },
        ]}
        onChange={(align) => patch({ align })}
      />
    </>
  )
}

export function BandEditor({
  block,
  patch,
}: {
  block: BandBlock
  patch: (p: Partial<BandBlock>) => void
}) {
  return (
    <>
      <Choice
        label="Colour"
        value={block.surface}
        options={SURFACE_OPTIONS}
        onChange={(surface) => patch({ surface })}
      />
      <Choice
        label="Runs to the edge"
        value={block.bleed ?? 'none'}
        options={[
          { value: 'none', label: 'No' },
          { value: 'left', label: 'Left' },
          { value: 'right', label: 'Right' },
          { value: 'both', label: 'Both' },
        ]}
        onChange={(bleed) => patch({ bleed })}
        hint="A bleeding edge runs past the margin to the trim of the page."
      />
      <Choice
        label="Text size"
        value={block.size ?? 'm'}
        options={BODY_SIZE_OPTIONS}
        onChange={(size) => patch({ size })}
      />
    </>
  )
}

export function BulletListEditor({
  block,
  patch,
}: {
  block: BulletListBlock
  patch: (p: Partial<BulletListBlock>) => void
}) {
  return (
    <Choice
      label="Columns"
      value={String(block.columns ?? 1) as '1' | '2'}
      options={[
        { value: '1', label: 'One' },
        { value: '2', label: 'Two' },
      ]}
      onChange={(v) => patch({ columns: v === '2' ? 2 : 1 })}
    />
  )
}

/**
 * Addresses, one per link.
 *
 * The link *text* is on the page and is typed there; a URL is not on the page
 * at all — it is what the underline means — so it has nowhere to be clicked and
 * needs a field. Each one is labelled with the words it sits under, so the list
 * reads as the page reads rather than as "Link 1, Link 2".
 *
 * Rows are added and removed on the page with Enter and Backspace, so there are
 * no add or remove buttons here.
 */
export function LinksEditor({
  block,
  patch,
}: {
  block: LinksBlock
  patch: (p: Partial<LinksBlock>) => void
}) {
  const lang = useDeck((s) => s.deck.lang)
  const set = (i: number, href: string | undefined) =>
    patch({ items: block.items.map((row, n) => (n === i ? { ...row, href } : row)) })

  return (
    <>
      {block.items.map((row, i) => (
        <Field key={i} label={t(row.label, lang) || `Link ${i + 1}`}>
          <input
            value={row.href ?? ''}
            placeholder="https://…"
            onChange={(e) => set(i, e.target.value || undefined)}
            className="w-full border border-ink/25 bg-control px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-black"
          />
        </Field>
      ))}
    </>
  )
}

/**
 * A table's shape: whether the first row is a header, and the column shares.
 *
 * Cells are typed on the page and rows are opened with Tab, so neither is here.
 * What is here is what a cell cannot tell you by being clicked: that the top row
 * is set as a header, and how the measure is divided between the columns.
 *
 * The shares are whole numbers because that is how they read — `2 1 1` is "the
 * first is twice the others" — and `render/compose.ts` turns them into grid
 * columns. Nothing has to add up to anything.
 */
export function TableEditor({
  block,
  patch,
}: {
  block: TableBlock
  patch: (p: Partial<TableBlock>) => void
}) {
  const setWidth = (i: number, v: number) =>
    patch({ widths: block.widths.map((w, n) => (n === i ? Math.max(1, v) : w)) })

  const setColumns = (count: number) => {
    const n = Math.max(1, Math.min(6, count))
    patch({
      widths: Array.from({ length: n }, (_, i) => block.widths[i] ?? 1),
      rows: block.rows.map((row) => Array.from({ length: n }, (_, i) => row[i] ?? '')),
    })
  }

  return (
    <>
      <Toggle
        label="First row is a header"
        checked={!!block.header}
        onChange={(header) => patch({ header: header || undefined })}
      />
      <NumberField
        label="Columns"
        value={block.widths.length}
        min={1}
        max={6}
        onChange={setColumns}
      />
      {block.widths.map((w, i) => (
        <NumberField
          key={i}
          label={`Column ${i + 1} share`}
          value={w}
          min={1}
          max={9}
          onChange={(v) => setWidth(i, v)}
        />
      ))}
    </>
  )
}

export function ChartEditor({
  block,
  patch,
}: {
  block: ChartBlock
  patch: (p: Partial<ChartBlock>) => void
}) {
  return (
    <>
      <Field label="Unit" hint="Appended to every value. Leave empty for a plain count.">
        <input
          value={block.unit ?? ''}
          placeholder="%"
          onChange={(e) => patch({ unit: e.target.value || undefined })}
          className="w-full border border-ink/25 bg-control px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-black"
        />
      </Field>
      <NumberField
        label="Full scale"
        value={block.max ?? 0}
        min={0}
        onChange={(max) => patch({ max: max > 0 ? max : undefined })}
        hint="0 scales the bars to the largest value in the set."
      />
    </>
  )
}

/**
 * Page numbers on a hand-authored contents row.
 *
 * Only the numbers: the chapter and its sections are words on the page and are
 * typed there. Note that a `contents` block works all of this out from the
 * document itself and needs no editor at all — this is for the rows somebody
 * has placed by hand.
 */
export function TocEntryEditor({
  block,
  patch,
}: {
  block: TocEntryBlock
  patch: (p: Partial<TocEntryBlock>) => void
}) {
  const lang = useDeck((s) => s.deck.lang)
  return (
    <>
      <NumberField
        label={t(block.label, lang) || 'Chapter'}
        value={block.folio}
        min={1}
        onChange={(folio) => patch({ folio })}
      />
      {(block.sections ?? []).map((row, i) => (
        <NumberField
          key={i}
          label={t(row.label, lang) || `Section ${i + 1}`}
          value={row.folio}
          min={1}
          onChange={(folio) =>
            patch({
              sections: (block.sections ?? []).map((s, n) => (n === i ? { ...s, folio } : s)),
            })
          }
        />
      ))}
    </>
  )
}

/** Height as a multiple of the frame's own width. */
const ASPECTS = [
  { value: '0.62', label: 'Wide' },
  { value: '0.75', label: 'Landscape' },
  { value: '1', label: 'Square' },
  { value: '1.08', label: 'Portrait' },
  { value: '1.35', label: 'Tall' },
  { value: '1.48', label: 'Taller' },
]

export function FigureEditor({
  block,
  patch,
}: {
  block: FigureBlock
  patch: (p: Partial<FigureBlock>) => void
}) {
  const aspect = block.aspect ?? 1.35
  return (
    <>
      <ImageField
        value={block.imageRef}
        onChange={(imageRef) => patch({ imageRef })}
        focus={block.focus}
        onFocusChange={(focus) => patch({ focus })}
      />
      <Choice
        label="Shape"
        value={ASPECTS.find((a) => Number(a.value) === aspect)?.value ?? 'custom'}
        options={[...ASPECTS, { value: 'custom', label: 'Custom' }]}
        onChange={(v) => {
          if (v !== 'custom') patch({ aspect: Number(v) })
        }}
        hint="Height as a multiple of the frame's width."
      />
      <NumberField
        label="Exact height"
        value={aspect}
        min={0.2}
        max={3}
        step={0.01}
        suffix="× width"
        onChange={(v) => patch({ aspect: v })}
      />
      <Choice<SurfaceId | 'none'>
        label="Panel behind"
        value={block.panel ?? 'none'}
        options={[{ value: 'none', label: 'None' }, ...SURFACE_OPTIONS]}
        onChange={(panel) => patch({ panel: panel === 'none' ? undefined : panel })}
        hint="A colour field the size of the frame, with the image sitting inset on it."
      />
      {block.panel && (
        <NumberField
          label="Inset from the panel"
          value={block.inset ?? 0}
          min={0}
          max={120}
          step={2}
          suffix="pt"
          onChange={(inset) => patch({ inset })}
        />
      )}
    </>
  )
}

export function CoverEditor({
  block,
  patch,
}: {
  block: CoverBlock
  patch: (p: Partial<CoverBlock>) => void
}) {
  return (
    <>
      <ImageField
        label="Cut-out"
        value={block.imageRef}
        onChange={(imageRef) => patch({ imageRef })}
      />
      <Toggle
        label="Show the Le HUB mark at the foot"
        checked={!!block.wordmark}
        onChange={(on) => patch({ wordmark: on ? 'Le HUB' : undefined })}
      />
    </>
  )
}
