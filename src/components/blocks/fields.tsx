import type { ReactNode } from 'react'
import {
  isFullyTranslated,
  setLang as setLocalized,
  t,
  type LocalizedText,
} from '../../doc/localized'
import { useDeck } from '../../store/useDeck'
import { IconButton, Segmented } from '../ui'

/**
 * The field vocabulary the block editors are built from.
 *
 * Two of these carry most of the weight. {@link LocalizedField} is how every
 * word in the document is typed, and it is what makes the bilingual layer real
 * rather than theoretical. {@link RepeatableRows} is the one list editor, shared
 * by the six components — definition lists, bullets, links, credits, chart bars,
 * contents entries — that until now had no editor at all, because each of them
 * needed a list and none of them had one.
 */

const LABEL = 'text-2xs leading-none text-dim'

/** A labelled row. Every control below lays out the same way. */
export function Field({
  label,
  hint,
  children,
}: {
  label?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1 px-1">
      {label && <span className={LABEL}>{label}</span>}
      {children}
      {hint && <p className="text-[11px] leading-snug text-dim">{hint}</p>}
    </div>
  )
}

const INPUT =
  'w-full border border-ink/25 bg-control px-2 py-1.5 text-sm leading-snug text-ink outline-none focus:ring-1 focus:ring-black'

/**
 * A text field that edits one language of a {@link LocalizedText}.
 *
 * A plain string means "the same in both languages" — the common case, and the
 * cheap representation. Typing into the French edition splits it into a pair;
 * `setLang` collapses it back to a string if the two ever agree again, so a
 * document never accumulates redundant translations.
 *
 * The note under a shared field is the point of the whole control: without it,
 * someone editing the French edition sees English words in the box and has no
 * way to tell whether that is a translation that happens to match or a
 * translation nobody has written yet.
 */
export function LocalizedField({
  label,
  value,
  onChange,
  multiline,
  rows = 3,
  hint,
  placeholder,
}: {
  label?: string
  value: LocalizedText | undefined
  onChange: (next: LocalizedText) => void
  multiline?: boolean
  rows?: number
  hint?: string
  placeholder?: string
}) {
  const lang = useDeck((s) => s.deck.lang)
  const text = t(value, lang)
  const shared = typeof value === 'string' || !isFullyTranslated(value)
  const set = (next: string) => onChange(setLocalized(value, lang, next))

  return (
    <Field label={label} hint={hint}>
      {multiline ? (
        <textarea
          value={text}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => set(e.target.value)}
          className={`${INPUT} resize-y`}
        />
      ) : (
        <input
          value={text}
          placeholder={placeholder}
          onChange={(e) => set(e.target.value)}
          className={INPUT}
        />
      )}
      {shared && text !== '' && (
        <span className="font-mono text-[10px] uppercase text-ink/35">
          {lang === 'fr' ? 'Not translated — shows the English' : 'Used in both languages'}
        </span>
      )}
    </Field>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  disabled,
}: {
  label?: string
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
  hint?: string
  disabled?: boolean
}) {
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.target.value))}
          className={`${INPUT} w-24 disabled:opacity-30`}
        />
        {suffix && <span className="font-mono text-[11px] text-dim">{suffix}</span>}
      </div>
    </Field>
  )
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <div className="flex flex-col gap-1 px-1">
      <label className="flex items-start gap-2 text-xs leading-snug">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>{label}</span>
      </label>
      {hint && <p className="pl-5 text-[11px] leading-snug text-dim">{hint}</p>}
    </div>
  )
}

/** A labelled single choice. `options` are shown in the order given. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label?: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  hint?: string
}) {
  return (
    <Field label={label} hint={hint}>
      <Segmented value={value} options={options} onChange={onChange} />
    </Field>
  )
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

function RowButtons({
  index,
  count,
  onMove,
  onRemove,
}: {
  index: number
  count: number
  onMove: (delta: number) => void
  onRemove: () => void
}) {
  return (
    <div className="flex shrink-0 flex-col gap-0.5">
      <IconButton title="Move up" disabled={index === 0} onClick={() => onMove(-1)}>
        <span className="text-[11px] leading-none">↑</span>
      </IconButton>
      <IconButton title="Move down" disabled={index === count - 1} onClick={() => onMove(1)}>
        <span className="text-[11px] leading-none">↓</span>
      </IconButton>
      <IconButton title="Remove this row" onClick={onRemove}>
        <span className="text-[11px] leading-none">×</span>
      </IconButton>
    </div>
  )
}

/**
 * The one list editor.
 *
 * Rows are added, reordered and removed the same way everywhere; only the
 * fields inside a row differ, and those come from `render`. Writing six of
 * these by hand is how the six list components ended up with no editor at all.
 */
export function RepeatableRows<T>({
  label,
  rows,
  onChange,
  blank,
  render,
  addLabel = 'Add row',
  hint,
}: {
  label: string
  rows: T[]
  onChange: (rows: T[]) => void
  /** A new empty row, shaped like the ones already there. */
  blank: () => T
  render: (row: T, patch: (next: T) => void, index: number) => ReactNode
  addLabel?: string
  hint?: string
}) {
  const replace = (i: number, next: T) => onChange(rows.map((r, j) => (j === i ? next : r)))
  const move = (i: number, delta: number) => {
    const to = i + delta
    if (to < 0 || to >= rows.length) return
    const next = [...rows]
    const [row] = next.splice(i, 1)
    next.splice(to, 0, row)
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-2 px-1">
      <span className={LABEL}>{label}</span>
      {hint && <p className="text-[11px] leading-snug text-dim">{hint}</p>}

      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-1.5 border-l-2 border-ink/25/15 pl-1.5">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            {render(row, (next) => replace(i, next), i)}
          </div>
          <RowButtons
            index={i}
            count={rows.length}
            onMove={(d) => move(i, d)}
            onRemove={() => onChange(rows.filter((_, j) => j !== i))}
          />
        </div>
      ))}

      {!rows.length && <p className="text-[11px] text-dim">Nothing here yet.</p>}

      <button
        type="button"
        onClick={() => onChange([...rows, blank()])}
        className="w-full border border-ink/25/30 px-2 py-1 text-[11px] uppercase tracking-wide hover:bg-ink hover:text-card"
      >
        {addLabel}
      </button>
    </div>
  )
}
