import { spreadLabel } from '../../doc/types'
import { useDeck, useSpreads } from '../../store/useDeck'
import { useUi } from '../../store/useUi'
import { Card } from '../ui'

/**
 * Which spread you are on, and the way to see all of them.
 *
 * Its own small card under the panel rather than a row inside it, because it is
 * about the document's shape rather than this page's settings — and because the
 * thumbnails it opens belong over the canvas, not in a 188px column.
 */

export function PagesCard() {
  const deck = useDeck((s) => s.deck)
  const leafIndex = useDeck((s) => s.leafIndex)
  const spreads = useSpreads()
  const open = useUi((s) => s.pagesOpen)
  const setOpen = useUi((s) => s.setPagesOpen)

  const spread = spreads.find((s) =>
    s.kind === 'full' ? s.index === leafIndex : s.index === leafIndex || s.index + 1 === leafIndex,
  )

  return (
    <Card className="flex flex-col gap-2.5 p-5">
      <span className="text-xs leading-none text-ink">
        {spread ? spreadLabel(deck, spread.index, spread.kind) : 'Pages'}
      </span>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-fit text-xs leading-none text-dim transition hover:text-ink"
      >
        {open ? 'Close' : 'See all'}
      </button>
    </Card>
  )
}
