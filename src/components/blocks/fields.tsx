import type { ReactNode } from 'react'
import { Segmented } from '../ui'

/**
 * The field vocabulary the block settings are built from.
 *
 * Four controls, and deliberately no text field among them. `LocalizedField`
 * and `RepeatableRows` used to live here and were the two that carried the most
 * weight — every word in the document was typed through the first, and the
 * second added and removed every list row. Both are gone: words are typed on
 * the page, and rows are opened and closed there with Enter and Backspace.
 *
 * What is left are controls for the things a page cannot show you a place to
 * click: a colour, a shape, a count, a switch.
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
