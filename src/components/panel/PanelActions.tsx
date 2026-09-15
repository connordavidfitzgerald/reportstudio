import { useRef, useState } from 'react'
import { useDeck } from '../../store/useDeck'
import { useUi } from '../../store/useUi'
import { DocumentsDialog } from '../DocumentsDialog'
import { ExportDialog } from '../ExportDialog'
import { Dropdown, DropdownItem } from '../ui'

/**
 * The things you can do to the document as a whole.
 *
 * They were a top bar of labelled buttons across the width of the window, which
 * is a lot of chrome for a handful of actions on a page that is mostly a page.
 * Line icons at the head of the panel, in the order the Figma has them: out,
 * list, add — with the grid alongside them, because showing the columns is a
 * view of the whole document rather than of the selected thing.
 */

const HIT = 'flex h-6 w-6 items-center justify-center text-ink transition hover:text-dim'

export function PanelActions() {
  const addLeaf = useDeck((s) => s.addLeaf)
  const addSpread = useDeck((s) => s.addSpread)
  const [adding, setAdding] = useState(false)
  const plus = useRef<HTMLDivElement>(null)
  const gridOpen = useUi((s) => s.gridOpen)
  const toggleGrid = useUi((s) => s.toggleGrid)
  const [dialog, setDialog] = useState<'documents' | 'export' | null>(null)

  return (
    <div className="flex items-center justify-between">
      <button
        type="button"
        title="Export a PDF"
        aria-label="Export a PDF"
        onClick={() => setDialog('export')}
        className={HIT}
      >
        <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden>
          <path d="M2 20 20 2M7 2h13v13" stroke="currentColor" strokeWidth={1.5} />
        </svg>
      </button>

      <button
        type="button"
        title="Documents"
        aria-label="Documents"
        onClick={() => setDialog('documents')}
        className={HIT}
      >
        <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden>
          <path d="M2 6h18M2 11h18M2 16h18" stroke="currentColor" strokeWidth={1.5} />
        </svg>
      </button>

      <button
        type="button"
        title="Show the grid — ⌘'"
        aria-label="Show the grid"
        aria-pressed={gridOpen}
        onClick={toggleGrid}
        className={gridOpen ? HIT.replace('text-ink', 'text-select') : HIT}
      >
        <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden>
          <path d="M2 2h18v18H2zM8 2v18M14 2v18M2 8h18M2 14h18" stroke="currentColor" strokeWidth={1.5} />
        </svg>
      </button>

      {/*
        The plus used to add two facing pages and nothing else, which meant the
        most common thing anyone wants to make — a new page, a new report — was
        either a surprise or somewhere else entirely. It asks now.
      */}
      <div ref={plus} className="relative">
        <button
          type="button"
          title="Add"
          aria-label="Add"
          aria-expanded={adding}
          onClick={() => setAdding((a) => !a)}
          className={HIT}
        >
          <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden>
            <path d="M11 2v18M2 11h18" stroke="currentColor" strokeWidth={1.5} />
          </svg>
        </button>

        {adding && (
          <Dropdown boundary={plus} align="right" onClose={() => setAdding(false)}>
            <DropdownItem
              onClick={() => {
                addLeaf()
                setAdding(false)
              }}
            >
              New page
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                addSpread()
                setAdding(false)
              }}
            >
              Two facing pages
            </DropdownItem>
            <DropdownItem
              onClick={() => {
                setAdding(false)
                setDialog('documents')
              }}
            >
              New document
            </DropdownItem>
          </Dropdown>
        )}
      </div>

      {dialog === 'documents' && <DocumentsDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
    </div>
  )
}
