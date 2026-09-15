import { useEffect, useState } from 'react'
import { Button, Card } from './components/ui'
import { ConfirmHost } from './components/ConfirmHost'
import { SpreadCanvas } from './components/SpreadCanvas'
import { PagesBar } from './components/canvas/PagesBar'
import { Panel } from './components/panel/Panel'
import { PagesCard } from './components/panel/PagesCard'
import { evictImageCache } from './doc/imageStore'
import { bootstrap, flushOnHide, hasCopiedBlock, useDeck, type BootstrapResult } from './store/useDeck'
import { LocalImportDialog } from './components/LocalImportDialog'
import { isNetworkError } from './store/library'
import { useUi } from './store/useUi'
import { overlayOpen } from './hooks/useDismiss'

/** True when a keystroke belongs to a text field and the app should keep out. */
const inField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export default function App() {
  // `null` while the first load is in flight, `false` when it failed. A failure
  // has to be its own state: the alternative is showing an empty editor to
  // somebody whose reports merely could not be reached, which looks exactly
  // like having lost them.
  const [ready, setReady] = useState<boolean | null>(null)
  // What went wrong, in the server's own words. Kept beside `ready` rather than
  // folded into it: the card below needs to say *which* failure this was.
  const [failure, setFailure] = useState<string | null>(null)
  const undo = useDeck((s) => s.undo)
  const redo = useDeck((s) => s.redo)
  const selectLeaf = useDeck((s) => s.selectLeaf)
  const removeBlock = useDeck((s) => s.removeBlock)
  const duplicateBlock = useDeck((s) => s.duplicateBlock)
  const moveBlock = useDeck((s) => s.moveBlock)
  const selectBlock = useDeck((s) => s.selectBlock)
  const requestEdit = useDeck((s) => s.requestEdit)
  const copyBlock = useDeck((s) => s.copyBlock)
  const pasteBlock = useDeck((s) => s.pasteBlock)
  const panelOpen = useUi((s) => s.panelOpen)
  const setPanelOpen = useUi((s) => s.setPanelOpen)

  // Open whatever was last being worked on, and trim the local image cache.
  //
  // The cache trim replaces what used to be a reference-counted sweep across
  // every saved report. That sweep can't be right any more — the documents are
  // on a server and the client can't see all of them at once — and being wrong
  // meant deleting photographs for good. Evicting a *cache* by age and size
  // needs no such knowledge and costs a re-download at worst.
  // One place to land a bootstrap result, used by the first load and by `retry`.
  const settle = (result: BootstrapResult) => {
    setReady(result.ok)
    setFailure(result.ok ? null : result.error)
    // Also to the console: the card has room for one sentence, and whoever is
    // debugging this wants the whole thing.
    if (!result.ok) console.error('[reportstudio] first load failed:', result.error)
  }

  useEffect(() => {
    void bootstrap().then(settle)
    void evictImageCache()
    return flushOnHide()
  }, [])

  const retry = () => {
    setReady(null)
    setFailure(null)
    void bootstrap().then(settle)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inField(e.target)) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }

      // The grid. Not guarded by `overlayOpen` below: looking at the columns is
      // not an edit, and wanting to see them while a dialog happens to be up is
      // not a reason to refuse.
      if ((e.metaKey || e.ctrlKey) && e.key === "'") {
        e.preventDefault()
        useUi.getState().toggleGrid()
        return
      }

      // The two shortcuts that replaced buttons on the old element toolbar.
      // They take a modifier because the plain keys belong to the page: ⌥ with
      // an arrow so that the unmodified arrows keep turning pages.
      if (e.metaKey || e.ctrlKey) {
        // Paste needs no selection: it lands at the armed insert point, or at
        // the foot of the page. It is also the only way to move a component
        // between two *documents*.
        if (e.key.toLowerCase() === 'v' && hasCopiedBlock()) {
          e.preventDefault()
          pasteBlock()
          return
        }
        const selected = useDeck.getState().selectedBlock
        if (!selected) return
        if (e.key.toLowerCase() === 'd') {
          e.preventDefault()
          duplicateBlock(selected)
          return
        }
        if (e.key.toLowerCase() === 'c') {
          copyBlock(selected)
          return
        }
        if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
          e.preventDefault()
          moveBlock(selected, e.key === 'ArrowUp' ? -1 : 1)
          return
        }
        return
      }
      if (e.altKey) return
      // Nothing below acts on the document while a dialog or menu is over it.
      if (overlayOpen()) return

      const { leafIndex, selectedBlock, deck } = useDeck.getState()

      // Delete the selected component. `inField` above is what makes this safe:
      // while the caret is on the page it is in a textarea, so Backspace is
      // deleting a character there and never reaches this.
      if ((e.key === 'Backspace' || e.key === 'Delete') && selectedBlock) {
        e.preventDefault()
        removeBlock(selectedBlock)
        return
      }

      // Nothing selected, and nothing being typed. The page is the thing that
      // has focus, so Escape gives it back.
      if (e.key === 'Escape' && selectedBlock) {
        e.preventDefault()
        selectBlock(null)
        return
      }

      // Walk the page. Tab is what every other editor uses for "the next thing",
      // and with nothing selected it selects the first — which is also the
      // shortest route from a freshly-opened page to typing on it.
      if (e.key === 'Tab') {
        const blocks = deck.leaves[leafIndex]?.blocks ?? []
        if (!blocks.length) return
        e.preventDefault()
        const at = blocks.findIndex((b) => b.id === selectedBlock)
        const step = e.shiftKey ? -1 : 1
        const next = at < 0 ? (e.shiftKey ? blocks.length - 1 : 0) : at + step
        if (next >= 0 && next < blocks.length) selectBlock(blocks[next].id)
        return
      }

      // Enter starts typing in what is selected. `SpreadCanvas` owns where the
      // caret goes, so this only says which block — the same thing a second
      // click on the page says.
      if (e.key === 'Enter' && selectedBlock) {
        e.preventDefault()
        requestEdit(selectedBlock)
        return
      }

      // Turning the page, for the same reason.
      if (e.key === 'ArrowLeft') selectLeaf(leafIndex - 1)
      if (e.key === 'ArrowRight') selectLeaf(leafIndex + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    undo,
    redo,
    selectLeaf,
    removeBlock,
    duplicateBlock,
    moveBlock,
    selectBlock,
    requestEdit,
    copyBlock,
    pasteBlock,
  ])

  if (ready === null) {
    return (
      <div className="flex h-full items-center justify-center bg-ground">
        <span className="animate-[fadeIn_200ms_ease-out_250ms_both] text-2xs uppercase text-dim">
          Opening your reports…
        </span>
      </div>
    )
  }

  // Not an empty editor: an empty editor here would read as "your work is gone".
  if (ready === false) {
    return (
      <div className="flex h-full items-center justify-center bg-ground p-5">
        <Card className="w-full max-w-[360px] p-6">
          <h1 className="pb-2 text-lg leading-none text-ink">
            {isNetworkError(failure) ? 'Could not reach your reports' : 'The server refused the request'}
          </h1>
          <p className="pb-3 text-xs leading-snug text-dim">
            {isNetworkError(failure)
              ? 'Your work is on the server and is still there. This looks like a connection problem rather than anything lost.'
              : 'Your work is on the server and is still there. The server answered, but not with your reports — so this is a setup problem, not a lost document.'}
          </p>
          {failure && (
            <p className="pb-4 font-mono text-2xs leading-snug text-dim break-words">{failure}</p>
          )}
          <Button variant="primary" onClick={retry}>
            Try again
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <ConfirmHost>
      <LocalImportDialog onImported={retry} />
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
        {/*
          The stage is a column: the spread takes whatever height is left, and
          the thumbnails sit under it in a band of their own rather than
          floating over the foot of the page they are meant to help you leave.
          `min-h-0` on the canvas card is what lets it actually give way — a
          flex child defaults to its content's height and would push the strip
          off the bottom of the window instead.
        */}
        <main className="relative flex min-w-0 flex-1 flex-col gap-5">
          <Card className="min-h-0 flex-1 overflow-hidden">
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
