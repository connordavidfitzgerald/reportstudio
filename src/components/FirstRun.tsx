import { useState } from 'react'
import { useDeck } from '../store/useDeck'

/**
 * Three sentences, once.
 *
 * The editor opens on the *Tools for Change* transcription, which is the right
 * default — the design system is visible before anyone has typed anything, and
 * every archetype is one click away to copy. But a client who opens the tool
 * and finds somebody else's finished report has no way to know whether they are
 * allowed to touch it, and the safest guess is not to.
 *
 * So say what it is, say what the three things are, and get out of the way.
 */

const KEY = 'lehub.report.firstRun.dismissed'

const read = (): boolean => {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function FirstRun() {
  const [dismissed, setDismissed] = useState(read)
  const newDocument = useDeck((s) => s.newDocument)

  if (dismissed) return null

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, '1')
    } catch {
      /* a preference we can't store just means the note comes back once */
    }
    setDismissed(true)
  }

  return (
    <div className="flex flex-col gap-2 border border-ink/25 bg-ink/5 px-2.5 py-2 text-[11px] leading-snug">
      <p className="font-display text-sm uppercase leading-none">Welcome</p>
      <p>
        A report is a run of <strong>pages</strong>. Each page holds a stack of{' '}
        <strong>components</strong> — paragraphs, lists, pictures — which you add here and edit by
        clicking them on the page. When it's ready, <strong>Export PDF</strong>.
      </p>
      <p className="text-ink/60">
        What's open now is the <em>Tools for Change</em> report, as an example. Change anything you
        like — it's a copy, and undo works on all of it.
      </p>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={() => {
            dismiss()
            void newDocument('blank')
          }}
          className="border border-ink/25 px-1.5 py-0.5 uppercase tracking-wide hover:bg-ink hover:text-card"
        >
          Start an empty report
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="border border-ink/25 px-1.5 py-0.5 uppercase tracking-wide hover:border-ink/25"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
