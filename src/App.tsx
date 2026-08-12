import { useEffect } from 'react'
import { Inspector } from './components/Inspector'
import { SpreadCanvas } from './components/SpreadCanvas'
import { SpreadStrip } from './components/SpreadStrip'
import { pruneImageBlobs } from './doc/imageStore'
import { collectBlobIds } from './doc/imageCache'
import { restoreSession, useDeck } from './store/useDeck'

/** True when a keystroke belongs to a text field and the app should keep out. */
const inField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export default function App() {
  const undo = useDeck((s) => s.undo)
  const redo = useDeck((s) => s.redo)

  // Restore the last session, then sweep uploads nothing references any more.
  useEffect(() => {
    void restoreSession().then(() => pruneImageBlobs(collectBlobIds(useDeck.getState().deck)))
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  return (
    <div className="flex h-full">
      <aside className="flex w-[320px] shrink-0 flex-col gap-3 border-r border-black p-3">
        <Inspector />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <SpreadCanvas />
        </div>
        <SpreadStrip />
      </main>
    </div>
  )
}
