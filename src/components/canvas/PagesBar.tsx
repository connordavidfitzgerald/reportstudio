import { useState } from 'react'
import { PAGE_H, PAGE_W } from '../../config/brand'
import type { Spread } from '../../doc/types'
import { spreadLabel } from '../../doc/types'
import { useConfirm } from '../../hooks/useConfirm'
import { useDeck, useSpreads } from '../../store/useDeck'
import { useUi } from '../../store/useUi'
import { LeafThumb } from '../LeafThumb'

/**
 * Every spread, small, along the foot of the stage.
 *
 * It used to be a strip of *single* pages under the canvas, which quietly
 * disagreed with everything around it: the canvas shows two pages, the reader
 * holds two pages, and "+" adds two pages. So the unit here is the spread —
 * two leaves meeting at a spine in one 1.414:1 frame, which is also the shape
 * of the thing you are looking at above it. It is the unit that can be dragged,
 * duplicated and deleted, too: half a spread is not something this document can
 * hold (see `pairLeaves`).
 *
 * It floats over the page rather than taking a band of layout beneath it,
 * because it is only wanted while you are looking for a page.
 */

/** Thumbnail width for one leaf. A spread is twice this, plus the spine. */
const LEAF_W = 33

function SpreadThumb({
  spread,
  active,
  dragging,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  spread: Spread
  active: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDrop: () => void
}) {
  const deck = useDeck((s) => s.deck)
  const selectLeaf = useDeck((s) => s.selectLeaf)
  const label = spreadLabel(deck, spread.index, spread.kind)

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        onDrop()
      }}
      title={label}
      aria-label={label}
      onClick={() => selectLeaf(spread.index)}
      style={{ height: LEAF_W * (PAGE_H / PAGE_W) }}
      // The current spread stands slightly proud of the row — the Figma's own
      // way of marking it, and quieter than an outline on something this small.
      className={`flex shrink-0 cursor-grab overflow-hidden rounded-[1px] bg-ink transition
        ${dragging ? 'opacity-40' : ''}
        ${active ? '-translate-y-[5px] outline outline-1 outline-ink' : 'opacity-80 hover:opacity-100'}`}
    >
      {spread.kind === 'full' ? (
        <LeafThumb leaf={spread.leaf} deck={deck} width={LEAF_W} index={spread.index} />
      ) : (
        <>
          <LeafThumb leaf={spread.left} deck={deck} width={LEAF_W} index={spread.index} />
          {spread.right ? (
            <LeafThumb leaf={spread.right} deck={deck} width={LEAF_W} index={spread.index + 1} />
          ) : (
            <span style={{ width: LEAF_W }} />
          )}
        </>
      )}
    </button>
  )
}

export function PagesBar() {
  const spreads = useSpreads()
  const leafIndex = useDeck((s) => s.leafIndex)
  const addSpread = useDeck((s) => s.addSpread)
  const duplicateSpread = useDeck((s) => s.duplicateSpread)
  const removeSpread = useDeck((s) => s.removeSpread)
  const moveSpread = useDeck((s) => s.moveSpread)
  const open = useUi((s) => s.pagesOpen)
  const confirm = useConfirm()
  const [dragging, setDragging] = useState<number | null>(null)

  if (!open) return null

  const remove = async () => {
    if (
      await confirm({
        title: 'Delete this spread?',
        body: 'Both pages go. Undo will bring them back.',
        confirmLabel: 'Delete',
        danger: true,
      })
    ) {
      removeSpread(leafIndex)
    }
  }

  const act =
    'flex h-6 items-center rounded-full bg-card px-2.5 text-2xs leading-none text-ink transition hover:bg-ink hover:text-card'

  return (
    <div
      className="pointer-events-auto absolute bottom-5 left-1/2 flex max-w-[calc(100%-2.5rem)]
        -translate-x-1/2 items-end gap-2.5 overflow-x-auto rounded-card bg-control p-5"
    >
      {spreads.map((spread) => (
        <SpreadThumb
          key={spread.kind === 'full' ? spread.leaf.id : spread.left.id}
          spread={spread}
          dragging={dragging === spread.index}
          onDragStart={() => setDragging(spread.index)}
          onDragEnd={() => setDragging(null)}
          onDrop={() => {
            if (dragging !== null) moveSpread(dragging, spread.index)
            setDragging(null)
          }}
          active={
            spread.kind === 'full'
              ? spread.index === leafIndex
              : spread.index === leafIndex || spread.index + 1 === leafIndex
          }
        />
      ))}

      <div className="ml-2.5 flex shrink-0 gap-1">
        <button type="button" title="Add two facing pages" onClick={() => addSpread()} className={act}>
          Add
        </button>
        <button
          type="button"
          title="Copy this spread"
          onClick={() => duplicateSpread(leafIndex)}
          className={act}
        >
          Copy
        </button>
        <button type="button" title="Delete this spread" onClick={() => void remove()} className={act}>
          Delete
        </button>
      </div>
    </div>
  )
}
