import { BODY_SIZE } from '../../config/brand'
import type { Block } from '../../doc/blocks'
import { BLOCK_LABELS } from '../../doc/defaults'
import { useCurrentLeaf, useDeck } from '../../store/useDeck'
import { BODY_SIZE_OPTIONS } from '../blocks/options'

/** The overflow warning, with the two fixes that actually resolve it. */
export function OverflowNote({ culprit, leafIndex }: { culprit: Block | null; leafIndex: number }) {
  const leaf = useCurrentLeaf()
  const selectBlock = useDeck((s) => s.selectBlock)
  const updateLeaf = useDeck((s) => s.updateLeaf)
  const smaller =
    BODY_SIZE_OPTIONS[BODY_SIZE_OPTIONS.findIndex((o) => o.value === leaf.bodySize) - 1]

  const action =
    'rounded-full bg-danger/15 px-2.5 py-1 leading-none transition hover:bg-danger/30'

  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-danger/10 p-2.5 text-2xs leading-snug text-danger">
      <p>
        This page runs past its foot rule
        {culprit ? (
          <>
            , starting at <strong>{BLOCK_LABELS[culprit.kind]}</strong>.
          </>
        ) : (
          '.'
        )}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {culprit && (
          <button type="button" onClick={() => selectBlock(culprit.id)} className={action}>
            Show it
          </button>
        )}
        {smaller && (
          <button
            type="button"
            onClick={() => updateLeaf(leafIndex, { bodySize: smaller.value })}
            className={action}
            title={`Running text drops to ${BODY_SIZE[smaller.value]}pt.`}
          >
            Set the text {smaller.label.toLowerCase()}
          </button>
        )}
      </div>
    </div>
  )
}
