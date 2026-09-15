import { create } from 'zustand'

/**
 * Chrome state: what is open, not what is in the document.
 *
 * Deliberately not part of `useDeck`. That store's every mutator runs through
 * `commit`, which snapshots the whole document onto the undo stack and schedules
 * a save — and opening the panel is neither an edit nor something anyone would
 * want to undo. `insertAt` and the block selection do live there, because they
 * are positions *in* the document; this is not.
 */
export type Theme = 'dark' | 'light'

/**
 * The one thing in this store that outlives the tab.
 *
 * Everything else here is "what is open right now" and should not be: a panel
 * that remembered it was closed would hide the editor from someone who had
 * forgotten they closed it. A theme is the opposite — it is a statement about
 * the person, not about this visit, and re-picking it every morning is the bug.
 *
 * Read and written by hand rather than through zustand's `persist` middleware,
 * because two keys out of five want persisting and wrapping the whole store to
 * exclude three of them is more machinery than the feature is worth.
 */
const KEY = 'lehub.report.ui'

interface Persisted {
  theme: Theme
  gridOpen: boolean
}

const DEFAULTS: Persisted = { theme: 'dark', gridOpen: false }

function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULTS
    const saved = JSON.parse(raw) as Partial<Persisted>
    return {
      theme: saved.theme === 'light' || saved.theme === 'dark' ? saved.theme : DEFAULTS.theme,
      gridOpen: typeof saved.gridOpen === 'boolean' ? saved.gridOpen : DEFAULTS.gridOpen,
    }
  } catch {
    // A refused or unparseable localStorage is not a reason to fail to start.
    return DEFAULTS
  }
}

function save(next: Persisted): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // Private browsing, or a full quota. The preference is lost on reload,
    // which is survivable; throwing here would not be.
  }
}

/**
 * Put the theme where CSS can see it.
 *
 * `index.css` keys off `[data-theme="light"]` on the root element, so this is
 * the whole of applying a theme — no class lists to keep in step, and the
 * attribute is set before first paint by {@link initUi}.
 */
function apply(theme: Theme): void {
  document.documentElement.dataset.theme = theme
}

interface UiState {
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
  /** Dark (the original chrome) or light. Persisted. */
  theme: Theme
  setTheme(theme: Theme): void
  toggleTheme(): void
  /**
   * The column guides over the page. Persisted, because someone who works to
   * the grid works to it on every document.
   *
   * Note that the guides also show *during a drag* regardless of this, which is
   * what makes the grid discoverable without anyone having to turn it on.
   */
  gridOpen: boolean
  setGridOpen(open: boolean): void
  toggleGrid(): void
}

const initial = load()

export const useUi = create<UiState>()((set, get) => ({
  panelOpen: false,
  setPanelOpen: (panelOpen) => set({ panelOpen }),

  theme: initial.theme,
  setTheme: (theme) => {
    apply(theme)
    save({ theme, gridOpen: get().gridOpen })
    set({ theme })
  },
  toggleTheme: () => get().setTheme(get().theme === 'dark' ? 'light' : 'dark'),

  gridOpen: initial.gridOpen,
  setGridOpen: (gridOpen) => {
    save({ theme: get().theme, gridOpen })
    set({ gridOpen })
  },
  toggleGrid: () => get().setGridOpen(!get().gridOpen),
}))

/**
 * Stamp the stored theme onto the document.
 *
 * Called from `main.tsx` before React mounts, so the first paint is already in
 * the right theme rather than flashing the default and correcting itself.
 */
export function initUi(): void {
  apply(initial.theme)
}
