import { create } from 'zustand'
import type { Block, BlockId, BlockKind } from '../doc/blocks'
import { createBlock, createDeck, createLeaf, pairLeaves, seedDeck } from '../doc/defaults'
import type { Deck, Leaf } from '../doc/types'
import { deckSpreads, leafId } from '../doc/types'
import type { Lang } from '../doc/localized'
import { templateById } from '../templates'
import { clearLegacySession, loadLegacySession } from './session'
import {
  documentId,
  flushSave,
  listDocuments,
  loadDocument,
  saveDocument,
  scheduleSave,
  setLastOpened,
  lastOpened,
} from './library'

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

/**
 * A caret in a field on the page.
 *
 * `path` is the field's `FieldPath` joined with dots, matching the key the hit
 * layer builds its regions under; `from`/`to` are offsets into the *resolved
 * plain text*, which is exactly what the transparent textarea reports.
 */
export interface Caret {
  leafIndex: number
  blockId: BlockId
  path: string
  from: number
  to: number
}

interface DeckState {
  deck: Deck
  /** Which row of the library this document autosaves to. */
  docId: string
  /** Index into `deck.leaves` of the leaf being edited. */
  leafIndex: number
  selectedBlock: BlockId | null
  /**
   * Where the next component goes, when the insert was asked for at a
   * particular place on the page rather than from the bottom of the list.
   *
   * View state, not document state: it is a pending gesture, so it never
   * touches the undo stack and it is cleared by anything that moves the
   * selection somewhere else.
   */
  insertAt: number | null
  /**
   * Where the caret is, when one is in a field on the page.
   *
   * View state for the same reason `insertAt` is: it is a gesture in progress,
   * not something to undo. It lives here rather than inside the canvas because
   * the toolbar that acts on it — bold, italic, a link — is a sibling of the
   * page, not a child of it, and a selection nobody else can see is a selection
   * nothing can be done to.
   */
  caret: Caret | null
  history: History

  // -- document ------------------------------------------------------------
  /** Replace the open document's content, keeping its library row. */
  setDeck(deck: Deck): void
  /** Open a *different* document, saving the current one first. */
  openDocument(id: string): Promise<void>
  /** Start a new document — blank, or seeded with the reference report. */
  newDocument(from?: 'blank' | 'seed'): Promise<void>
  /** Adopt an imported deck as a new document. */
  adoptDocument(deck: Deck): Promise<void>
  /** Replace this document's content with the reference report. */
  resetToSeed(): void
  setName(name: string): void
  setLang(lang: Lang): void
  setOverlayOpacity(id: string, value: number): void

  // -- spreads -------------------------------------------------------------
  // A spread is the unit here, not a leaf: see `pairLeaves` in `doc/defaults.ts`
  // for why a lone A4 page cannot exist.
  selectLeaf(index: number): void
  /** Add a facing pair after the spread `after` sits in. One undo step. */
  addSpread(after?: number): void
  /** Copy the spread `index` sits in, directly after it. */
  duplicateSpread(index: number): void
  /** Remove the whole spread `index` sits in. */
  removeSpread(index: number): void
  /** Move the spread at `from` to where the spread at `to` sits. */
  moveSpread(from: number, to: number): void
  updateLeaf(index: number, patch: Partial<Leaf>): void
  /** Reseed a leaf from a template, replacing its components. */
  applyTemplate(index: number, templateId: string): void

  // -- blocks --------------------------------------------------------------
  selectBlock(id: BlockId | null): void
  /** Arm the insert menu for a particular slot in the stack, or disarm it. */
  setInsertAt(index: number | null): void

  // -- the caret -----------------------------------------------------------
  /** Put the caret in a field, or take it out of the page entirely. */
  setCaret(caret: Caret | null): void
  /** Update just the selected range, as the textarea reports it. */
  setSelection(from: number, to: number): void
  addBlock(kind: BlockKind, at?: number): void
  updateBlock(id: BlockId, patch: Partial<Block>): void
  /** Replace a block with a different kind, keeping its position. */
  swapBlock(id: BlockId, kind: BlockKind): void
  removeBlock(id: BlockId): void
  moveBlock(id: BlockId, delta: number): void
  /** Copy a block in place, directly below the original. */
  duplicateBlock(id: BlockId): void

  undo(): void
  redo(): void
}

const move = <T>(list: T[], from: number, to: number): T[] => {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(Math.max(0, Math.min(next.length, to)), 0, item)
  return next
}

/** The spread a leaf index falls in. */
const spreadAt = (deck: Deck, index: number) =>
  deckSpreads(deck).find((s) =>
    s.kind === 'full' ? s.index === index : s.index === index || s.index + 1 === index,
  )

/** The leaf index just past that spread — where a new one lands. */
const spreadAfter = (deck: Deck, index: number): number => {
  const spread = spreadAt(deck, index)
  return spread ? spread.index + (spread.kind === 'full' ? 1 : 2) : index + 1
}

export const useDeck = create<DeckState>((set, get) => {
  /**
   * Apply a change to the document, pushing the previous one onto the undo
   * stack. Every mutator goes through here, so nothing can change the document
   * without becoming undoable.
   */
  const commit = (fn: (deck: Deck) => Deck): void => {
    const { deck, history, docId } = get()
    const next = paginate(fn(deck))
    if (next === deck) return
    set({
      deck: next,
      history: { past: [...history.past, deck].slice(-LIMIT), future: [] },
    })
    scheduleSave(docId, next)
  }

  /**
   * Hold the document to the pairing rule — see `pairLeaves`.
   *
   * Applied to every commit and to every document as it is opened, rather than
   * at the handful of call sites that can break it, because "which mutators can
   * strand a verso" is exactly the kind of list that goes out of date. Returns
   * the same object when nothing needed doing.
   */
  const paginate = (deck: Deck): Deck => {
    const leaves = pairLeaves(deck.leaves)
    return leaves === deck.leaves ? deck : { ...deck, leaves }
  }

  /** Swap the whole open document, discarding history — undo across two
   *  different reports would be a trap, not a convenience. */
  const install = (deck: Deck, docId: string): void => {
    set({
      deck: paginate(deck),
      docId,
      leafIndex: 0,
      selectedBlock: null,
      insertAt: null,
      caret: null,
      history: { past: [], future: [] },
    })
    setLastOpened(docId)
  }

  /** Edit the currently-selected leaf. */
  const onLeaf = (fn: (leaf: Leaf) => Leaf): void =>
    commit((deck) => ({
      ...deck,
      leaves: deck.leaves.map((l, i) => (i === get().leafIndex ? fn(l) : l)),
    }))

  return {
    deck: paginate(seedDeck()),
    docId: documentId(),
    leafIndex: 0,
    selectedBlock: null,
    insertAt: null,
    caret: null,
    history: { past: [], future: [] },

    setDeck: (deck) => {
      const { docId } = get()
      deck = paginate(deck)
      set({
        deck,
        leafIndex: 0,
        selectedBlock: null,
        insertAt: null,
        caret: null,
        history: { past: [], future: [] },
      })
      scheduleSave(docId, deck)
    },

    openDocument: async (id) => {
      if (id === get().docId) return
      await flushSave()
      const deck = await loadDocument(id)
      if (!deck) return
      install(deck, id)
    },

    newDocument: async (from = 'blank') => {
      await flushSave()
      const deck = from === 'seed' ? seedDeck() : createDeck()
      const id = documentId()
      install(deck, id)
      await saveDocument(id, deck)
    },

    adoptDocument: async (deck) => {
      await flushSave()
      const id = documentId()
      install(deck, id)
      await saveDocument(id, deck)
    },

    resetToSeed: () => commit((deck) => ({ ...seedDeck(), name: deck.name })),
    setName: (name) => commit((deck) => ({ ...deck, name })),
    setLang: (lang) => commit((deck) => ({ ...deck, lang })),
    setOverlayOpacity: (id, value) =>
      commit((deck) => ({
        ...deck,
        overlayOpacity: { ...deck.overlayOpacity, [id]: value },
      })),

    // -- leaves ------------------------------------------------------------
    selectLeaf: (index) =>
      set({
        leafIndex: Math.max(0, Math.min(get().deck.leaves.length - 1, index)),
        selectedBlock: null,
        insertAt: null,
        caret: null,
      }),

    /**
     * Add a facing pair after the spread you are looking at.
     *
     * Two leaves, not one. The document is read — and displayed, and
     * thumbnailed — two pages at a time, so adding a single leaf pushed every
     * page after it onto the opposite side of the gutter, which is a very large
     * change to ask for by pressing "+". See `pairLeaves` for the rule this is
     * one half of.
     *
     * One `commit`, so it is also one undo.
     */
    addSpread: (after) => {
      const from = after ?? get().leafIndex
      const at = spreadAfter(get().deck, from)
      commit((d) => ({
        ...d,
        leaves: [...d.leaves.slice(0, at), createLeaf(), createLeaf(), ...d.leaves.slice(at)],
      }))
      set({ leafIndex: at, selectedBlock: null, insertAt: null, caret: null })
    },

    duplicateSpread: (index) => {
      const deck = get().deck
      const spread = spreadAt(deck, index)
      if (!spread) return
      const from = spread.index
      const count = spread.kind === 'full' ? 1 : 2
      // New ids throughout: two leaves sharing a block id would make every
      // selection and every update ambiguous.
      const stamp = Date.now().toString(36)
      const copies = deck.leaves.slice(from, from + count).map((source) => ({
        ...source,
        id: leafId(),
        blocks: source.blocks.map((b) => ({ ...b, id: `${b.id}_c${stamp}` })),
      }))
      commit((d) => ({
        ...d,
        leaves: [...d.leaves.slice(0, from + count), ...copies, ...d.leaves.slice(from + count)],
      }))
      set({ leafIndex: from + count, selectedBlock: null, insertAt: null, caret: null })
    },

    /**
     * Remove a whole spread.
     *
     * Both leaves, because half a spread is not a thing this document can hold —
     * deleting one would leave its facing page to be paired with whatever
     * followed, re-flowing every spread after it.
     *
     * Removing the last one leaves a fresh blank pair rather than nothing:
     * `pairLeaves` refuses an empty document, and an editor with no page in it
     * has nothing to draw and no way back.
     */
    removeSpread: (index) => {
      const deck = get().deck
      const spread = spreadAt(deck, index)
      if (!spread) return
      const from = spread.index
      const count = spread.kind === 'full' ? 1 : 2
      commit((d) => ({
        ...d,
        leaves: [...d.leaves.slice(0, from), ...d.leaves.slice(from + count)],
      }))
      set({
        leafIndex: Math.max(0, Math.min(get().deck.leaves.length - 1, from)),
        selectedBlock: null,
        insertAt: null,
        caret: null,
      })
    },

    moveSpread: (from, to) => {
      const deck = get().deck
      const source = spreadAt(deck, from)
      const target = spreadAt(deck, to)
      if (!source || !target || source.index === target.index) return
      const count = source.kind === 'full' ? 1 : 2
      const taken = deck.leaves.slice(source.index, source.index + count)
      const rest = [
        ...deck.leaves.slice(0, source.index),
        ...deck.leaves.slice(source.index + count),
      ]
      // Where the target sat once the moved spread was lifted out.
      const at = target.index > source.index ? target.index - count : target.index
      commit((d) => ({ ...d, leaves: [...rest.slice(0, at), ...taken, ...rest.slice(at)] }))
      set({ leafIndex: at, selectedBlock: null, insertAt: null, caret: null })
    },

    updateLeaf: (index, patch) =>
      commit((deck) => ({
        ...deck,
        leaves: deck.leaves.map((l, i) => (i === index ? { ...l, ...patch } : l)),
      })),

    applyTemplate: (index, templateId) => {
      const template = templateById(templateId)
      if (!template) return
      const built = template.build()
      commit((deck) => ({
        ...deck,
        leaves: deck.leaves.map((l, i) =>
          i === index
            ? // Built over a *fresh* leaf, not spread onto the old one. A
              // template describes a whole page shape, and only says what it
              // needs — so spreading it over the previous leaf left every flag
              // it didn't mention behind. Changing away from the cover left the
              // page `full`, i.e. a spread-width page in the middle of the
              // document; a plate left `bare` and its image.
              //
              // The chapter and section are the exception, because they are
              // copy someone typed rather than part of the shape.
              {
                ...createLeaf(built),
                id: l.id,
                templateId,
                chapter: built.chapter ?? l.chapter,
                section: built.section ?? l.section,
              }
            : l,
        ),
      }))
      set({ selectedBlock: null, insertAt: null, caret: null })
    },

    // -- blocks ------------------------------------------------------------
    selectBlock: (id) => set({ selectedBlock: id, insertAt: null, caret: null }),
    setInsertAt: (index) => set({ insertAt: index, selectedBlock: null, caret: null }),

    setCaret: (caret) => set({ caret }),
    setSelection: (from, to) => {
      const caret = get().caret
      if (!caret || (caret.from === from && caret.to === to)) return
      set({ caret: { ...caret, from, to } })
    },

    addBlock: (kind, at) => {
      const block = createBlock(kind)
      onLeaf((leaf) => {
        const index = at ?? leaf.blocks.length
        return {
          ...leaf,
          blocks: [...leaf.blocks.slice(0, index), block, ...leaf.blocks.slice(index)],
        }
      })
      set({ selectedBlock: block.id, insertAt: null })
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
      onLeaf((leaf) => ({
        ...leaf,
        blocks: leaf.blocks.filter((b) => b.id !== id),
      }))
      if (get().selectedBlock === id) set({ selectedBlock: null, insertAt: null })
    },

    moveBlock: (id, delta) =>
      onLeaf((leaf) => {
        const from = leaf.blocks.findIndex((b) => b.id === id)
        if (from < 0) return leaf
        const to = from + delta
        if (to < 0 || to >= leaf.blocks.length) return leaf
        return { ...leaf, blocks: move(leaf.blocks, from, to) }
      }),

    duplicateBlock: (id) => {
      const copyId = `${id}_c${Date.now().toString(36)}`
      onLeaf((leaf) => {
        const at = leaf.blocks.findIndex((b) => b.id === id)
        if (at < 0) return leaf
        // A shallow copy is enough for the fields: every one is either a
        // primitive or an array the editors replace wholesale rather than
        // mutate in place. `marks` is the exception — it is a nested map keyed
        // by field path, so the two blocks would otherwise share one object and
        // bolding a word in the copy would bold it in the original.
        const source = leaf.blocks[at]
        const copy = {
          ...source,
          id: copyId,
          ...(source.marks ? { marks: structuredClone(source.marks) } : {}),
        }
        return {
          ...leaf,
          blocks: [...leaf.blocks.slice(0, at + 1), copy, ...leaf.blocks.slice(at + 1)],
        }
      })
      set({ selectedBlock: copyId })
    },

    undo: () => {
      const { history, deck, docId } = get()
      const prev = history.past[history.past.length - 1]
      if (!prev) return
      set({
        deck: prev,
        history: {
          past: history.past.slice(0, -1),
          future: [deck, ...history.future],
        },
        leafIndex: Math.min(get().leafIndex, prev.leaves.length - 1),
      })
      scheduleSave(docId, prev)
    },

    redo: () => {
      const { history, deck, docId } = get()
      const next = history.future[0]
      if (!next) return
      set({
        deck: next,
        history: {
          past: [...history.past, deck],
          future: history.future.slice(1),
        },
        leafIndex: Math.min(get().leafIndex, next.leaves.length - 1),
      })
      scheduleSave(docId, next)
    },
  }
})

/** The leaf currently being edited. */
export const useCurrentLeaf = (): Leaf =>
  useDeck((s) => s.deck.leaves[s.leafIndex] ?? s.deck.leaves[0])

/** Every spread, for the strip and the canvas. */
export const useSpreads = () => useDeck((s) => deckSpreads(s.deck))

/**
 * Decide what is open when the editor starts, once on boot.
 *
 * In order: the previous build's single localStorage session (rescued into the
 * library and then forgotten), the document last open, the most recently
 * edited, and finally a new document seeded with the reference report — which
 * is what a first-time visitor sees, and the reason the design system is
 * visible before anyone has typed anything.
 */
export async function bootstrap(): Promise<void> {
  const store = useDeck.getState()

  const legacy = loadLegacySession()
  if (legacy) {
    clearLegacySession()
    await store.adoptDocument({ ...legacy, name: legacy.name ?? 'My report' })
    return
  }

  const wanted = lastOpened()
  if (wanted) {
    const deck = await loadDocument(wanted)
    if (deck) {
      useDeck.setState({
        deck,
        docId: wanted,
        leafIndex: 0,
        selectedBlock: null,
        insertAt: null,
      })
      return
    }
  }

  const [newest] = await listDocuments()
  if (newest) {
    await store.openDocument(newest.id)
    return
  }

  await store.newDocument('seed')
}

/**
 * Write anything outstanding before the tab goes away.
 *
 * The debounce means the last few hundred milliseconds of typing are otherwise
 * in memory only, and `visibilitychange` is the last event a closing tab is
 * guaranteed to deliver.
 */
export function flushOnHide(): () => void {
  const onHide = () => {
    if (document.visibilityState === 'hidden') void flushSave()
  }
  document.addEventListener('visibilitychange', onHide)
  return () => document.removeEventListener('visibilitychange', onHide)
}
