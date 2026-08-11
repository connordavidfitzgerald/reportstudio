import { create } from 'zustand'
import { pruneImageBlobs } from '../core/imageStore'
import { collectBlobIds } from '../doc/imageCache'
import { createDeck, createFlowSection, createSection, FLOW_PRESETS, pageId } from '../doc/defaults'
import type { Block } from '../doc/blocks'
import { overrideId, repairAnchors, type Override } from '../doc/overrides'
import type { Box, Deck, PageElement } from '../doc/types'
import type { RenderPage } from '../render/page'
import {
  deckPages,
  isFlow,
  isStatic,
  type FlowSection,
  type Section,
  type StaticSection,
} from '../doc/sections'
import type { FormatId } from '../config/formats'
import { getFormat } from '../config/formats'
import { grid } from '../render/grid'
import { loadSession, saveSession } from './session'

// --- Undo/redo -------------------------------------------------------------
//
// Every action rebuilds rather than mutates, so a history entry is just a
// reference to the previous `pages` array: untouched pages, and untouched
// elements on a touched page, are all shared. Editing one element allocates
// four objects (pages → page → elements → element), not a deep copy of the deck.

export interface Snapshot {
  sections: Section[]
  currentPageId: string
}

const HISTORY_LIMIT = 50

/**
 * Runs of the same action within this window collapse into one undo step, so a
 * typed sentence or a dragged slider undoes as a single edit.
 */
const COALESCE_MS = 500

let pendingTag: string | null = null
let lastTag: string | null = null
let lastAt = 0
/** Set while undo/redo is applying, so restoring a snapshot isn't itself recorded. */
let applyingHistory = false

/** Run an action, labelling whatever it changes for the history recorder. */
function tagged<T>(t: string | null, run: () => T): T {
  pendingTag = t
  return run()
}

/**
 * End any run currently being coalesced, so the next edit starts a fresh history
 * step. Called when a text edit is committed — otherwise the first action after
 * a typing burst could merge into its tail.
 */
export function endCoalesce(): void {
  lastTag = null
}

/**
 * In development, freeze every document we publish. Nesting elements two levels
 * deep multiplies the ways to accidentally mutate shared state, and a stray
 * `page.elements[0].box.col = 3` corrupts every past snapshot *silently* — the
 * bug shows up as broken undo, weeks later. Under ESM strict mode a frozen
 * assignment throws at the offending line instead.
 */
function deepFreeze<T>(value: T): T {
  if (!import.meta.env.DEV) return value
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const v of Object.values(value)) deepFreeze(v)
  }
  return value
}

// --- Store -----------------------------------------------------------------

/**
 * What a click on empty canvas does. `pointer` selects and marquees only;
 * `text` drops a new text box where you click. Keeping this explicit means a
 * click can't be ambiguous between "deselect" and "create", which it would be
 * if creation were always on.
 */
export type Tool = 'pointer' | 'text'

interface DeckStore {
  deck: Deck
  currentPageId: string
  selectedIds: string[]
  /** The text element with the DOM editor overlaid on it, if any. */
  editingId: string | null
  tool: Tool
  past: Snapshot[]
  future: Snapshot[]

  undo: () => void
  redo: () => void

  // Elements
  addElement: (pageId: string, el: PageElement, tag?: string) => void
  setElement: (pageId: string, id: string, patch: Partial<PageElement>, tag?: string) => void
  /** Move/resize several elements as ONE history step — a drag is one undo. */
  setElementBoxes: (pageId: string, boxes: Record<string, Box>) => void
  removeElements: (pageId: string, ids: string[]) => void
  duplicateElements: (pageId: string, ids: string[]) => void
  reorderElement: (pageId: string, id: string, to: 'front' | 'back' | 'up' | 'down') => void

  // Sections
  /** Append a flow section, and open its first page. */
  addFlowSection: (preset?: string) => void
  /** Replace a flow section's stream — the import path. */
  setBlocks: (sectionId: string, blocks: Block[], tag?: string) => void
  /** Edit one block in place. Coalesced per block, so typing is one undo step. */
  setBlock: (sectionId: string, blockId: string, patch: Partial<Block>) => void
  removeBlock: (sectionId: string, blockId: string) => void
  /** Pin an element onto the page a block landed on, out of the flow. */
  addPin: (sectionId: string, anchorBlockId: string, element: PageElement) => void
  removeOverride: (sectionId: string, overrideId: string) => void
  setOverrides: (sectionId: string, overrides: Override[]) => void
  /** Move a block within its stream — the reorder gesture. */
  moveBlock: (sectionId: string, blockId: string, delta: number) => void

  // Pages
  addPage: (at?: number, elements?: PageElement[], templateId?: string) => void
  /** Drop a template's elements onto the page that's already open. */
  applyTemplate: (pageId: string, elements: PageElement[], templateId: string) => void
  duplicatePage: (id: string) => void
  removePage: (id: string) => void
  reorderPage: (fromId: string, toId: string) => void
  selectPage: (id: string) => void

  // Deck
  setDeck: (patch: Partial<Deck>, tag?: string) => void
  setFormat: (format: FormatId) => void

  // Ephemeral — never recorded in history
  select: (ids: string[]) => void
  setTool: (tool: Tool) => void
  beginEdit: (id: string) => void
  endEdit: () => void
}

/**
 * The two helpers every mutator goes through. Keeping the rebuild in one place
 * is what makes the immutability guarantee above hold — and what makes "only the
 * edited page's thumbnail repaints" fall out for free, since untouched sections
 * keep their object identity.
 */
function mapSection(
  deck: Deck,
  id: string,
  fn: (s: StaticSection) => StaticSection,
): Deck {
  return {
    ...deck,
    // Element mutators reach hand-composed sections only. A flowed element has
    // no `Box` to change — editing one means editing its block — so a stray call
    // is a no-op rather than a corrupt document.
    sections: deck.sections.map((s) => (s.id === id && isStatic(s) ? fn(s) : s)),
  }
}

/** The flow-section counterpart of {@link mapSection}. */
function mapFlow(deck: Deck, id: string, fn: (s: FlowSection) => FlowSection): Deck {
  return {
    ...deck,
    sections: deck.sections.map((s) => (s.id === id && isFlow(s) ? fn(s) : s)),
  }
}

function mapElements(
  deck: Deck,
  pgId: string,
  ids: Set<string>,
  fn: (el: PageElement) => PageElement,
): Deck {
  return mapSection(deck, pgId, (p) => ({
    ...p,
    elements: p.elements.map((el) => (ids.has(el.id) ? fn(el) : el)),
  }))
}

const restored = loadSession()
const initial = restored ?? (() => {
  const deck = createDeck()
  return { deck, currentPageId: deckPages(deck)[0].id }
})()

/** True when this session came back from localStorage rather than starting fresh. */
export const sessionRestored = restored !== null

export const useDeck = create<DeckStore>((set, get) => ({
  deck: deepFreeze(initial.deck),
  currentPageId: initial.currentPageId,
  selectedIds: [],
  editingId: null,
  tool: 'pointer',
  past: [],
  future: [],

  undo: () =>
    set((s) => {
      const prev = s.past.at(-1)
      if (!prev) return {}
      applyingHistory = true
      lastTag = null
      return {
        past: s.past.slice(0, -1),
        future: [...s.future, { sections: s.deck.sections, currentPageId: s.currentPageId }],
        deck: { ...s.deck, sections: prev.sections },
        currentPageId: prev.currentPageId,
        // Selection lives outside history; drop anything the undo removed.
        selectedIds: [],
        editingId: null,
      }
    }),

  redo: () =>
    set((s) => {
      const next = s.future.at(-1)
      if (!next) return {}
      applyingHistory = true
      lastTag = null
      return {
        future: s.future.slice(0, -1),
        past: [...s.past, { sections: s.deck.sections, currentPageId: s.currentPageId }],
        deck: { ...s.deck, sections: next.sections },
        currentPageId: next.currentPageId,
        selectedIds: [],
        editingId: null,
      }
    }),

  addElement: (pgId, el, tag = 'element:add') =>
    tagged(tag, () =>
      set((s) => ({
        deck: deepFreeze(
          mapSection(s.deck, pgId, (p) => ({ ...p, elements: [...p.elements, el] })),
        ),
        selectedIds: [el.id],
      })),
    ),

  setElement: (pgId, id, patch, tag) =>
    tagged(tag ?? `element:${id}`, () =>
      set((s) => ({
        deck: deepFreeze(
          mapElements(s.deck, pgId, new Set([id]), (el) => ({ ...el, ...patch }) as PageElement),
        ),
      })),
    ),

  setElementBoxes: (pgId, boxes) =>
    tagged('element:box', () =>
      set((s) => ({
        deck: deepFreeze(
          mapElements(s.deck, pgId, new Set(Object.keys(boxes)), (el) => ({
            ...el,
            box: boxes[el.id],
          })),
        ),
      })),
    ),

  removeElements: (pgId, ids) =>
    tagged('element:remove', () =>
      set((s) => {
        const drop = new Set(ids)
        return {
          deck: deepFreeze(
            mapSection(s.deck, pgId, (p) => ({
              ...p,
              elements: p.elements.filter((el) => !drop.has(el.id)),
            })),
          ),
          selectedIds: s.selectedIds.filter((id) => !drop.has(id)),
          editingId: s.editingId && drop.has(s.editingId) ? null : s.editingId,
        }
      }),
    ),

  duplicateElements: (pgId, ids) =>
    tagged('element:duplicate', () =>
      set((s) => {
        const page = s.deck.sections.find((p) => p.id === pgId)
        if (!page || !isStatic(page)) return {}
        const f = getFormat(s.deck.format)
        const g = grid(f.w, f.h, f.cols, f.rows, f.margin * f.w)
        const pick = new Set(ids)
        const copies = page.elements
          .filter((el) => pick.has(el.id))
          .map((el) => ({
            ...el,
            id: `${el.id}_c${Math.random().toString(36).slice(2, 7)}`,
            box: g.clampBox({ ...el.box, col: el.box.col + 1, row: el.box.row + 1 }),
          }))
        return {
          deck: deepFreeze(
            mapSection(s.deck, pgId, (p) => ({ ...p, elements: [...p.elements, ...copies] })),
          ),
          selectedIds: copies.map((c) => c.id),
        }
      }),
    ),

  reorderElement: (pgId, id, to) =>
    tagged('element:z', () =>
      set((s) => ({
        deck: deepFreeze(
          mapSection(s.deck, pgId, (p) => {
            const from = p.elements.findIndex((el) => el.id === id)
            if (from < 0) return p
            const next = p.elements.slice()
            const [el] = next.splice(from, 1)
            const target =
              to === 'front' ? next.length
              : to === 'back' ? 0
              : to === 'up' ? Math.min(next.length, from + 1)
              : Math.max(0, from - 1)
            next.splice(target, 0, el)
            return { ...p, elements: next }
          }),
        ),
      })),
    ),

  addFlowSection: (preset) =>
    tagged('section:add', () =>
      set((s) => {
        const found = FLOW_PRESETS.find((p) => p.id === preset)
        const section = found ? found.make() : createFlowSection()
        const sections = [...s.deck.sections, section]
        const deck = deepFreeze({ ...s.deck, sections })
        return { deck, currentPageId: deckPages(deck)[0].id, selectedIds: [] }
      }),
    ),

  setBlocks: (sectionId, blocks, tag = 'section:blocks') =>
    tagged(tag, () =>
      set((s) => ({
        deck: deepFreeze(mapFlow(s.deck, sectionId, (sec) => ({ ...sec, blocks }))),
        selectedIds: [],
      })),
    ),

  setBlock: (sectionId, id, patch) =>
    // Tagged per block so a typed sentence collapses into one undo step, the
    // same way editing one element's text does.
    tagged(`block:${id}`, () =>
      set((s) => ({
        deck: deepFreeze(
          mapFlow(s.deck, sectionId, (sec) => ({
            ...sec,
            blocks: sec.blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as Block) : b)),
          })),
        ),
      })),
    ),

  removeBlock: (sectionId, id) =>
    tagged('block:remove', () =>
      set((s) => ({
        deck: deepFreeze(
          mapFlow(s.deck, sectionId, (sec) => ({
            ...sec,
            blocks: sec.blocks.filter((b) => b.id !== id),
            // Repair here, not in the flow engine: the surviving neighbours are
            // known for free at deletion time and gone afterwards.
            overrides: repairAnchors(
              sec.blocks,
              new Set([id]),
              sec.overrides ?? [],
              () => undefined,
            ),
          })),
        ),
      })),
    ),

  addPin: (sectionId, anchorBlockId, element) =>
    tagged('override:pin', () =>
      set((s) => ({
        deck: deepFreeze(
          mapFlow(s.deck, sectionId, (sec) => ({
            ...sec,
            overrides: [
              ...(sec.overrides ?? []),
              {
                kind: 'pin' as const,
                id: overrideId(),
                anchor: { at: 'block' as const, blockId: anchorBlockId },
                element,
                obstruct: 'none' as const,
              },
            ],
          })),
        ),
        selectedIds: [element.id],
      })),
    ),

  setOverrides: (sectionId, overrides) =>
    tagged('override:set', () =>
      set((s) => ({
        deck: deepFreeze(mapFlow(s.deck, sectionId, (sec) => ({ ...sec, overrides }))),
      })),
    ),

  removeOverride: (sectionId, id) =>
    tagged('override:remove', () =>
      set((s) => ({
        deck: deepFreeze(
          mapFlow(s.deck, sectionId, (sec) => ({
            ...sec,
            overrides: (sec.overrides ?? []).filter((o) => o.id !== id),
          })),
        ),
      })),
    ),

  moveBlock: (sectionId, id, delta) =>
    tagged('block:move', () =>
      set((s) => ({
        deck: deepFreeze(
          mapFlow(s.deck, sectionId, (sec) => {
            const from = sec.blocks.findIndex((b) => b.id === id)
            const to = from + delta
            if (from < 0 || to < 0 || to >= sec.blocks.length) return sec
            const blocks = sec.blocks.slice()
            const [moved] = blocks.splice(from, 1)
            blocks.splice(to, 0, moved)
            return { ...sec, blocks }
          }),
        ),
      })),
    ),

  addPage: (at, elements = [], templateId) =>
    tagged('page:add', () =>
      set((s) => {
        const page = createSection(elements, templateId)
        const index = at ?? s.deck.sections.findIndex((p) => p.id === s.currentPageId) + 1
        const sections = s.deck.sections.slice()
        sections.splice(index, 0, page)
        return {
          deck: deepFreeze({ ...s.deck, sections }),
          currentPageId: page.id,
          selectedIds: [],
        }
      }),
    ),

  applyTemplate: (pgId, elements, templateId) =>
    tagged('page:template', () =>
      set((s) => ({
        // Replaces the page's contents: a template is a starting composition,
        // not a layer to stack onto whatever was already there.
        deck: deepFreeze(mapSection(s.deck, pgId, (p) => ({ ...p, elements, templateId }))),
        selectedIds: [],
        editingId: null,
      })),
    ),

  duplicatePage: (id) =>
    tagged('page:duplicate', () =>
      set((s) => {
        const index = s.deck.sections.findIndex((p) => p.id === id)
        const source = s.deck.sections[index]
        if (index < 0 || !isStatic(source)) return {}
        // Elements are copied with fresh ids; image *references* are shared, so
        // the duplicate reuses the same decode rather than loading it again.
        const copy: StaticSection = {
          ...source,
          id: pageId(),
          elements: source.elements.map((el) => ({
            ...el,
            id: `${el.id}_c${Math.random().toString(36).slice(2, 7)}`,
          })),
        }
        const sections = s.deck.sections.slice()
        sections.splice(index + 1, 0, copy)
        return { deck: deepFreeze({ ...s.deck, sections }), currentPageId: copy.id, selectedIds: [] }
      }),
    ),

  removePage: (id) =>
    tagged('page:remove', () =>
      set((s) => {
        if (s.deck.sections.length <= 1) return {} // never leave a deck with no pages
        const index = s.deck.sections.findIndex((p) => p.id === id)
        const sections = s.deck.sections.filter((p) => p.id !== id)
        const currentPageId =
          s.currentPageId === id ? sections[Math.min(index, sections.length - 1)].id : s.currentPageId
        return { deck: deepFreeze({ ...s.deck, sections }), currentPageId, selectedIds: [] }
      }),
    ),

  reorderPage: (fromId, toId) =>
    tagged('page:reorder', () =>
      set((s) => {
        const from = s.deck.sections.findIndex((p) => p.id === fromId)
        const to = s.deck.sections.findIndex((p) => p.id === toId)
        if (from < 0 || to < 0 || from === to) return {}
        const sections = s.deck.sections.slice()
        const [moved] = sections.splice(from, 1)
        sections.splice(to, 0, moved)
        return { deck: deepFreeze({ ...s.deck, sections }) }
      }),
    ),

  selectPage: (id) =>
    tagged(null, () => set({ currentPageId: id, selectedIds: [], editingId: null })),

  setDeck: (patch, tag) =>
    tagged(tag ?? 'deck:set', () =>
      set((s) => ({ deck: deepFreeze({ ...s.deck, ...patch }) })),
    ),

  setFormat: (format) =>
    tagged('deck:format', () =>
      set((s) => {
        if (s.deck.format === format) return {}
        const from = getFormat(s.deck.format)
        const to = getFormat(format)
        const sx = to.cols / from.cols
        const sy = to.rows / from.rows
        const g = grid(to.w, to.h, to.cols, to.rows, to.margin * to.w)
        // Proportional remap of hand-placed boxes. Lossy for tight
        // compositions — the UI gates this behind a confirmation. Flow sections
        // need nothing: their geometry is derived, so they simply re-typeset
        // into the new format.
        const sections = s.deck.sections.map((p) =>
          !isStatic(p)
            ? p
            : {
                ...p,
                elements: p.elements.map((el) => ({
                  ...el,
                  box: g.clampBox({
                    col: Math.round(el.box.col * sx),
                    row: Math.round(el.box.row * sy),
                    colSpan: Math.max(1, Math.round(el.box.colSpan * sx)),
                    rowSpan: Math.max(1, Math.round(el.box.rowSpan * sy)),
                  }),
                })),
              },
        )
        return { deck: deepFreeze({ ...s.deck, format, sections }) }
      }),
    ),

  select: (ids) => tagged(null, () => set({ selectedIds: ids })),
  setTool: (tool) => tagged(null, () => set({ tool })),
  beginEdit: (id) => tagged(null, () => set({ editingId: id, selectedIds: [id] })),
  endEdit: () =>
    tagged(null, () => {
      endCoalesce()
      // Read the id *before* clearing it. Clearing first made the lookup below
      // compare against null, so the cleanup never ran and every mis-click with
      // the text tool left an invisible, selectable, persisted empty box behind.
      const editedId = get().editingId
      set({ editingId: null })
      if (!editedId) return
      // A text element left empty is litter from a stray click — drop it.
      const s = get()
      const page = s.deck.sections.find((p) => p.id === s.currentPageId)
      if (!page || !isStatic(page)) return
      const empty = page.elements.find(
        (el) => el.id === editedId && el.kind === 'text' && !el.text.trim(),
      )
      if (empty) s.removeElements(page.id, [empty.id])
    }),
}))

// --- History recorder -------------------------------------------------------
// Records the state from *before* an edit, so an entry is exactly "what it
// looked like beforehand". Runs of the same tag inside the coalesce window
// extend the current step rather than adding another.

useDeck.subscribe((s, prev) => {
  if (s.deck.sections === prev.deck.sections) {
    pendingTag = null
    return // selection / edit-mode changes are not edits
  }
  if (applyingHistory) {
    applyingHistory = false
    pendingTag = null
    return
  }
  const t = pendingTag
  pendingTag = null
  if (t === null) return

  const now = Date.now()
  const coalesce = t === lastTag && now - lastAt < COALESCE_MS && s.past.length > 0
  lastTag = t
  lastAt = now
  if (coalesce) return

  const past = [...s.past, { sections: prev.deck.sections, currentPageId: prev.currentPageId }]
  useDeck.setState({
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    future: [], // a fresh edit invalidates anything that was undone
  })
})

// --- Persistence ------------------------------------------------------------

let saveTimer: ReturnType<typeof setTimeout> | undefined
useDeck.subscribe((s, prev) => {
  if (s.deck === prev.deck && s.currentPageId === prev.currentPageId) return
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveSession(s.deck, s.currentPageId), 400)
})

/** Drop stored uploads no page points at any more. Safe to call repeatedly. */
export function pruneImages(): Promise<void> {
  return pruneImageBlobs(collectBlobIds(useDeck.getState().deck))
}

/** The page currently open in the editor. */
export function useCurrentPage(): RenderPage {
  return useDeck(
    (s) => deckPages(s.deck).find((p) => p.id === s.currentPageId) ?? deckPages(s.deck)[0],
  )
}
