import { BODY_SIZE, type BodySizeId, type SurfaceId } from '../../config/brand'
import type {
  BandBlock,
  BulletListBlock,
  ChartBlock,
  CoverBlock,
  CreditsBlock,
  DefListBlock,
  FigureBlock,
  LinksBlock,
  ParaBlock,
  QuoteBlock,
  QuoteOverlayBlock,
  SpacerBlock,
  StatementBlock,
  TextBlock,
  TocEntryBlock,
} from '../../doc/blocks'
import { t, type LocalizedText } from '../../doc/localized'
import { useDeck } from '../../store/useDeck'
import { ImageField } from '../ImageField'
import { Choice, Field, LocalizedField, NumberField, RepeatableRows, Toggle } from './fields'
import { BODY_SIZE_OPTIONS, SURFACE_OPTIONS } from './options'

/**
 * One editor per component kind.
 *
 * Everything a block can express is reachable from here. That sounds obvious,
 * and it is exactly what was missing: the previous inspector edited `block.text`
 * and nothing else, so a definition list, a chart or the cover's own title
 * could be *added* to a page and then never changed.
 */

// ---------------------------------------------------------------------------
// Prose
// ---------------------------------------------------------------------------

export function ParaEditor({
  block,
  patch,
}: {
  block: ParaBlock
  patch: (p: Partial<ParaBlock>) => void
}) {
  const pageSize = useDeck((s) => s.deck.leaves[s.leafIndex]?.bodySize ?? 'xs')
  return (
    <>
      <LocalizedField value={block.text} onChange={(text) => patch({ text })} multiline rows={6} />
      <Toggle
        label="Indent the first line"
        checked={block.indent !== false}
        onChange={(indent) => patch({ indent })}
        hint="Off for the paragraph that opens a section — the design sets those flush."
      />
      <Choice<BodySizeId | 'page'>
        label="Size (this paragraph only)"
        value={block.size ?? 'page'}
        options={[{ value: 'page', label: 'Page' }, ...BODY_SIZE_OPTIONS]}
        onChange={(size) => patch({ size: size === 'page' ? undefined : size })}
        hint={`The rest of the page is set at ${BODY_SIZE[pageSize]}pt.`}
      />
    </>
  )
}

export function QuoteEditor({
  block,
  patch,
}: {
  block: QuoteBlock
  patch: (p: Partial<QuoteBlock>) => void
}) {
  return (
    <>
      <LocalizedField value={block.text} onChange={(text) => patch({ text })} multiline rows={4} />
      <LocalizedField
        label="Attribution"
        value={block.attribution}
        onChange={(attribution) => patch({ attribution })}
        placeholder="— an organizer, Ontario"
      />
    </>
  )
}

export function StatementEditor({
  block,
  patch,
}: {
  block: StatementBlock
  patch: (p: Partial<StatementBlock>) => void
}) {
  const lang = useDeck((s) => s.deck.lang)
  const body = t(block.text, lang)
  const highlights = block.highlights ?? []

  return (
    <>
      <LocalizedField value={block.text} onChange={(text) => patch({ text })} multiline rows={4} />

      <RepeatableRows
        label="Phrases on the colour"
        rows={highlights}
        onChange={(next) => patch({ highlights: next })}
        blank={() => ''}
        addLabel="Add a phrase"
        hint="Each phrase is set on the swash. It has to appear in the text above, word for word."
        render={(phrase, set, i) => (
          <>
            <Field>
              <input
                value={phrase}
                onChange={(e) => set(e.target.value)}
                className="w-full border border-ink/25 bg-control px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-black"
              />
            </Field>
            {phrase !== '' && !body.includes(phrase) && (
              <p key={i} className="px-1 text-[11px] text-[#FF8FA3]">
                Not found in the text — this phrase won't be highlighted.
              </p>
            )}
          </>
        )}
      />

      <LocalizedField
        label="Note underneath"
        value={block.note}
        onChange={(note) => patch({ note })}
        placeholder="(Ontario, Quebec, British Columbia)"
      />
    </>
  )
}

export function QuoteOverlayEditor({
  block,
  patch,
}: {
  block: QuoteOverlayBlock
  patch: (p: Partial<QuoteOverlayBlock>) => void
}) {
  return (
    <>
      <LocalizedField value={block.text} onChange={(text) => patch({ text })} multiline rows={4} />
      <NumberField
        label="Height on the page"
        value={Math.round((block.atY ?? 0.5) * 100)}
        min={0}
        max={100}
        step={5}
        suffix="% from the top"
        onChange={(v) => patch({ atY: v / 100 })}
      />
    </>
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
      <LocalizedField value={block.text} onChange={(text) => patch({ text })} multiline rows={3} />
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
      <LocalizedField value={block.text} onChange={(text) => patch({ text })} multiline rows={2} />
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

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export function DefListEditor({
  block,
  patch,
}: {
  block: DefListBlock
  patch: (p: Partial<DefListBlock>) => void
}) {
  return (
    <RepeatableRows
      label="Terms"
      rows={block.rows}
      onChange={(rows) => patch({ rows })}
      blank={() => ({ term: '', def: '' })}
      addLabel="Add a term"
      render={(row, set) => (
        <>
          <LocalizedField label="Term" value={row.term} onChange={(term) => set({ ...row, term })} />
          <LocalizedField
            label="Definition"
            value={row.def}
            onChange={(def) => set({ ...row, def })}
            multiline
            rows={3}
          />
        </>
      )}
    />
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
    <>
      <RepeatableRows
        label="Items"
        rows={block.items}
        onChange={(items) => patch({ items })}
        blank={() => '' as LocalizedText}
        addLabel="Add an item"
        render={(item, set) => <LocalizedField value={item} onChange={set} />}
      />
      <Choice
        label="Columns"
        value={String(block.columns ?? 1) as '1' | '2'}
        options={[
          { value: '1', label: 'One' },
          { value: '2', label: 'Two' },
        ]}
        onChange={(v) => patch({ columns: v === '2' ? 2 : 1 })}
      />
    </>
  )
}

export function LinksEditor({
  block,
  patch,
}: {
  block: LinksBlock
  patch: (p: Partial<LinksBlock>) => void
}) {
  return (
    <RepeatableRows
      label="Links"
      rows={block.items}
      onChange={(items) => patch({ items })}
      blank={() => ({ label: '' })}
      addLabel="Add a link"
      render={(row, set) => (
        <>
          <LocalizedField
            label="Text"
            value={row.label}
            onChange={(label) => set({ ...row, label })}
          />
          <Field label="Address">
            <input
              value={row.href ?? ''}
              placeholder="https://…"
              onChange={(e) => set({ ...row, href: e.target.value || undefined })}
              className="w-full border border-ink/25 bg-control px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-black"
            />
          </Field>
          <LocalizedField
            label="Note"
            value={row.note}
            onChange={(note) => set({ ...row, note })}
            multiline
            rows={2}
          />
        </>
      )}
    />
  )
}

export function CreditsEditor({
  block,
  patch,
}: {
  block: CreditsBlock
  patch: (p: Partial<CreditsBlock>) => void
}) {
  return (
    <RepeatableRows
      label="Credits"
      rows={block.rows}
      onChange={(rows) => patch({ rows })}
      blank={() => ({ label: '', value: '' })}
      addLabel="Add a credit"
      render={(row, set) => (
        <>
          <LocalizedField
            label="Role"
            value={row.label}
            onChange={(label) => set({ ...row, label })}
          />
          <LocalizedField
            label="Name"
            value={row.value}
            onChange={(value) => set({ ...row, value })}
          />
        </>
      )}
    />
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
      <RepeatableRows
        label="Bars"
        rows={block.series}
        onChange={(series) => patch({ series })}
        blank={() => ({ label: '', value: 0 })}
        addLabel="Add a bar"
        hint="A bar's width is its value — this is the one place the design leaves the column grid."
        render={(row, set) => (
          <>
            <LocalizedField
              label="Label"
              value={row.label}
              onChange={(label) => set({ ...row, label })}
            />
            <LocalizedField
              label="Sub-label"
              value={row.sublabel}
              onChange={(sublabel) => set({ ...row, sublabel })}
            />
            <NumberField
              label="Value"
              value={row.value}
              min={0}
              step={0.5}
              onChange={(value) => set({ ...row, value })}
            />
          </>
        )}
      />
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

export function TocEntryEditor({
  block,
  patch,
}: {
  block: TocEntryBlock
  patch: (p: Partial<TocEntryBlock>) => void
}) {
  return (
    <>
      <LocalizedField label="Chapter" value={block.label} onChange={(label) => patch({ label })} />
      <NumberField
        label="Page"
        value={block.folio}
        min={1}
        onChange={(folio) => patch({ folio })}
      />
      <RepeatableRows
        label="Sections"
        rows={block.sections ?? []}
        onChange={(sections) => patch({ sections })}
        blank={() => ({ label: '', folio: block.folio })}
        addLabel="Add a section"
        render={(row, set) => (
          <>
            <LocalizedField value={row.label} onChange={(label) => set({ ...row, label })} />
            <LocalizedField
              label="Parenthetical"
              value={row.qualifier}
              onChange={(qualifier) => set({ ...row, qualifier })}
              placeholder="(campaigns/actions)"
            />
            <NumberField
              label="Page"
              value={row.folio}
              min={1}
              onChange={(folio) => set({ ...row, folio })}
            />
          </>
        )}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const ASPECTS = [
  { value: '1.08', label: 'Square-ish' },
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
      <LocalizedField
        label="Caption"
        value={block.caption}
        onChange={(caption) => patch({ caption })}
        multiline
        rows={2}
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
      <LocalizedField
        label="Title"
        value={block.title}
        onChange={(title) => patch({ title })}
        multiline
        rows={2}
        hint="Each line is set on its own, fitted across the spread. Press Enter to break it."
      />
      <LocalizedField
        label="Subtitle"
        value={block.subtitle}
        onChange={(subtitle) => patch({ subtitle })}
        multiline
        rows={2}
      />
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
