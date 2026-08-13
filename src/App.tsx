import { useEffect } from 'react'
import { Card } from './components/ui'
import { ConfirmHost } from './components/ConfirmHost'
import { SpreadCanvas } from './components/SpreadCanvas'
import { PagesBar } from './components/canvas/PagesBar'
import { Panel } from './components/panel/Panel'
import { PagesCard } from './components/panel/PagesCard'
import { pruneImageBlobs } from './doc/imageStore'
import { collectBlobIds } from './doc/imageCache'
import { collectLibraryBlobIds } from './store/library'
import { bootstrap, flushOnHide, useDeck } from './store/useDeck'
import { useUi } from './store/useUi'
import { overlayOpen } from './hooks/useDismiss'

/** True when a keystroke belongs to a text field and the app should keep out. */
const inField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export default function App() {
  const undo = useDeck((s) => s.undo)
  const redo = useDeck((s) => s.redo)
  const selectLeaf = useDeck((s) => s.selectLeaf)
  const removeBlock = useDeck((s) => s.removeBlock)
  const panelOpen = useUi((s) => s.panelOpen)
  const setPanelOpen = useUi((s) => s.setPanelOpen)

  // Open whatever was last being worked on, then sweep uploads that no saved
  // report points at any more. The keep-set spans the whole library plus the
  // open document — the latter because a document imported seconds ago may not
  // have been written yet, and its images would be swept before it was saved.
  useEffect(() => {
    void bootstrap()
      .then(collectLibraryBlobIds)
      .then((ids) => pruneImageBlobs([...ids, ...collectBlobIds(useDeck.getState().deck)]))
    return flushOnHide()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      // Nothing below acts on the document while a dialog or menu is over it.
      if (overlayOpen()) return

      const { leafIndex, selectedBlock } = useDeck.getState()

      // Delete the selected component. `inField` above is what makes this safe:
      // while the caret is on the page it is in a textarea, so Backspace is
      // deleting a character there and never reaches this.
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedBlock) {
        e.preventDefault()
        removeBlock(selectedBlock)
        return
      }

      // Turning the page, for the same reason.
      if (e.key === 'ArrowLeft') selectLeaf(leafIndex - 1)
      if (e.key === 'ArrowRight') selectLeaf(leafIndex + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, selectLeaf, removeBlock])

  return (
    <ConfirmHost>
      {/*
        Two floating cards on a light ground, as the Figma has it: the panel
        column at a fixed 228, the stage taking the rest. Nothing is flush with
        the window — the 20px gutter is the design, not padding that can be
        dropped when space is tight.
      */}
      <div className="relative flex h-full gap-5 bg-ground p-5">
        {/*
          Below `lg` the panel slides over the stage rather than taking a
          column: 228 out of a 700px window is a third of the thing you came to
          look at. Above it, `panelOpen` is ignored and the panel is simply
          there.
        */}
        <aside
          className={`z-40 w-[228px] shrink-0 flex-col gap-2 max-lg:absolute max-lg:inset-y-5
            max-lg:left-5 lg:flex ${panelOpen ? 'flex' : 'hidden'}`}
        >
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Panel />
          </Card>
          <PagesCard />
        </aside>
        <main className="relative min-w-0 flex-1">
          <Card className="h-full overflow-hidden">
            <SpreadCanvas />
          </Card>
          <PagesBar />
          <button
            type="button"
            title={panelOpen ? 'Hide the panel' : 'Show the panel'}
            onClick={() => setPanelOpen(!panelOpen)}
            className="absolute right-5 top-5 z-50 flex h-8 w-8 items-center justify-center
              rounded-full bg-control text-ink transition hover:bg-control/70 lg:hidden"
          >
            {panelOpen ? '‹' : '›'}
          </button>
        </main>
      </div>
    </ConfirmHost>
  )
}
