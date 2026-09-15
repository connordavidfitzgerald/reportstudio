import { useEffect, useRef, useState } from 'react'
import { DEFAULT_NAME } from '../../store/library'
import { useDeck } from '../../store/useDeck'

/**
 * What this document is called.
 *
 * The name has been part of the document since the library existed — it is the
 * row you pick in Documents and the filename you get out of Export — and until
 * now the only way to set it was to not: `createDeck` supplied "Untitled
 * report" and nothing could ever say otherwise. So this, at the head of the
 * panel, where the document as a whole is already what the controls are about.
 *
 * ## Why it holds its own text
 *
 * Every mutator on `useDeck` snapshots the whole document onto the undo stack,
 * so calling `setName` per keystroke would make undo a character-by-character
 * rewind of a rename. The field is uncontrolled between focus and blur for the
 * same reason a drag writes once on drop: one edit, one undo. Enter commits and
 * blurs, Escape puts the committed name back.
 *
 * The blank name is left blank rather than written as "Untitled report": the
 * placeholder says what the library will call it, and storing that literally
 * would mean a document that had been named once could never be un-named.
 */
export function DocumentName() {
  const name = useDeck((s) => s.deck.name ?? '')
  const docId = useDeck((s) => s.docId)
  const setName = useDeck((s) => s.setName)

  const [draft, setDraft] = useState(name)
  const editing = useRef(false)

  // Follow the document — opening another one, or undoing a rename, has to show
  // up here — but never yank the field out from under someone mid-type.
  useEffect(() => {
    if (!editing.current) setDraft(name)
  }, [name, docId])

  const commit = () => {
    editing.current = false
    const next = draft.trim()
    setDraft(next)
    if (next !== name) setName(next)
  }

  return (
    <input
      value={draft}
      placeholder={DEFAULT_NAME}
      aria-label="Document name"
      title="The name of this document, in Documents and in the exported filename"
      onFocus={() => {
        editing.current = true
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          editing.current = false
          setDraft(name)
          e.currentTarget.blur()
        }
      }}
      className="-mx-1 w-[calc(100%+0.5rem)] truncate rounded-lg bg-transparent px-1 py-0.5 text-xs leading-none text-ink outline-none transition placeholder:text-dim hover:bg-control focus:bg-control"
    />
  )
}
