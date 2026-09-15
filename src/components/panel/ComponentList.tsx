import type { BlockKind } from '../../doc/blocks'
import { OFFERED_GROUPS, OFFERED_LABELS, BLOCK_INFO } from '../../doc/defaults'
import { useDeck } from '../../store/useDeck'
import { Pill, subLabelClass } from '../ui'

/**
 * The palette: the things a page is built out of.
 *
 * Clicking one adds it — to the slot armed by a "+" between two components on
 * the page if there is one, otherwise to the end. There is no chooser to open
 * first and nothing to confirm, because adding a component is cheap and undoing
 * it is one keystroke.
 *
 * Rendered twice: here in the panel, and in a popover at the "+" itself (see
 * `SpreadCanvas`). The second is the one people actually use — pressing a "+"
 * only *armed* a slot and then sent you 188px left to the panel to say what
 * went in it, so the commonest action in the editor crossed the window and came
 * back. `onPick` is how the popover closes itself afterwards.
 */
export function ComponentList({ onPick }: { onPick?: () => void } = {}) {
  const addBlock = useDeck((s) => s.addBlock)
  const insertAt = useDeck((s) => s.insertAt)
  const setInsertAt = useDeck((s) => s.setInsertAt)

  const add = (kind: BlockKind) => {
    addBlock(kind, insertAt ?? undefined)
    setInsertAt(null)
    onPick?.()
  }

  return (
    <div className="flex flex-col gap-5">
      {OFFERED_GROUPS.map(({ group, kinds }) => (
        <div key={group} className="flex flex-col gap-2.5">
          <span className={subLabelClass}>{group}</span>
          <div className="flex flex-wrap gap-1">
            {kinds.map((kind) => (
              <Pill
                key={kind}
                className="shrink-0"
                title={BLOCK_INFO[kind].hint}
                onClick={() => add(kind)}
              >
                {OFFERED_LABELS[kind] ?? BLOCK_INFO[kind].label}
              </Pill>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
