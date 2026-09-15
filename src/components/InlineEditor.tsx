import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Block } from '../doc/blocks'
import { setLang as setLocalized, t, type LocalizedText } from '../doc/localized'
import { activeAt, markKey, marksAt, remapMarks, toggleFlag, withMarks } from '../doc/marks'
import { rowAt, rowCount, rowEmpty, rowPath, withRowAfter, withoutRow } from '../doc/rows'
import { patchAt, pathOf, readAt } from '../doc/fieldValue'
import type { TextRegion } from '../render/compose'
import { useDeck } from '../store/useDeck'
import { overlayStyle } from './canvas/textOverlay'

/**
 * Typing on the page.
 *
 * ## How it works
 *
 * The page is a canvas, and a canvas has no caret and no text selection. So the
 * words you see are still the canvas's — painted by the real compositor, at the
 * real size, with the real tracking, wrapping and swashes — and this is an
 * invisible `<textarea>` laid exactly on top of them: transparent text, visible
 * caret. You type into the textarea, the store updates, and the canvas repaints
 * underneath on the same frame. The result is that the type you are editing is
 * the type that will print, rather than a preview of it.
 *
 * The alignment holds because the box and the style both come from the painter
 * itself: every run of words reports a {@link TextRegion} as it is drawn (see
 * `mark` in `render/compose.ts`), carrying the rect it landed in and the style
 * it was set in. There is no second layout pass guessing where the text went,
 * so a design change cannot move the caret away from the glyphs.
 *
 * ## Where the caret starts, and what Return does
 *
 * Two things that are the browser's job inside an ordinary text field have to
 * be done by hand here, because the words being clicked are pixels on a canvas
 * and the textarea only arrives afterwards:
 *
 *   - **the character you clicked.** The hit layer resolves it before opening
 *     the editor — see `offsetFromPoint` in `canvas/textOverlay.ts` — and passes
 *     it in through the caret in the store, which this reads once, on the way
 *     in. Every other caller of `setCaret` gets to say the same thing: Tab into
 *     a table cell selects it, Return on a selected component takes the whole
 *     field.
 *   - **what Return means.** Only in a run the painter actually wraps is it a
 *     line break. Elsewhere — a credit, a bar's label — the page has no second
 *     line to give, so a newline would live in the editor alone and every
 *     character after it would be typed a line away from its glyph. There
 *     Return moves on instead: to the next field of the row, to a new row, or
 *     out. See {@link TextRegion.multiline}, which `check:editing` makes prove
 *     itself against the painters.
 *
 * ## What it is not
 *
 * It is not a canvas text engine. Three places can still drift: a line whose
 * wrap point falls within a hair of the measure, the vertical centring of the
 * caret inside a very tight line box, and the second paragraph of an indented
 * run — the compositor indents the opening line of *each* paragraph, and CSS
 * only knows how to indent the first. The canvas is always the truth — if the
 * two disagree, what you see painted is what exports.
 *
 * A region marked `numeric` points at a plain `number` rather than at words —
 * a bar's value. It is read and written here as one; see the draft state in
 * the component below for why it cannot simply be coerced on every keystroke.
 */

export function InlineEditor({
  block: painted,
  region,
  /** CSS pixels per design point, from the canvas's displayed size. */
  scale,
  /** Backing-store size of the canvas, for the percentage geometry. */
  canvas,
  onClose,
}: {
  block: Block
  region: TextRegion
  scale: number
  canvas: { w: number; h: number }
  onClose: () => void
}) {
  /**
   * The block as the *document* has it, not as the page last painted it.
   *
   * The caller can only offer the painted one: it comes out of the compositor
   * along with the rect this overlay is laid on, and that is state set in an
   * effect *after* the render that changed the text. One render behind is
   * nothing for a box, and fatal for a value — a controlled textarea whose
   * `value` prop is momentarily the text as it was before the keystroke gets
   * that text written back into the DOM, and a browser handed a new value for a
   * textarea puts the caret at the end of it. So the character went in, the
   * caret jumped to the end of the field, and the next one was typed there.
   *
   * Only the text is taken from here. The geometry stays with the paint, which
   * is the only thing that knows where the words actually landed.
   */
  const block = useDeck((s) => s.deck.leaves[s.leafIndex]?.blocks.find((b) => b.id === painted.id)) ?? painted
  const lang = useDeck((s) => s.deck.lang)
  const updateBlock = useDeck((s) => s.updateBlock)
  const setSelection = useDeck((s) => s.setSelection)
  const setCaret = useDeck((s) => s.setCaret)
  const leafIndex = useDeck((s) => s.leafIndex)
  const ref = useRef<HTMLTextAreaElement>(null)

  /** Publish what is selected, so the toolbar above the page can act on it. */
  const report = () => {
    const el = ref.current
    if (el) setSelection(el.selectionStart, el.selectionEnd)
  }

  const { path, numeric, multiline } = region
  /**
   * Where the caret was asked for, read once per field rather than followed.
   *
   * The store's caret is written back on every selection change (the toolbar
   * above the page reads it), so an effect that *followed* it would fight the
   * pointer: you would drag a selection and have it reset under your hand. The
   * offsets are only ever consumed at the moment the field is entered, which is
   * the moment somebody else — a click, a Tab into the next cell — has an
   * opinion about where the caret goes.
   */
  const asked = useRef<{ from: number; to: number } | null>(null)
  const caret = useDeck((s) => s.caret)
  asked.current = caret ? { from: caret.from, to: caret.to } : null

  /**
   * A half-typed number.
   *
   * The field stores a `number`, but the states a person passes through on the
   * way to one — `''`, `'1.'`, `'-'` — are not numbers, and coercing each
   * keystroke would mean backspacing the last digit of `40` silently wrote `0`
   * and then refused to let you clear it. So the text is held here while it is
   * being typed, and the document only hears about it when it parses.
   *
   * Null for every ordinary field, which is almost all of them: their text
   * *is* what is stored, and a second copy of it here could drift.
   */
  const [draft, setDraft] = useState<string | null>(null)

  const stored = readAt(block, path)
  const value = numeric ? (draft ?? String(stored ?? '')) : t(stored as LocalizedText, lang)
  const key = markKey(path)
  const marks = numeric ? undefined : marksAt(block.marks, key, lang)
  /** Identifies the field, so focus is taken once per field and not per keystroke. */
  const field = `${block.id}.${path.join('.')}`

  useLayoutEffect(() => {
    setDraft(null)
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    // Where the click landed, clamped to the text — or the end of it, which is
    // what the callers that have no opinion (Return opening a new row) ask for
    // and what a click past the last character resolves to anyway.
    const end = el.value.length
    const at = asked.current
    const from = Math.max(0, Math.min(end, at?.from ?? end))
    const to = Math.max(from, Math.min(end, at?.to ?? from))
    el.setSelectionRange(from, to)
    setSelection(from, to)
  }, [field, setSelection])

  /**
   * Never let the box scroll inside itself.
   *
   * The overlay is sized to the ink, and a browser will happily scroll a
   * textarea whose content is a line taller than its box to keep the caret in
   * view — at which point every character in it is drawn some number of pixels
   * above the glyphs it is supposed to be lying on, and the caret is nowhere
   * near what you are typing. Growing the box instead keeps the two in register;
   * the extra height is invisible, since the type in here is transparent.
   *
   * Runs after every render because the text changes under it: one more word
   * can add a line, and one fewer can take it away again.
   */
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Re-stated in pixels on every render rather than left to the percentage in
    // the style prop: React only writes that when it changes, so a box grown to
    // fit four lines would never shrink back to three.
    const layer = el.offsetParent as HTMLElement | null
    const painted = (Math.max(region.rect.h, 8) / canvas.h) * (layer?.clientHeight ?? 0)
    el.style.height = `${painted}px`
    if (el.scrollHeight > el.clientHeight) el.style.height = `${el.scrollHeight}px`
    el.scrollTop = 0
    el.scrollLeft = 0
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])

  // Which cut to set the overlay in.
  //
  // A textarea can only be one face, and the words underneath it may be several
  // — so this is exact when the whole field agrees (select all, ⌘B) and
  // approximate when it doesn't. That matters because the *selection rectangle*
  // is drawn from these metrics: set a wholly-bold field in the roman and the
  // highlight comes out narrower than the glyphs it is supposedly covering.
  //
  // Mixed runs within one field still drift by the width difference. Fixing
  // that properly means an overlay that can hold several faces at once — a
  // contentEditable of styled spans rather than a textarea — which is a
  // different and much more delicate component.
  const whole = activeAt(marks ?? [], value, 0, value.length)

  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck
      onChange={(e) => {
        if (numeric) {
          // Digits, a dot and a leading minus. Everything else is dropped as it
          // is typed rather than rejected afterwards, so there is never a
          // character on screen that the field could not hold.
          const typed = e.target.value
          const cleaned = typed.replace(/[^0-9.-]/g, '').replace(/(?!^)-/g, '')
          // React puts the DOM value back to whatever this render produces, and
          // a browser asked to replace a textarea's value drops the caret at the
          // end of it. That is right when nothing was refused and wrong the
          // moment something was: typing a letter into the middle of `1200` sent
          // the caret to the end, so the next digit landed in the wrong place.
          if (cleaned !== typed) {
            const kept = (e.target.selectionStart ?? typed.length) - (typed.length - cleaned.length)
            const at = Math.max(0, Math.min(cleaned.length, kept))
            // After React has put the refused characters back, which it does at
            // the end of this event whether or not anything re-rendered — so a
            // layout effect is not enough: typing a letter into `40` produces no
            // state change at all, and the only sign of it is a caret that has
            // jumped to the end.
            queueMicrotask(() => ref.current?.setSelectionRange(at, at))
          }
          setDraft(cleaned)
          const n = Number(cleaned)
          if (cleaned !== '' && Number.isFinite(n)) {
            updateBlock(block.id, patchAt(block, path, n))
          }
          return
        }
        // Text and marks in one call, so the undo snapshot holds both: an undo
        // that restored the words but not their formatting would be a state the
        // document was never actually in.
        const after = e.target.value
        const moved = remapMarks(marks ?? [], value, after)
        updateBlock(block.id, {
          ...patchAt(block, path, setLocalized(readAt(block, path) as LocalizedText, lang, after)),
          ...(moved === marks ? {} : { marks: withMarks(block.marks, key, lang, moved) }),
        })
      }}
      onKeyDown={(e) => {
        // Mid-composition, Return and Backspace belong to the input method —
        // they accept a candidate and correct it. Acting on them here would
        // close the editor or delete a row out from under somebody halfway
        // through typing a word.
        if (e.nativeEvent.isComposing) return

        // A table is walked with Tab, the way every table anywhere is walked.
        // Past the last cell it opens a new row, so filling one in is a single
        // unbroken run of typing and tabbing with no trip to a panel in it.
        if (block.kind === 'table' && e.key === 'Tab' && !e.metaKey && !e.ctrlKey) {
          const [, r, c] = path as [string, number, number]
          const cols = block.widths.length
          const step = e.shiftKey ? -1 : 1
          const flat = r * cols + c + step
          if (flat < 0) return
          e.preventDefault()
          const rows = Math.floor(flat / cols)
          if (rows >= block.rows.length) {
            updateBlock(block.id, {
              rows: [...block.rows, Array.from({ length: cols }, () => '')],
            })
          }
          // Selected, not just entered. Tab through a filled row and each cell
          // comes up ready to be replaced, which is what tabbing through a table
          // is for; a caret parked at one end would mean typing appends to what
          // is already there, and that is nobody's intention on the way past.
          const cell = t(block.rows[rows]?.[flat % cols] as LocalizedText, lang)
          setCaret({
            leafIndex,
            blockId: block.id,
            path: `rows.${rows}.${flat % cols}`,
            from: 0,
            to: cell.length,
          })
          return
        }

        // Rows are added and removed on the page, with the two keys everyone
        // already uses for it. See `doc/rows.ts` for what counts as a row.
        const here = rowAt(block, path.join('.'))
        if (here && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const el = e.currentTarget
          const atEnd =
            el.selectionStart === el.selectionEnd && el.selectionStart === el.value.length
          const last = here.field === here.shape.fields.length - 1

          // Return at the end of a row's last field opens the next row; in an
          // earlier field it steps to the next one, the way Return moves down a
          // form. Anywhere else in a field the painter *wraps*, it is a line
          // break, because a definition's body is prose and breaking a line
          // inside one is a thing people do.
          //
          // In a field the painter does not wrap it can never be a line break:
          // a credit is drawn as exactly one line, so the newline would show up
          // in the editor and nowhere on the page, and every character after it
          // would be typed a line away from the glyph it belongs to. There the
          // structural move is the only reading Return has.
          if (e.key === 'Enter' && !e.shiftKey && (atEnd || !multiline)) {
            e.preventDefault()
            if (last) {
              updateBlock(block.id, withRowAfter(block, here.shape, here.index))
              setCaret({
                leafIndex,
                blockId: block.id,
                path: rowPath(here.shape, here.index + 1, 0),
                from: 0,
                to: 0,
              })
            } else {
              // On to the rest of the same row, caret at the end of whatever is
              // already written there — this is a move through a record being
              // filled in, not a replacement of it.
              const next = rowPath(here.shape, here.index, here.field + 1)
              const end = t(readAt(block, pathOf(next)) as LocalizedText, lang).length
              setCaret({ leafIndex, blockId: block.id, path: next, from: end, to: end })
            }
            return
          }

          // Backspace at the start of an empty row removes it and leaves the
          // caret on the row above — so holding the key walks back up the list
          // rather than stopping dead on each one. Never the last row: a list
          // with no rows has nothing to put a caret in, and the way to get rid
          // of the whole component is to delete the component.
          if (
            e.key === 'Backspace' &&
            el.selectionStart === 0 &&
            el.selectionEnd === 0 &&
            rowEmpty(block, here.shape, here.index, lang) &&
            rowCount(block, here.shape) > 1
          ) {
            e.preventDefault()
            updateBlock(block.id, withoutRow(block, here.shape, here.index))
            const to = Math.max(0, here.index - 1)
            setCaret({
              leafIndex,
              blockId: block.id,
              path: rowPath(here.shape, to, here.shape.fields.length - 1),
              from: 0,
              to: 0,
            })
            return
          }
        }

        // Return in a field the painter draws as one line — a bar's label, a
        // bar's value, a contents row — means "done", the way it does in any
        // single-line input. It used to insert a newline that the page could
        // not show: nothing appeared to happen, and the caret was left on a
        // second line that did not exist, which is where typing went next.
        // Shift makes no difference: there is no line to break either way.
        if (e.key === 'Enter' && !multiline && !e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          onClose()
          return
        }

        // ⌘B / ⌘I / ⌘U / ⌘⇧H are handled here rather than on the window,
        // because `App.tsx`'s global listener deliberately keeps out of text
        // fields — and while the caret is on the page, this *is* the text field.
        //
        // Highlight takes the shift because macOS keeps ⌘H for Hide Application,
        // and a formatting key that hides the editor on some machines and not
        // others is worse than an extra modifier.
        if (numeric) return
        if (!(e.metaKey || e.ctrlKey)) return
        // Not `key` — that is the field's mark key, in scope here and used below.
        const pressed = e.key.toLowerCase()
        const flag =
          pressed === 'h' ? (e.shiftKey ? 'h' : undefined) : ({ b: 'b', i: 'i', u: 'u' } as const)[pressed]
        if (!flag) return
        e.preventDefault()
        const el = e.currentTarget
        if (el.selectionStart === el.selectionEnd) return
        updateBlock(block.id, {
          marks: withMarks(
            block.marks,
            key,
            lang,
            toggleFlag(marks ?? [], value, el.selectionStart, el.selectionEnd, flag),
          ),
        })
      }}
      onSelect={report}
      onKeyUp={report}
      onMouseUp={report}
      // Losing focus *to the toolbar* is not leaving the field — pressing B has
      // to keep the caret, and the words it is holding, exactly where they are.
      onBlur={(e) => {
        if ((e.relatedTarget as HTMLElement | null)?.closest('[data-text-toolbar]')) return
        onClose()
      }}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      // One row, so an empty or single-line field doesn't inherit the two-row
      // default height a textarea otherwise has. The real height is set below.
      rows={1}
      style={{
        ...overlayStyle(region, scale, canvas, { bold: whole.b, italic: whole.i }),
        color: 'transparent',
        caretColor: 'var(--color-select)',
        background: 'transparent',
      }}
      // No outline offset: the hover outline sits on the box edge, so an offset
      // one would jump outwards the moment you clicked in.
      className="pointer-events-auto absolute m-0 resize-none overflow-hidden border-0 p-0
        outline outline-2 outline-offset-0 outline-select selection:bg-select/25"
    />
  )
}
