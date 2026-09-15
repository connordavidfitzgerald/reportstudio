import { useState } from 'react'
import { PAGE_H, PAGE_W } from '../../config/brand'
import type { Spread } from '../../doc/types'
import { spreadLabel } from '../../doc/types'
import { useConfirm } from '../../hooks/useConfirm'
import { useDeck, useSpreads } from '../../store/useDeck'
import { LeafThumb } from '../LeafThumb'
import { Card } from '../ui'

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
 * ## It is always there, under the canvas
 *
 * It used to be a floating strip over the foot of the page, opened from a "See
 * all" button on the panel, on the theory that it was only wanted while you
 * were looking for a page. Both halves of that were wrong. It covered the
 * bottom of the spread you were editing — the one thing you cannot afford to
 * hide in a page editor is the page — and being hidden by default meant the
 * document's shape was something you had to go and ask for, so the answer to
 * "how long is this report" was a click away at all times.
 *
 * So it takes a band of layout of its own beneath the stage. The canvas gets
 * the rest, which is less room than it had but all of it usable, and
 * `useContainFit` gives the spread back whatever is left.
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
  const confirm = useConfirm()
  const [dragging, setDragging] = useState<number | null>(null)

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

  // `bg-control`, not `bg-card`: the bar itself is a card now, and a card-
  // coloured button on a card is an invisible button.
  const act =
    'flex h-6 items-center rounded-full bg-control px-2.5 text-2xs leading-none text-ink transition hover:bg-ink hover:text-card'

  return (
    // `items-end` so the current spread can stand proud of the row without the
    // others being dragged up with it, and `shrink-0` so a long document
    // scrolls sideways rather than squeezing the canvas above it.
    <Card className="flex shrink-0 items-end gap-2.5 overflow-x-auto p-4">
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
    </Card>
  )
}
