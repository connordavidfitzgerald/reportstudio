import { create } from 'zustand'

/**
 * Chrome state: what is open, not what is in the document.
 *
 * Deliberately not part of `useDeck`. That store's every mutator runs through
 * `commit`, which snapshots the whole document onto the undo stack and schedules
 * a save — and opening a thumbnail strip is neither an edit nor something anyone
 * would want to undo. `insertAt` and the block selection do live there, because
 * they are positions *in* the document; this is not.
 */
interface UiState {
  /** The spread thumbnails, over the foot of the canvas. */
  pagesOpen: boolean
  setPagesOpen(open: boolean): void
  /**
   * The panel, when the window is too narrow to give it a column of its own.
   *
   * At full width the panel is always there and this is ignored; below the
   * breakpoint it slides over the stage instead of squeezing it, because a
   * 228px panel out of a 700px window is a third of the page you came to look
   * at.
   */
  panelOpen: boolean
  setPanelOpen(open: boolean): void
}

export const useUi = create<UiState>()((set) => ({
  pagesOpen: false,
  setPagesOpen: (pagesOpen) => set({ pagesOpen }),
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),
}))
