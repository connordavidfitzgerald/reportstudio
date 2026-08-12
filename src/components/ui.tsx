import { useState, type ReactNode } from 'react'

/**
 * The black label chip: Review Bold, uppercase, white on black, 16px / 100%
 * line-height. Shared by section titles, the page title and the artboards label.
 */
export const labelClass =
  'block w-fit font-display uppercase text-md leading-none text-black px-2 py-1'

/** Smaller chip for nested sub-sections (e.g. Header/Text inside Content). */
export const subLabelClass =
  'block w-fit font-display text-sm  leading-none text-black px-2.5 py-1'

export function Section({
  title,
  children,
  collapsible = false,
  defaultOpen = false,
  action,
  sub = false,
  open,
  onOpenChange,
}: {
  title: string
  children: ReactNode
  collapsible?: boolean
  defaultOpen?: boolean
  /** Optional control rendered across from the title (e.g. a "Clear" button). */
  action?: ReactNode
  /** Render as a nested sub-section (smaller chip), e.g. inside another Section. */
  sub?: boolean
  /** Controlled open state. When provided, the parent owns open/closed. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const isOpen = open ?? internalOpen
  const toggle = () => {
    const next = !isOpen
    if (open === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }
  const chip = sub ? subLabelClass : labelClass
  const header = collapsible ? (
    <button type="button" onClick={toggle} className={`${chip} flex items-center gap-2`}>
      <span>{title}</span>
      <Chevron open={isOpen} />
    </button>
  ) : (
    <h2 className={chip}>{title}</h2>
  )
  const shown = !collapsible || isOpen
  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between">
        {header}
        {shown && action}
      </div>
      {shown && (
        <div className={`flex flex-col gap-2 ${sub ? 'pt-1.5' : 'p-2'}`}>{children}</div>
      )}
    </section>
  )
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-2 px-1">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 border border-black px-[10px] py-[7px] text-xs font-bold transition ${
            value === o.value
              ? 'bg-black text-white'
              : 'bg-white text-black hover:bg-black/5'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Input-style drawer label (matches the TextField label). */
const drawerLabelClass = 'font-review uppercase text-xs text-black pb-1.5 py-0.5'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M3 4.5 6 7.5 9 4.5" />
    </svg>
  )
}

/** A labelled, collapsible drawer around arbitrary children (hidden by default). */
export function Drawer({
  label,
  children,
  defaultOpen = false,
  padded = false,
}: {
  label: string
  children: ReactNode
  defaultOpen?: boolean
  /** Inset the children by px-1, matching the Segmented controls' gutter. */
  padded?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between ${drawerLabelClass}`}
      >
        <span>{label}</span>
        <Chevron open={open} />
      </button>
      {open && (
        <div className={`flex flex-col gap-2 ${padded ? 'px-1' : ''}`}>{children}</div>
      )}
    </div>
  )
}

/**
 * A labelled Segmented control. Collapsible by default (label row toggles a down
 * chevron); pass `collapsible={false}` to keep the buttons always visible.
 */
export function SegmentedDrawer<T extends string>({
  label,
  value,
  options,
  onChange,
  collapsible = true,
}: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (v: T) => void
  collapsible?: boolean
}) {
  const [open, setOpen] = useState(false)
  const segmented = <Segmented value={value} options={options} onChange={onChange} />
  if (!collapsible) {
    return (
      <div className="flex flex-col gap-1">
        <div className={drawerLabelClass}>{label}</div>
        {segmented}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center justify-between ${drawerLabelClass}`}
      >
        <span>{label}</span>
        <Chevron open={open} />
      </button>
      {open && segmented}
    </div>
  )
}

/** A labelled grid of icon buttons acting as a single-choice selector. */
export function IconChoice<T extends string>({
  label,
  value,
  options,
  onChange,
  cols = 3,
}: {
  label?: string
  value: T
  options: { value: T; icon: ReactNode; title?: string }[]
  onChange: (v: T) => void
  cols?: number
}) {
  return (
    <div className="flex flex-col gap-1 px-1">
      {label && <div className={drawerLabelClass}>{label}</div>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            title={o.title}
            onClick={() => onChange(o.value)}
            className={`flex items-center justify-center border border-black py-[7px] transition ${
              value === o.value ? 'bg-black text-white' : 'bg-white text-black hover:bg-black/5'
            }`}
          >
            {o.icon}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label className="block mt-0.5">
      <div className="flex justify-between text-xs px-1 font-mono uppercase text-black">
        <span>{label}</span>
        <span className="">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider w-full px-1"
      />
    </label>
  )
}

export function TextField({
  label,
  value,
  onChange,
  multiline,
  rows = 3,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  multiline?: boolean
  rows?: number
}) {
  const cls =
    'w-full border border-black bg-white px-2 py-2 text-sm leading-tight text-black font-medium outline-none focus:ring-1 focus:ring-black'
  return (
    <label className="block px-1">
      {label && <div className="py-1 font-review uppercase text-xs text-black">{label}</div>}
      {multiline ? (
        <textarea
          value={value}
          rows={rows}
          onChange={(e) => onChange(e.target.value)}
          className={cls + ' resize-none'}
        />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  )
}
