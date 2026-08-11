import { useEffect } from 'react'
import { labelClass } from './core/ui'
import { Controls } from './components/Controls'
import { PageCanvas } from './components/PageCanvas'
import { PageStrip } from './components/PageStrip'
import { pruneImages, useDeck } from './store/useDeck'

/** True when a keystroke belongs to a text field and the app should keep out. */
const inField = (t: EventTarget | null): boolean => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export default function App() {
  const undo = useDeck((s) => s.undo)
  const redo = useDeck((s) => s.redo)
  const setTool = useDeck((s) => s.setTool)

  // Sweep stored uploads no page references any more, once on boot.
  useEffect(() => {
    void pruneImages()
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
      // Figma's tool keys, since the gesture model is the same.
      if (e.key === 'v') setTool('pointer')
      if (e.key === 't') setTool('text')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo, setTool])

  return (
    <div className="flex h-full">
      <aside className="flex w-[356px] shrink-0 flex-col gap-3 border-r border-black p-4">
        <span className={labelClass}>Le Hub — Decks &amp; Reports</span>
        <Controls />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="min-h-0 flex-1">
          <PageCanvas />
        </div>
        <PageStrip />
      </main>
    </div>
  )
}
