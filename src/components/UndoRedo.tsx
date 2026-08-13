import { useDeck } from '../store/useDeck'
import { IconButton } from './ui'

/**
 * Visible undo, deliberately.
 *
 * Cmd+Z has worked since the first version, but only for people who already
 * know it is there. A client editing their own report needs to *see* that the
 * last thing they did can be taken back — it is what makes the destructive
 * actions (apply a template, delete a page) safe to try.
 */

/** Curved arrow; mirrored horizontally for redo. */
function UndoArrow({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 16 16"
      fill="none"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      aria-hidden
    >
      <path
        d="M2.5 5.5h7a3.5 3.5 0 0 1 0 7H6"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="square"
      />
      <path d="M5.5 2.5 2 5.5l3.5 3" stroke="currentColor" strokeWidth={1.6} strokeLinecap="square" />
    </svg>
  )
}

export function UndoRedo() {
  const past = useDeck((s) => s.history.past.length)
  const future = useDeck((s) => s.history.future.length)
  const undo = useDeck((s) => s.undo)
  const redo = useDeck((s) => s.redo)

  // Label the shortcut the way this platform writes it.
  const mod = typeof navigator !== 'undefined' && /Mac|iP/.test(navigator.userAgent) ? '⌘' : 'Ctrl+'

  return (
    <div className="flex gap-1">
      <IconButton title={`Undo (${mod}Z)`} onClick={undo} disabled={past === 0}>
        <UndoArrow />
      </IconButton>
      <IconButton title={`Redo (${mod}⇧Z)`} onClick={redo} disabled={future === 0}>
        <UndoArrow flip />
      </IconButton>
    </div>
  )
}
