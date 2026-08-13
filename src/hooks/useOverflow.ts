import { useMemo } from 'react'
import { CONTENT_BOTTOM, PAGE_H, PAGE_W, RUNNING_HEAD_Y } from '../config/brand'
import type { Block } from '../doc/blocks'
import { measureCtx, measuringAssets } from '../render/measureCtx'
import { recordLeaf } from '../render/leaf'
import { useFontsReady } from './useFontsReady'
import { useCurrentLeaf, useDeck } from '../store/useDeck'

/**
 * Does this page overrun its foot rule, and which component crosses it?
 *
 * Measured by running the real painters against a recorder and throwing the ops
 * away, so the answer cannot disagree with what is on the canvas.
 *
 * The *which* matters. "This page runs past its foot rule" is true and almost
 * useless on a page of fourteen components; naming the one that crosses the
 * line, and offering to select it, turns a warning into a next step.
 *
 * Measuring at exactly `PAGE_W` makes the recorder's pixels and the design's
 * points the same number, so the placed rects can be compared against
 * `CONTENT_BOTTOM` directly.
 */
export function useOverflow(
  leaf: ReturnType<typeof useCurrentLeaf>,
  index: number,
): { overflow: boolean; culprit: Block | null } {
  const deck = useDeck((s) => s.deck)
  const ready = useFontsReady()
  return useMemo(() => {
    const none = { overflow: false, culprit: null }
    if (!ready) return none
    // A cover has no foot rule to run past. It is composed across the gutter by
    // its own painter — a full-bleed image, a title fitted to the measure — so
    // measuring it against `CONTENT_BOTTOM` asks a question the page doesn't
    // answer, and the warning was firing on every cover ever made.
    if (leaf.full) return none
    try {
      const { overflow, placed } = recordLeaf(
        measureCtx(),
        leaf,
        deck,
        leaf.full ? PAGE_W * 2 : PAGE_W,
        measuringAssets(),
        { index },
      )
      if (!overflow) return none
      // A bare plate has no foot rule to respect — the same exception
      // `paintBlocks` makes when it decides whether the page overran at all.
      const bottom = leaf.bare ? PAGE_H - RUNNING_HEAD_Y : CONTENT_BOTTOM
      const first = placed.find((p) => p.rect.y + p.rect.h > bottom + 0.5)
      return { overflow: true, culprit: first?.block ?? null }
    } catch {
      // A measuring failure must never take the editor down with it.
      return none
    }
  }, [leaf, deck, index, ready])
}
