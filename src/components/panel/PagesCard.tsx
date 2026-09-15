import { spreadLabel } from '../../doc/types'
import { useDeck, useSpreads } from '../../store/useDeck'
import { Card } from '../ui'

/**
 * Which spread you are on.
 *
 * Its own small card under the panel rather than a row inside it, because it is
 * about the document's shape rather than this page's settings.
 *
 * It used to carry a "See all" that opened the thumbnails. They are always open
 * now — see `canvas/PagesBar.tsx` — so what is left is the label, which is the
 * half that was doing the work anyway: it names the spread in the document's
 * own terms ("Findings, 12–13") where the strip below can only show it to you.
 */

export function PagesCard() {
  const deck = useDeck((s) => s.deck)
  const leafIndex = useDeck((s) => s.leafIndex)
  const spreads = useSpreads()
  const spread = spreads.find((s) =>
    s.kind === 'full' ? s.index === leafIndex : s.index === leafIndex || s.index + 1 === leafIndex,
  )

  return (
    <Card className="p-5">
      <span className="text-xs leading-none text-ink">
        {spread ? spreadLabel(deck, spread.index, spread.kind) : 'Pages'}
      </span>
    </Card>
  )
}
