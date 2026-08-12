import { create } from 'zustand'
import type { Block, BlockId, BlockKind } from '../doc/blocks'
import { createBlock, createLeaf, seedDeck } from '../doc/defaults'
import type { Deck, Leaf } from '../doc/types'
import { deckSpreads, leafId } from '../doc/types'
import type { Lang } from '../doc/localized'
import { templateById } from '../templates'
import { loadSession, saveSession } from './session'

/**
 * The editor store.
 *
 * There is no positional state here at all — no drag, no selected handles, no
 * tool mode. A block belongs to a leaf and has an index in it, and that is the
 * whole of its placement. Everything this store exposes is therefore an edit to
 * *content or order*, which is what makes the undo stack a plain list of
 * documents rather than a log of geometric operations.
 */

interface History {
  past: Deck[]
  future: Deck[]
}

const LIMIT = 60

interface DeckState {
  deck: Deck
  /** Index into `deck.leaves` of the leaf being edited. */
  leafIndex: number
  selectedBlock: BlockId | null
  history: History

  // -- document ------------------------------------------------------------
  setDeck(deck: Deck): void
  setLang(lang: Lang): void
  setOverlayOpacity(id: string, value: number): void

  // -- leaves --------------------------------------------------------------
  selectLeaf(index: number): void
  addLeaf(after?: number, over?: Partial<Leaf>): void
  duplicateLeaf(index: number): void
  removeLeaf(index: number): void
  moveLeaf(from: number, to: number): void
  updateLeaf(index: number, patch: Partial<Leaf>): void
  /** Reseed a leaf from a template, replacing its components. */
  applyTemplate(index: number, templateId: string): void

  // -- blocks --------------------------------------------------------------
  selectBlock(id: BlockId | null): void
  addBlock(kind: BlockKind, at?: number): void
  updateBlock(id: BlockId, patch: Partial<Block>): void
  /** Replace a block with a different kind, keeping its position. */
  swapBlock(id: BlockId, kind: BlockKind): void
  removeBlock(id: BlockId): void
  moveBlock(id: BlockId, delta: number): void

  undo(): void
  redo(): void
}

const move = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item)
  return next
}

export const useDeck = create<DeckState>((set, get) => {
  /**
   * Apply a change to the document, pushing the previous one onto the undo
   * stack. Every mutator goes through here, so nothing can change the document
   * without becoming undoable.
   */
  const commit = (fn: (deck: Deck) => Deck): void => {
    const { deck, history } = get()
    const next = fn(deck)
    if (next === deck) return
    set({
      deck: next,
      history: { past: [...history.past, deck].slice(-LIMIT), future: [] },
    })
    void saveSession(next)
  }

  /** Edit the currently-selected leaf. */
  const onLeaf = (fn: (leaf: Leaf) => Leaf): void =>
    commit((deck) => ({
      ...deck,
      leaves: deck.leaves.map((l, i) => (i === get().leafIndex ? fn(l) : l)),
    }))

  return {
    deck: seedDeck(),
    leafIndex: 0,
    selectedBlock: null,
    history: { past: [], future: [] },

    setDeck: (deck) => {
      set({ deck, leafIndex: 0, selectedBlock: null, history: { past: [], future: [] } })
      void saveSession(deck)
    },
    setLang: (lang) => commit((deck) => ({ ...deck, lang })),
    setOverlayOpacity: (id, value) =>
      commit((deck) => ({ ...deck, overlayOpacity: { ...deck.overlayOpacity, [id]: value } })),

    // -- leaves ------------------------------------------------------------
    selectLeaf: (index) =>
      set({
        leafIndex: Math.max(0, Math.min(get().deck.leaves.length - 1, index)),
        selectedBlock: null,
      }),

    addLeaf: (after, over) => {
      const at = (after ?? get().leafIndex) + 1
      commit((deck) => ({
        ...deck,
        leaves: [...deck.leaves.slice(0, at), createLeaf(over), ...deck.leaves.slice(at)],
      }))
      set({ leafIndex: at, selectedBlock: null })
    },

    duplicateLeaf: (index) => {
      const source = get().deck.leaves[index]
      if (!source) return
      // New ids throughout: two leaves sharing a block id would make every
      // selection and every update ambiguous.
      const copy: Leaf = {
        ...source,
        id: leafId(),
        blocks: source.blocks.map((b) => ({ ...b, id: `${b.id}_c${Date.now().toString(36)}` })),
      }
      commit((deck) => ({
        ...deck,
        leaves: [...deck.leaves.slice(0, index + 1), copy, ...deck.leaves.slice(index + 1)],
      }))
      set({ leafIndex: index + 1, selectedBlock: null })
    },

    removeLeaf: (index) => {
      if (get().deck.leaves.length <= 1) return
      commit((deck) => ({ ...deck, leaves: deck.leaves.filter((_, i) => i !== index) }))
      set({
        leafIndex: Math.max(0, Math.min(get().deck.leaves.length - 1, index - 1)),
        selectedBlock: null,
      })
    },

    moveLeaf: (from, to) => {
      commit((deck) => ({ ...deck, leaves: move(deck.leaves, from, to) }))
      set({ leafIndex: to })
    },

    updateLeaf: (index, patch) =>
      commit((deck) => ({
        ...deck,
        leaves: deck.leaves.map((l, i) => (i === index ? { ...l, ...patch } : l)),
      })),

    applyTemplate: (index, templateId) => {
      const template = templateById(templateId)
      if (!template) return
      commit((deck) => ({
        ...deck,
        leaves: deck.leaves.map((l, i) =>
          i === index ? { ...l, ...template.build(), id: l.id, templateId } : l,
        ),
      }))
      set({ selectedBlock: null })
    },

    // -- blocks ------------------------------------------------------------
    selectBlock: (id) => set({ selectedBlock: id }),

    addBlock: (kind, at) => {
      const block = createBlock(kind)
      onLeaf((leaf) => {
        const index = at ?? leaf.blocks.length
        return {
          ...leaf,
          blocks: [...leaf.blocks.slice(0, index), block, ...leaf.blocks.slice(index)],
        }
      })
      set({ selectedBlock: block.id })
    },

    updateBlock: (id, patch) =>
      onLeaf((leaf) => ({
        ...leaf,
        blocks: leaf.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
      })),

    swapBlock: (id, kind) =>
      onLeaf((leaf) => ({
        ...leaf,
        blocks: leaf.blocks.map((b) => {
          if (b.id !== id) return b
          // Keep the id and the column run — swapping a paragraph for a quote
          // should not also move it back to the full measure — but take
          // everything else from the new kind's seed, since the old block's
          // fields mean nothing to it.
          const seed = createBlock(kind)
          return { ...seed, id: b.id, col: b.col, span: b.span } as Block
        }),
      })),

    removeBlock: (id) => {
      onLeaf((leaf) => ({ ...leaf, blocks: leaf.blocks.filter((b) => b.id !== id) }))
      if (get().selectedBlock === id) set({ selectedBlock: null })
    },

    moveBlock: (id, delta) =>
      onLeaf((leaf) => {
        const from = leaf.blocks.findIndex((b) => b.id === id)
        if (from < 0) return leaf
        const to = from + delta
        if (to < 0 || to >= leaf.blocks.length) return leaf
        return { ...leaf, blocks: move(leaf.blocks, from, to) }
      }),

    undo: () => {
      const { history, deck } = get()
      const prev = history.past[history.past.length - 1]
      if (!prev) return
      set({
        deck: prev,
        history: { past: history.past.slice(0, -1), future: [deck, ...history.future] },
        leafIndex: Math.min(get().leafIndex, prev.leaves.length - 1),
      })
      void saveSession(prev)
    },

    redo: () => {
      const { history, deck } = get()
      const next = history.future[0]
      if (!next) return
      set({
        deck: next,
        history: { past: [...history.past, deck], future: history.future.slice(1) },
        leafIndex: Math.min(get().leafIndex, next.leaves.length - 1),
      })
      void saveSession(next)
    },
  }
})

/** The leaf currently being edited. */
export const useCurrentLeaf = (): Leaf =>
  useDeck((s) => s.deck.leaves[s.leafIndex] ?? s.deck.leaves[0])

/** Every spread, for the strip and the canvas. */
export const useSpreads = () => useDeck((s) => deckSpreads(s.deck))

/** Restore the last session, once on boot. */
export async function restoreSession(): Promise<void> {
  const deck = await loadSession()
  if (deck) useDeck.getState().setDeck(deck)
}
