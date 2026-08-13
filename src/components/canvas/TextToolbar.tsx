import { useRef, useState, type ReactNode } from 'react'
import { BODY_SIZE, type BodySizeId } from '../../config/brand'
import type { Block } from '../../doc/blocks'
import { t } from '../../doc/localized'
import {
  activeAt,
  marksAt,
  setHref,
  toggleFlag,
  withMarks,
  type Flag,
} from '../../doc/marks'
import { hasRunStyle, supportsMarks } from '../../render/compose'
import { useCurrentLeaf, useDeck } from '../../store/useDeck'
import { COLUMN_RUNS } from '../blocks/options'
import { Dropdown, DropdownItem, Pill } from '../ui'

/**
 * What to do with the words you have selected, above the page they are on.
 *
 * It lives here rather than in the side panel because the panel is 188px away
 * from the thing it changes, and because a text control that is only reachable
 * by hunting for a row in a list is a control most people never find. Bold sits
 * next to the sentence being bolded.
 *
 * Rendered *outside* the canvas element — it is a sibling of the page, not an
 * overlay on it, so it is never clipped by the leaf's box and never scaled with
 * the spread.
 *
 * ## The focus trap
 *
 * Every button here must `preventDefault` on mousedown. The caret lives in a
 * transparent `<textarea>` over the canvas (see `InlineEditor`), and mousedown
 * moves focus by default — so without it, pressing B blurs the editor, closes
 * it, and destroys the very selection the press was about. The editor's own
 * `onBlur` also ignores blurs into `[data-text-toolbar]`, which is the other
 * half of the same problem.
 */

/** The plain text of the field the caret is in, by its dotted path. */
function fieldText(block: Block, path: string, lang: 'en' | 'fr'): string {
  let node: unknown = block
  for (const key of path.split('.')) {
    if (node === null || node === undefined) return ''
    node = (node as Record<string, unknown>)[key]
  }
  return t(node as never, lang)
}

/** The 11px label that names a group of controls. */
function Label({ children }: { children: ReactNode }) {
  return <span className="shrink-0 text-2xs leading-none text-ink">{children}</span>
}

/**
 * A labelled value that opens a menu — the same pair the page panel uses.
 *
 * These were buttons that cycled on each press, which is fine for two states
 * and poor for four: you cannot see what the options are, and reaching the one
 * you want means passing through the ones you don't, each of which repaints the
 * page. A menu shows the set and costs one commit.
 *
 * `boundary` is the whole row rather than the menu, so pressing the pill again
 * closes it instead of dismissing and immediately reopening.
 */
function Choice({
  label,
  value,
  disabled,
  title,
  children,
}: {
  label: string
  value: string
  disabled?: boolean
  title?: string
  children: (close: () => void) => ReactNode
}) {
  const [open, setOpen] = useState(false)
  const row = useRef<HTMLDivElement>(null)
  return (
    <div ref={row} className="flex shrink-0 items-center gap-2.5">
      <Label>{label}</Label>
      {/*
        The menu hangs off the pill, not off the row: positioned against the row
        it would start at the label and sit visibly left of the control it
        belongs to. The dismiss boundary stays the whole row, so pressing the
        pill again closes rather than reopens.
      */}
      <div className="relative">
        <Pill
          className="shrink-0"
          open={open}
          disabled={disabled}
          title={title}
          onClick={() => setOpen((o) => !o)}
        >
          {value}
        </Pill>
        {open && !disabled && (
          <Dropdown boundary={row} onClose={() => setOpen(false)}>
            {children(() => setOpen(false))}
          </Dropdown>
        )}
      </div>
    </div>
  )
}

function Key({
  children,
  active,
  disabled,
  title,
  onClick,
}: {
  children: ReactNode
  active?: boolean
  disabled?: boolean
  title: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-[31px] shrink-0 items-center justify-center rounded-full px-[15px]
        text-2xs leading-none transition disabled:cursor-default disabled:opacity-30
        ${active ? 'bg-ink text-card' : 'bg-control text-ink hover:bg-control/70'}`}
    >
      {children}
    </button>
  )
}

/** Which sizes a block can be set at, or none where the design decides. */
const SIZES: { value: BodySizeId; label: string }[] = [
  { value: 'xs', label: 'Small' },
  { value: 's', label: 'Normal' },
  { value: 'm', label: 'Roomy' },
  { value: 'l', label: 'Large' },
]

/**
 * Only running text carries a size of its own.
 *
 * A chapter title set two steps larger is not an editorial choice, it is a
 * different design — those sizes come from `config/brand.ts` and should keep
 * coming from there. So the control is shown and disabled rather than hidden,
 * with a `title` saying why.
 */
const sizeable = (block: Block): block is Block & { size?: BodySizeId } =>
  block.kind === 'para' || block.kind === 'band'

export function TextToolbar() {
  const leaf = useCurrentLeaf()
  const selectedBlock = useDeck((s) => s.selectedBlock)
  const updateBlock = useDeck((s) => s.updateBlock)
  const caret = useDeck((s) => s.caret)
  const lang = useDeck((s) => s.deck.lang)

  const block = leaf.blocks.find((b) => b.id === selectedBlock)
  if (!block || !hasRunStyle(leaf, block)) return null

  // Only a *range* can be marked. This model marks stored characters, so with a
  // collapsed caret there is nothing to mark — there is no "what the next
  // keystroke will be" state, deliberately, because that state is invisible and
  // survives until you notice it.
  const markable = supportsMarks(block.kind)
  const range =
    markable && caret && caret.blockId === block.id && caret.to > caret.from ? caret : null
  const text = range ? fieldText(block, range.path, lang) : ''
  const marks = range ? marksAt(block.marks, range.path, lang) : undefined
  const active = range
    ? activeAt(marks ?? [], text, range.from, range.to)
    : { b: false, i: false, u: false, href: null }

  const mark = (flag: Flag) => {
    if (!range) return
    updateBlock(block.id, {
      marks: withMarks(
        block.marks,
        range.path,
        lang,
        toggleFlag(marks ?? [], text, range.from, range.to, flag),
      ),
    })
  }

  const link = () => {
    if (!range) return
    const next = window.prompt('Link to', active.href ?? 'https://')
    if (next === null) return
    const href = next.trim()
    updateBlock(block.id, {
      marks: withMarks(
        block.marks,
        range.path,
        lang,
        setHref(marks ?? [], text, range.from, range.to, href || null),
      ),
    })
  }

  const size = sizeable(block) ? block.size : undefined
  const col = block.col ?? 0
  const span = block.span ?? 9 - col
  const run = COLUMN_RUNS.find((r) => r.col === col && r.span === span)

  return (
    <div
      data-text-toolbar
      onMouseDown={(e) => e.preventDefault()}
      className="pointer-events-auto absolute left-6 right-6 top-5 z-30 flex flex-wrap
        items-center gap-2.5"
    >
      <Label>Edit</Label>

      {/*
        Dark until words are actually selected — see the note above — and dark
        on the composed components, whose runs are already segments carrying a
        swash or a folio.
      */}
      <div className="flex shrink-0 gap-0.5">
        <Key title={markable ? "Bold — ⌘B" : "This component's type is set by the design system."} disabled={!range} active={active.b} onClick={() => mark('b')}>
          <span className="font-semibold">B</span>
        </Key>
        <Key title={markable ? "Italic — ⌘I" : "This component's type is set by the design system."} disabled={!range} active={active.i} onClick={() => mark('i')}>
          <span className="italic">I</span>
        </Key>
        <Key title={markable ? "Underline — ⌘U" : "This component's type is set by the design system."} disabled={!range} active={active.u} onClick={() => mark('u')}>
          <span className="underline">U</span>
        </Key>
        <Key title={markable ? 'Link' : "This component's type is set by the design system."} disabled={!range} active={!!active.href} onClick={link}>
          Link
        </Key>
      </div>

      <Choice label="Font" value={(block.voice ?? 'text') === 'display' ? 'Display' : 'Regular'}>
        {(close) =>
          (['text', 'display'] as const).map((voice) => (
            <DropdownItem
              key={voice}
              current={(block.voice ?? 'text') === voice}
              onClick={() => {
                updateBlock(block.id, { voice })
                close()
              }}
            >
              {voice === 'display' ? 'Display' : 'Regular'}
            </DropdownItem>
          ))
        }
      </Choice>

      <Choice
        label="Size"
        value={SIZES.find((o) => o.value === (size ?? leaf.bodySize))?.label ?? 'Normal'}
        disabled={!sizeable(block)}
        title={
          sizeable(block)
            ? `Running text on this component${size ? `, at ${BODY_SIZE[size]}pt` : ', as the page is set'}`
            : 'This component takes its size from the design system, not the page.'
        }
      >
        {(close) =>
          SIZES.map((option) => (
            <DropdownItem
              key={option.value}
              current={(size ?? leaf.bodySize) === option.value}
              onClick={() => {
                updateBlock(block.id, { size: option.value } as Partial<Block>)
                close()
              }}
            >
              {option.label} · {BODY_SIZE[option.value]}pt
            </DropdownItem>
          ))
        }
      </Choice>

      <Choice label="Width/Position" value={run?.label ?? `Columns ${col + 1}–${col + span}`}>
        {(close) =>
          COLUMN_RUNS.map((option) => (
            <DropdownItem
              key={option.id}
              current={run?.id === option.id}
              onClick={() => {
                updateBlock(block.id, { col: option.col, span: option.span })
                close()
              }}
            >
              {option.label}
            </DropdownItem>
          ))
        }
      </Choice>

    </div>
  )
}
