import { LANGS, type Lang } from '../../doc/localized'
import { useSaveState } from '../../store/library'
import { useCurrentLeaf, useDeck } from '../../store/useDeck'
import { FirstRun } from '../FirstRun'
import { UndoRedo } from '../UndoRedo'
import { labelClass } from '../ui'
import { ComponentList } from './ComponentList'
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

const SAVE_LABEL = { saved: 'Saved', saving: 'Saving…', error: 'Not saved' } as const

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
  const save = useSaveState()

  return (
    <div className="flex items-center justify-between gap-2 pt-1 text-2xs text-dim">
      <UndoRedo />
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
        title={
          save === 'error'
            ? 'This browser refused to store the document. Download a copy from Documents.'
            : 'Your work is saved in this browser as you type.'
        }
        className={save === 'error' ? 'text-[#FF8FA3]' : ''}
      >
        {SAVE_LABEL[save]}
      </span>
    </div>
  )
}

export function Panel() {
  const leaf = useCurrentLeaf()
  const leafIndex = useDeck((s) => s.leafIndex)
  const { overflow, culprit } = useOverflow(leaf, leafIndex)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[30px] overflow-y-auto p-5">
      <h1 className="text-xs leading-none text-ink">Report Studio</h1>

      <PanelActions />

      <FirstRun />
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
      </div>
    </div>
  )
}
