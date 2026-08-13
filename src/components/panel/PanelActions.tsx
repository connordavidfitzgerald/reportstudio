import { useState } from 'react'
import { useDeck } from '../../store/useDeck'
import { DocumentsDialog } from '../DocumentsDialog'
import { ExportDialog } from '../ExportDialog'

/**
 * The three things you can do to the document as a whole.
 *
 * They were a top bar of labelled buttons across the width of the window, which
 * is a lot of chrome for three actions on a page that is mostly a page. Line
 * icons at the head of the panel, in the order the Figma has them: out, list,
 * add.
 */

const HIT = 'flex h-6 w-6 items-center justify-center text-ink transition hover:text-dim'

export function PanelActions() {
  const addSpread = useDeck((s) => s.addSpread)
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

      {/* Two pages, because a spread is what gets added. */}
      <button
        type="button"
        title="Add two facing pages"
        aria-label="Add two facing pages"
        onClick={() => addSpread()}
        className={HIT}
      >
        <svg width={22} height={22} viewBox="0 0 22 22" fill="none" aria-hidden>
          <path d="M11 2v18M2 11h18" stroke="currentColor" strokeWidth={1.5} />
        </svg>
      </button>

      {dialog === 'documents' && <DocumentsDialog onClose={() => setDialog(null)} />}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
    </div>
  )
}
