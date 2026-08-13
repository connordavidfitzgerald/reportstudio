import { useEffect, useLayoutEffect, useRef } from 'react'
import { fontFor, variantFor } from '../config/fonts'
import type { Block } from '../doc/blocks'
import { setLang as setLocalized, t, type LocalizedText } from '../doc/localized'
import { activeAt, markKey, marksAt, remapMarks, toggleFlag, withMarks } from '../doc/marks'
import type { FieldPath, TextRegion } from '../render/compose'
import { useDeck } from '../store/useDeck'

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
 * ## What it is not
 *
 * It is not a canvas text engine. Two places can still drift by a pixel or so:
 * a line whose wrap point falls within a hair of the measure, and the vertical
 * centring of the caret inside a very tight line box. The canvas is always the
 * truth — if the two disagree, what you see painted is what exports.
 *
 * Fields holding numbers rather than words — a bar's value, a contents folio —
 * have no region and stay in the side panel, where they can be validated.
 */

/** Read the `LocalizedText` a region points at. */
function readAt(block: Block, path: FieldPath): LocalizedText | undefined {
  let node: unknown = block
  for (const key of path) {
    if (node === null || node === undefined) return undefined
    node = (node as Record<string | number, unknown>)[key]
  }
  return node as LocalizedText | undefined
}

/**
 * A patch that replaces the value at `path`, copying every container on the way.
 *
 * Returns only the block's *top-level* field, because that is what `updateBlock`
 * merges — so editing `['rows', 2, 'term']` produces `{ rows: [...] }` with one
 * new row and the rest shared.
 */
function patchAt(block: Block, path: FieldPath, value: LocalizedText): Partial<Block> {
  const clone = (node: unknown, at: number): unknown => {
    if (at === path.length) return value
    const key = path[at]
    if (Array.isArray(node)) {
      return node.map((item, i) => (i === key ? clone(item, at + 1) : item))
    }
    const obj = (node ?? {}) as Record<string | number, unknown>
    return { ...obj, [key]: clone(obj[key], at + 1) }
  }
  const next = clone(block, 0) as Record<string | number, unknown>
  return { [path[0]]: next[path[0]] } as Partial<Block>
}

export function InlineEditor({
  block,
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
  const lang = useDeck((s) => s.deck.lang)
  const updateBlock = useDeck((s) => s.updateBlock)
  const setSelection = useDeck((s) => s.setSelection)
  const ref = useRef<HTMLTextAreaElement>(null)

  /** Publish what is selected, so the toolbar above the page can act on it. */
  const report = () => {
    const el = ref.current
    if (el) setSelection(el.selectionStart, el.selectionEnd)
  }

  const { rect, style, indent, path } = region
  const value = t(readAt(block, path), lang)
  const key = markKey(path)
  const marks = marksAt(block.marks, key, lang)
  /** Identifies the field, so focus is taken once per field and not per keystroke. */
  const field = `${block.id}.${path.join('.')}`

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus({ preventScroll: true })
    // Caret at the end rather than a full selection: the usual reason to click
    // into a paragraph is to add to it, and select-all invites deleting it.
    el.setSelectionRange(el.value.length, el.value.length)
    setSelection(el.value.length, el.value.length)
  }, [field, setSelection])

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
  const font = fontFor(style.voice, variantFor(whole.b, whole.i))
  const pct = (v: number, of: number) => `${(v / of) * 100}%`

  return (
    <textarea
      ref={ref}
      value={value}
      spellCheck
      onChange={(e) => {
        // Text and marks in one call, so the undo snapshot holds both: an undo
        // that restored the words but not their formatting would be a state the
        // document was never actually in.
        const after = e.target.value
        const moved = remapMarks(marks ?? [], value, after)
        updateBlock(block.id, {
          ...patchAt(block, path, setLocalized(readAt(block, path), lang, after)),
          ...(moved === marks ? {} : { marks: withMarks(block.marks, key, lang, moved) }),
        })
      }}
      onKeyDown={(e) => {
        // ⌘B / ⌘I / ⌘U are handled here rather than on the window, because
        // `App.tsx`'s global listener deliberately keeps out of text fields —
        // and while the caret is on the page, this *is* the text field.
        if (!(e.metaKey || e.ctrlKey)) return
        const flag = ({ b: 'b', i: 'i', u: 'u' } as const)[e.key.toLowerCase()]
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
        left: pct(rect.x, canvas.w),
        top: pct(rect.y, canvas.h),
        width: pct(rect.w, canvas.w),
        // Exactly the height the painter used, not a minimum.
        //
        // The box has to be the ink, because it is the thing you see: an
        // outline taller than the words reads as the editor disagreeing with
        // the page. It stays right as you type because the region is re-measured
        // on every repaint, so adding a line grows this to match on the same
        // frame rather than the box being sized once on the way in.
        height: pct(Math.max(rect.h, 8), canvas.h),
        fontFamily: `"${font.family}", ${font.fallback}`,
        fontWeight: font.weight,
        fontSize: `${style.size * scale}px`,
        lineHeight: style.lineHeight,
        letterSpacing: `${style.tracking * style.size * scale}px`,
        textIndent: `${indent * scale}px`,
        textAlign: style.align,
        textTransform:
          style.case === 'upper' ? 'uppercase' : style.case === 'lower' ? 'lowercase' : 'none',
        color: 'transparent',
        caretColor: '#FF669E',
        background: 'transparent',
      }}
      // No outline offset: the hover outline sits on the box edge, so an offset
      // one would jump outwards the moment you clicked in.
      className="pointer-events-auto absolute m-0 resize-none overflow-hidden border-0 p-0
        outline outline-2 outline-offset-0 outline-[#FF669E] selection:bg-[#FF669E]/25"
    />
  )
}
