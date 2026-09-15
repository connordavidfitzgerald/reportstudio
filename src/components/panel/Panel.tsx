import { LANGS, type Lang } from '../../doc/localized'
import { useAuth } from '../../auth/useAuth'
import { flushSave, useSaveState } from '../../store/library'
import { useCurrentLeaf, useDeck } from '../../store/useDeck'
import { useUi } from '../../store/useUi'
import { UndoRedo } from '../UndoRedo'
import { labelClass } from '../ui'
import { ComponentList } from './ComponentList'
import { DocumentName } from './DocumentName'
import { useOverflow } from '../../hooks/useOverflow'
import { OverflowNote } from './OverflowNote'
import { PageSettings } from './PageSettings'
import { PanelActions } from './PanelActions'

/**
 * The panel: what this page is, and what can be put on it.
 *
 * That is the whole of it now. The block list, the per-component editors, the
 * text fields, the size stepper and the column control have all moved onto the
 * canvas, where the thing they change is visible — which is what lets the panel
 * be two sections and a palette instead of a drawer of everything.
 */

const SAVE_LABEL = {
  saved: 'Saved',
  saving: 'Saving…',
  offline: 'Offline',
  error: 'Not saved',
} as const

/**
 * What each state means, said plainly.
 *
 * `offline` and `error` are worth separating: one is still trying and will
 * settle on its own, the other will not and wants the reader to get a copy out.
 * The old copy here promised the work was "saved in this browser", which is no
 * longer true and was the sort of reassurance that is worse than silence.
 */
const SAVE_TITLE = {
  saved: 'Your work is saved to your account as you type.',
  saving: 'Saving your work to your account…',
  offline: 'No connection. Your work is held here and will be saved as soon as you are back online.',
  error: 'Your work could not be saved. Download a copy from Documents before closing this tab.',
} as const

/**
 * The footer the Figma doesn't have.
 *
 * Undo, the language being edited, and whether the work is safe are not page
 * settings and not components, but they cannot simply not exist — so they sit
 * quietly under both, at label size.
 */
function PanelFooter() {
  const lang = useDeck((s) => s.deck.lang)
  const setLang = useDeck((s) => s.setLang)
  const theme = useUi((s) => s.theme)
  const toggleTheme = useUi((s) => s.toggleTheme)
  const save = useSaveState()

  return (
    <div className="flex items-center justify-between gap-2 pt-1 text-2xs text-dim">
      <UndoRedo />
      <button
        type="button"
        title={theme === 'dark' ? 'Light appearance' : 'Dark appearance'}
        onClick={toggleTheme}
        className="transition hover:text-ink"
      >
        {/* A half-filled disc: the same mark in both themes, reading as the one
         * it would switch to rather than the one you are in. */}
        <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="5" fill="none" stroke="currentColor" />
          <path d="M6.5 1.5a5 5 0 0 0 0 10z" fill="currentColor" />
        </svg>
      </button>
      <div className="flex gap-1.5" role="group" aria-label="Editing language">
        {LANGS.map((l: Lang) => (
          <button
            key={l}
            type="button"
            title={l === 'en' ? 'Edit in English' : 'Edit in French'}
            onClick={() => setLang(l)}
            className={`uppercase transition ${lang === l ? 'text-ink' : 'hover:text-ink'}`}
          >
            {l}
          </button>
        ))}
      </div>
      <span
        title={SAVE_TITLE[save]}
        className={save === 'error' ? 'text-danger' : save === 'offline' ? 'text-ink' : ''}
      >
        {SAVE_LABEL[save]}
      </span>
    </div>
  )
}

/**
 * Who is signed in, and the way out.
 *
 * Signing out flushes first. The debounce means the last second of typing is
 * only in memory, and dropping the session before it lands would lose it with
 * no way to tell the difference from a save that simply never happened.
 */
function AccountRow() {
  const email = useAuth((s) => s.user?.email ?? null)
  const signOut = useAuth((s) => s.signOut)
  if (!email) return null

  return (
    <div className="flex items-center justify-between gap-2 pt-1 text-2xs text-dim">
      <span className="min-w-0 truncate" title={email}>
        {email}
      </span>
      <button
        type="button"
        className="shrink-0 uppercase transition hover:text-ink"
        onClick={() => void flushSave().then(signOut)}
      >
        Sign out
      </button>
    </div>
  )
}

export function Panel() {
  const leaf = useCurrentLeaf()
  const leafIndex = useDeck((s) => s.leafIndex)
  const { overflow, culprit } = useOverflow(leaf, leafIndex)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[30px] overflow-y-auto p-5">
      <div className="flex flex-col gap-2">
        <h1 className="text-xs leading-none text-ink">Report Studio</h1>
        <DocumentName />
      </div>

      <PanelActions />

      {overflow && <OverflowNote culprit={culprit} leafIndex={leafIndex} />}

      <section className="flex flex-col gap-5">
        <h2 className={labelClass}>Page Settings</h2>
        <PageSettings />
      </section>

      <section className="flex flex-col gap-5">
        <h2 className={labelClass}>Components</h2>
        <ComponentList />
      </section>

      <div className="mt-auto">
        <PanelFooter />
        <AccountRow />
      </div>
    </div>
  )
}
