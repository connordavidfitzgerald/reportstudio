import { useEffect, useLayoutEffect, useRef } from 'react'
import {
  PAD_RATIO,
  SECONDARY_TRACKING,
  TEXT_COLOR,
} from '../core/config/constants'
import { HEADER_FONT, SECONDARY_FONT } from '../core/config/fonts'
import type { TextElement } from '../doc/types'
import type { Placed } from '../render/layoutPage'
import { useDeck } from '../store/useDeck'

/**
 * The click-to-type editor: a `<textarea>` positioned exactly over the element
 * being edited, mirroring the canvas' metrics.
 *
 * A caret/selection engine drawn on canvas was rejected. `text/measure.ts`
 * already yields per-grapheme boxes, so caret *placement* is the easy part —
 * the hard part is IME composition (this client writes French), platform
 * word-jump and delete semantics, clipboard, spellcheck, double- and
 * triple-click selection, drag-select autoscroll, screen readers and mobile
 * keyboards. A textarea gets all of that from the browser.
 *
 * While it is mounted the canvas still paints this element's *background* — the
 * fitted badge or notched outline — but not its glyphs (see `env.editingId`).
 * Drawing the real background rather than an approximation is what makes
 * committing an edit produce no visible jump.
 */
export function TextEditor({
  placed,
  pageId,
  canvas,
  shortEdge,
}: {
  placed: Placed
  pageId: string
  canvas: HTMLCanvasElement | null
  shortEdge: number
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const setElement = useDeck((s) => s.setElement)
  const endEdit = useDeck((s) => s.endEdit)

  const el = placed.el as TextElement
  const layout = placed.text!

  // Page pixels → CSS pixels. The canvas is CSS-downscaled, so everything the
  // textarea sets has to be scaled by the same factor or the metrics diverge.
  const rect = canvas?.getBoundingClientRect()
  const viewScale = rect && canvas ? rect.width / canvas.width : 1

  const isHeader = el.variant === 'header'
  const font = isHeader ? HEADER_FONT : SECONDARY_FONT
  const pad = shortEdge * PAD_RATIO
  const tracking = isHeader ? 0 : layout.size * SECONDARY_TRACKING

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [])

  // Commit on Escape; Enter always inserts a newline and never exits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        endEdit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [endEdit])

  return (
    <textarea
      ref={ref}
      // Uncontrolled on purpose: writing `value` back on every keystroke breaks
      // IME composition and macOS autocorrect.
      defaultValue={el.text}
      onInput={(e) =>
        setElement(pageId, el.id, { text: e.currentTarget.value }, `text:${el.id}`)
      }
      onBlur={endEdit}
      spellCheck={false}
      style={{
        position: 'absolute',
        left: placed.cellRect.x * viewScale,
        top: placed.rect.y * viewScale,
        width: placed.cellRect.w * viewScale,
        height: Math.max(layout.height, layout.lineAdvance) * viewScale,
        margin: 0,
        border: 0,
        outline: 0,
        resize: 'none',
        overflow: 'hidden',
        background: 'transparent',
        color: TEXT_COLOR,
        caretColor: '#000',
        // Canvas `ctx.letterSpacing` and CSS `letter-spacing` are the same px
        // unit against the same text engine, so widths agree.
        fontFamily: `"${font.family}", ${font.fallback}`,
        fontWeight: font.weight,
        fontSize: layout.size * viewScale,
        letterSpacing: tracking * viewScale,
        lineHeight: `${layout.lineAdvance * viewScale}px`,
        padding: `${pad * viewScale}px`,
        textAlign: el.align,
        textTransform: isHeader ? 'uppercase' : 'none',
        // Match the canvas wrapper: greedy, by word, no hyphenation.
        whiteSpace: 'pre-wrap',
        overflowWrap: 'normal',
        wordBreak: 'normal',
        hyphens: 'none',
      }}
    />
  )
}
