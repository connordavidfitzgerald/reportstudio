import { useEffect, useRef, useState } from 'react'
import { CONTENT_BOTTOM, PAGE_H, PAGE_W, RUNNING_HEAD_Y, SPREAD_W } from '../config/brand'
import { useImageCache } from '../doc/imageCache'
import type { Block } from '../doc/blocks'
import { BLOCK_LABELS } from '../doc/defaults'
import type { Deck, Leaf } from '../doc/types'
import { deckSpreads } from '../doc/types'
import { renderLeaf } from '../render/leaf'
import type { PlacedBlock, RenderAssets, TextRegion } from '../render/compose'
import { useContainFit } from '../hooks/useContainFit'
import { useDismiss } from '../hooks/useDismiss'
import { useFontsReady } from '../hooks/useFontsReady'
import { useRenderAssets } from '../hooks/useRenderAssets'
import { useDeck } from '../store/useDeck'
import { useUi } from '../store/useUi'
import { InlineEditor } from './InlineEditor'
import { fieldText } from '../doc/fieldValue'
import { offsetFromPoint, wordAt } from './canvas/textOverlay'
import { TextToolbar } from './canvas/TextToolbar'
import { GridGuides } from './canvas/GridGuides'
import { pageWidthPt, useBlockDrag, type Placement } from './canvas/useBlockDrag'
import { BlockEditor } from './blocks'
import { ComponentList } from './panel/ComponentList'
import { hasBlockSettings } from './blocks/settings'

/**
 * The spread view.
 *
 * Two A4 leaves side by side, which is how the document was designed and how it
 * will be read. The cover is the exception: one canvas across the full 1190.
 *
 * ## Why the sizing is done in JS
 *
 * A canvas has an intrinsic size (its backing store) *and* a CSS size, and
 * letting CSS scale the first to the second is what makes canvas text look
 * soft: on a 2× display, a 595-wide backing store painted into ~1040 device
 * pixels is being upscaled by nearly two, so every stem is resampled.
 *
 * So the size is decided first — by {@link useContainFit}, from the space the
 * stage actually has — and the backing store is then sized to match it *in
 * device pixels*. Text is rasterised at exactly the resolution it will be
 * displayed at, which is the only way it comes out crisp. It also means zooming
 * the browser or dragging the window re-renders at the new resolution rather
 * than resampling.
 *
 * ## The one number
 *
 * Everything below derives from `devicePx`, a single rounded integer: the
 * backing store is that wide, the CSS box is `devicePx / dpr`, and the caret's
 * textarea sets type at `size × devicePx / dpr / leafPt`. They agree only
 * because they all come from that integer. Compute any of them independently —
 * from the element's own measured width, say — and the caret drifts off the
 * glyphs the moment a rounding lands differently.
 *
 * ## Why the page is clickable
 *
 * The compositor has always returned where it put every block — `renderLeaf`
 * hands back a {@link PlacedBlock} per component — and this view used to throw
 * that away, which left a person hunting through a list in the sidebar for the
 * thing they were already looking at.
 *
 * Those rects become an overlay of hit targets, expressed as percentages of the
 * backing store so they survive every resize without being recomputed.
 *
 * ## Dragging still adds no coordinates
 *
 * Blocks *can* now be dragged, and this remains true: a vertical drag resolves
 * to an index in `leaf.blocks` and a horizontal one to the `col`/`span` the
 * block has always had. Nothing is written to the document that was not already
 * expressible in it, and the compositor still decides every vertical position.
 * See `canvas/useBlockDrag.ts` for the gesture, which lives entirely outside
 * `useDeck` so that one drag is one undo.
 */

interface LeafCanvasProps {
  leaf: Leaf
  index: number
  deck: Deck
  assets: RenderAssets
  ready: boolean
  selected: boolean
  onSelect: () => void
  /** Backing-store width, in device pixels. The number everything derives from. */
  devicePx: number
  /** Backing-store height, rounded once here so the painter and the box agree. */
  devicePxH: number
  /** CSS pixels per design point — what the inline editor sets type at. */
  editorScale: number
  dpr: number
}

/**
 * The one control on a selected block.
 *
 * ## What was here before
 *
 * A pill of five round buttons floating above every selected component: move
 * up, move down, duplicate, a `⋯` for the fields that weren't typeable, and
 * remove. It was the busiest thing on the page and it sat, by construction,
 * directly over the words you were trying to read.
 *
 * Four of the five are gone rather than moved:
 *
 *   ↑ ↓   are a drag now, which is the gesture people reach for first anyway.
 *         ⌘⌥↑ and ⌘⌥↓ do it from the keyboard.
 *   ⧉     is ⌘D.
 *   ×     is Backspace, which `App.tsx` already handled — the button was
 *         duplicating a key that worked.
 *
 * What is left is the one thing with nowhere else to go: the settings a
 * component has that are not words on the page. And it only appears on the
 * components that *have* any — `hasBlockSettings` — so a paragraph is now
 * selected with no chrome on it at all.
 */
function BlockSettings({ block }: { block: Block }) {
  const [open, setOpen] = useState(false)
  const anchor = useRef<HTMLDivElement>(null)

  return (
    <div ref={anchor} onClick={(e) => e.stopPropagation()} className="pointer-events-auto relative">
      <button
        type="button"
        title={`${BLOCK_LABELS[block.kind]} settings`}
        aria-label={`${BLOCK_LABELS[block.kind]} settings`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-6 w-6 items-center justify-center rounded-full transition
          ${open ? 'bg-select text-white' : 'bg-select/90 text-white hover:bg-select'}`}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
          <circle cx="6.5" cy="6.5" r="2" stroke="currentColor" strokeWidth="1.3" />
          <path
            d="M6.5 1v1.6M6.5 10.4V12M1 6.5h1.6M10.4 6.5H12M2.6 2.6l1.1 1.1M9.3 9.3l1.1 1.1M10.4 2.6L9.3 3.7M3.7 9.3l-1.1 1.1"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {open && <BlockFields boundary={anchor} block={block} onClose={() => setOpen(false)} />}
    </div>
  )
}

/** The per-component settings, in a card anchored to the block's own corner. */
function BlockFields({
  boundary,
  block,
  onClose,
}: {
  /** The control too, so pressing it again closes rather than reopens. */
  boundary: React.RefObject<HTMLDivElement | null>
  block: Block
  onClose: () => void
}) {
  useDismiss(boundary, onClose)
  return (
    <div className="absolute right-0 top-full z-40 mt-1.5 flex w-64 flex-col gap-2.5 rounded-card bg-card p-4">
      <div className="flex items-center justify-between">
        <span className="text-2xs leading-none text-dim">{BLOCK_LABELS[block.kind]}</span>
        <button
          type="button"
          onClick={onClose}
          className="text-2xs leading-none text-dim transition hover:text-ink"
        >
          Done
        </button>
      </div>
      <BlockEditor block={block} />
    </div>
  )
}

/**
 * A preview of the block at the position it would take.
 *
 * Its size comes from the geometry the source page registered, so the ghost is
 * the block's real width and height rather than a guess — which matters because
 * the whole question a vertical drag now answers is "does it fit there".
 */
function DropGhost({
  target,
  blockId,
  width,
  height,
}: {
  target: Placement
  blockId: string
  width: number
  height: number
}) {
  const geom = useBlockDrag((s) => s.geom)
  const pct = (v: number, of: number) => `${(v / of) * 100}%`

  const source = Object.values(geom)
    .flatMap((g) => g.placed)
    .find((p) => p.block.id === blockId)
  if (!source) return null

  return (
    <div
      style={{
        left: pct(source.rect.x, width),
        top: pct(target.topPx, height),
        width: pct(source.rect.w, width),
        height: pct(Math.max(source.rect.h, height * 0.004), height),
      }}
      className="pointer-events-none absolute z-20 border border-dashed border-select bg-select/10"
    />
  )
}

/**
 * The two grips that set a block's width, on the column lines.
 *
 * The Width/Position menu still exists and still names the four runs the design
 * actually uses — "Inset", "Outer column" — because those are editorial ideas
 * with names, not just geometry. These are for the run that has no name: you
 * pull the edge and it stops on column lines, so the result is always on the
 * grid whether or not you were thinking about the grid.
 */
function ColumnHandles({
  block,
  rect,
  width,
  height,
  leafIndex,
  onBegin,
}: {
  block: Block
  rect: { x: number; y: number; w: number; h: number }
  width: number
  height: number
  leafIndex: number
  onBegin: ReturnType<typeof useBlockDrag.getState>['begin']
}) {
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  const col0 = block.col ?? 0
  const span0 = block.span ?? 9 - col0

  const grip = (edge: 'left' | 'right') => (
    <button
      key={edge}
      type="button"
      title={edge === 'left' ? 'Drag to the column it should start on' : 'Drag to the column it should end on'}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.stopPropagation()
        onBegin({
          blockId: block.id,
          fromLeaf: leafIndex,
          mode: 'resize',
          edge,
          col0,
          span0,
          startX: e.clientX,
          startY: e.clientY,
          // A resize never moves the block vertically, so this is unused.
          grabDY: 0,
        })
      }}
      onClick={(e) => e.stopPropagation()}
      style={{
        left: pct(edge === 'left' ? rect.x : rect.x + rect.w, width),
        top: pct(rect.y + rect.h / 2, height),
      }}
      className="pointer-events-auto absolute h-4 w-1.5 -translate-x-1/2 -translate-y-1/2
        cursor-ew-resize rounded-full bg-select"
    />
  )

  return (
    <>
      {grip('left')}
      {grip('right')}
    </>
  )
}

/**
 * The hit layer.
 *
 * Percentages rather than pixels: the rects come out of the compositor in
 * backing-store units, and the element they sit on is the same shape, so the
 * ratio holds at any zoom and the layer never needs re-measuring.
 */
function HitLayer({
  placed,
  regions,
  width,
  height,
  scale,
  leafIndex,
  active,
  overflowFrom,
}: {
  placed: PlacedBlock[]
  /** Every run of words on this page, as the painter placed it. */
  regions: TextRegion[]
  width: number
  height: number
  /** CSS pixels per design point — what the inline editor sets type at. */
  scale: number
  /** Which leaf this layer belongs to, for the caret it puts in the store. */
  leafIndex: number
  /** False for the facing page — only the page being edited takes clicks. */
  active: boolean
  /** Index of the first block that runs past the foot of the page, if any. */
  overflowFrom: number | null
}) {
  const selectedBlock = useDeck((s) => s.selectedBlock)
  const lang = useDeck((s) => s.deck.lang)
  const insertAt = useDeck((s) => s.insertAt)
  const selectBlock = useDeck((s) => s.selectBlock)
  const selectLeaf = useDeck((s) => s.selectLeaf)
  const setInsertAt = useDeck((s) => s.setInsertAt)
  // The caret lives in the store rather than here, because the toolbar that
  // acts on it sits above the page as a sibling of this layer. That also
  // retires the two effects this component used to need to clear the caret when
  // the selection moved: everything that moves it clears the caret at source.
  const caret = useDeck((s) => s.caret)
  const setCaret = useDeck((s) => s.setCaret)
  const [hover, setHover] = useState<string | null>(null)
  const editRequest = useDeck((s) => s.editRequest)
  const requestEdit = useDeck((s) => s.requestEdit)
  const begin = useBlockDrag((s) => s.begin)
  const consumeSuppress = useBlockDrag((s) => s.consumeSuppress)
  const drag = useBlockDrag((s) => s.drag)

  // Enter on a selected component asks for a caret in it, and this is where
  // the ask becomes an answer: the block's first painted region. It runs after
  // paint, so a block that has just been added is typeable on the keystroke
  // rather than on the one after.
  useEffect(() => {
    if (!active || !editRequest) return
    const region = regions.find((r) => r.blockId === editRequest)
    if (!region) return
    // Return on a selected component takes the whole field, the way Return on a
    // selected text object does in a slide editor: there was no pointer to say
    // where in the words the caret should go, and somebody who pressed a key to
    // start typing usually means to replace what is there.
    const block = placed.find((p) => p.block.id === editRequest)?.block
    const text = block ? fieldText(block, region.path, lang) : ''
    setCaret({
      leafIndex,
      blockId: editRequest,
      path: region.path.join('.'),
      from: 0,
      to: text.length,
    })
    requestEdit(null)
  }, [active, editRequest, regions, placed, lang, leafIndex, setCaret, requestEdit])

  if (!width || !height) return null
  const pct = (v: number, of: number) => `${(v / of) * 100}%`
  /** A block's clickable height: its own, or {@link MIN_HIT_PT}, whichever is more. */
  const hitH = (h: number, of: number) => Math.max(h, of * (MIN_HIT_PT / PAGE_H))

  // Matched by ids rather than by holding the region object: regions are
  // rebuilt on every repaint, so a stored one would pin a stale rect.
  const editingRegion =
    (active &&
      caret &&
      regions.find((r) => r.blockId === caret.blockId && r.path.join('.') === caret.path)) ||
    null
  const editingBlock = placed.find((p) => p.block.id === editingRegion?.blockId)?.block ?? null

  /** The field under a click, or the block's first one. */
  const regionAt = (blockId: string, x: number, y: number): TextRegion | null => {
    const mine = regions.filter((r) => r.blockId === blockId)
    const hit = mine.find(
      (r) => x >= r.rect.x && x <= r.rect.x + r.rect.w && y >= r.rect.y && y <= r.rect.y + r.rect.h,
    )
    return hit ?? mine[0] ?? null
  }

  /** Turn a pointer event into backing-store coordinates on this page. */
  const pointOn = (e: React.MouseEvent): { x: number; y: number } => {
    const layer = e.currentTarget.closest('[data-leaf]') as HTMLElement | null
    const box = (layer ?? e.currentTarget).getBoundingClientRect()
    return {
      x: ((e.clientX - box.left) / box.width) * width,
      y: ((e.clientY - box.top) / box.height) * height,
    }
  }

  /**
   * Put a caret in the words that were clicked — in the field, and at the
   * character.
   *
   * The field was always right; the character never was. A click anywhere in a
   * paragraph opened the editor with the caret at the *end* of it, so the first
   * thing you typed after clicking on the word you meant to fix appeared
   * somewhere else entirely. Nothing about a canvas can answer "which
   * character is under this point", so {@link offsetFromPoint} lays the same
   * string out in a throwaway element and asks the browser.
   */
  const startEditing = (blockId: string, e: React.MouseEvent) => {
    const { x, y } = pointOn(e)
    const region = regionAt(blockId, x, y)
    if (!region) return
    const block = placed.find((p) => p.block.id === blockId)?.block
    const host = (e.currentTarget as HTMLElement).closest('[data-leaf]') as HTMLElement | null
    const text = block ? fieldText(block, region.path, lang) : ''
    const at =
      host && text
        ? offsetFromPoint({
            host,
            region,
            scale,
            canvas: { w: width, h: height },
            text,
            clientX: e.clientX,
            clientY: e.clientY,
          })
        : text.length
    // A double-click takes the word, the way it does in any text field. The
    // gesture arrives here as the second click of the pair — `e.detail` is what
    // says which click it is — so there is no separate handler to keep in step.
    const { from, to } = e.detail >= 2 ? wordAt(text, at) : { from: at, to: at }
    setCaret({ leafIndex, blockId, path: region.path.join('.'), from, to })
  }

  /**
   * Clicking a component is also asking to be on its page.
   *
   * Both leaves of a spread are on screen at once, so "select the page, then
   * select the thing" is a step the interface invents for itself: you can see
   * what you want to click. Without this, clicking a paragraph on the facing
   * page selected it but left the *other* page current — and since only the
   * current page takes a caret, double-clicking to type did nothing at all.
   *
   * `selectLeaf` clears the block selection and the caret, so the block has to
   * be re-selected after it rather than before.
   */
  const focusHere = (blockId: string) => {
    if (active) return false
    selectLeaf(leafIndex)
    selectBlock(blockId)
    return true
  }

  return (
    <div className="pointer-events-none absolute inset-0">
      {placed.map(({ block, rect }, i) => {
        const isSelected = block.id === selectedBlock
        const isHover = block.id === hover
        const typeable = regions.some((r) => r.blockId === block.id)
        const isEditing = editingRegion?.blockId === block.id
        const isDragging = drag?.blockId === block.id && drag.mode !== 'pending'
        const spilt = overflowFrom !== null && i >= overflowFrom
        return (
          <div key={block.id}>
            <button
              type="button"
              title={typeable ? `${BLOCK_LABELS[block.kind]} — click again to type` : BLOCK_LABELS[block.kind]}
              onMouseEnter={() => setHover(block.id)}
              onMouseLeave={() => setHover((h) => (h === block.id ? null : h))}
              // A press is only a drag once it has travelled far enough to mean
              // one — until then it is still the click it started as. The
              // threshold lives in the store; see `useBlockDrag`.
              onPointerDown={(e) => {
                if (e.button !== 0) return
                // Where on the block it was picked up, so it tracks the pointer
                // from there instead of snapping its own top to the cursor.
                const box = e.currentTarget.getBoundingClientRect()
                begin({
                  blockId: block.id,
                  fromLeaf: leafIndex,
                  col0: block.col ?? 0,
                  span0: block.span ?? 9 - (block.col ?? 0),
                  startX: e.clientX,
                  startY: e.clientY,
                  grabDY: e.clientY - box.top,
                })
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                focusHere(block.id)
                if (typeable) startEditing(block.id, e)
              }}
              onClick={(e) => {
                e.stopPropagation()
                // The click a finished drag leaves behind would otherwise
                // deselect the block that was just dragged.
                if (consumeSuppress()) return
                // Coming from the facing page, the click is spent arriving:
                // the page and the component are now selected, and the next
                // click puts the caret in — the same two-step it takes on a
                // page you were already on.
                if (focusHere(block.id)) return
                // First click selects; a second click on something already
                // selected puts a caret in the field you clicked, the way a
                // slide editor does.
                if (isSelected && typeable) startEditing(block.id, e)
                else selectBlock(isSelected ? null : block.id)
              }}
              style={{
                left: pct(rect.x, width),
                top: pct(rect.y - (hitH(rect.h, height) - rect.h) / 2, height),
                width: pct(rect.w, width),
                height: pct(hitH(rect.h, height), height),
              }}
              className={`pointer-events-auto absolute cursor-pointer transition-[outline-color]
                ${isDragging ? 'opacity-40' : ''}
                ${
                  isEditing
                    ? // The caret's own outline is the strong one while typing.
                      // A component holding several fields still shows where it
                      // ends, but quietly, so the two don't compete.
                      'outline outline-1 outline-select/30'
                    : isSelected
                      ? 'outline outline-2 outline-select'
                      : // Past the foot of the page. Shown under hover and
                        // selection, which are about what you are doing; this
                        // is about what is wrong, and it is still wrong while
                        // you are doing something else.
                        spilt
                        ? 'outline outline-1 outline-dashed outline-danger'
                        : isHover
                          ? 'outline outline-1 outline-black/40'
                          : 'outline outline-1 outline-transparent'
                }`}
            />

            {isSelected && active && (
              <ColumnHandles
                block={block}
                rect={rect}
                width={width}
                height={height}
                leafIndex={leafIndex}
                onBegin={begin}
              />
            )}

            {/* The settings control, on the block's top-right corner and only
              * where there is anything behind it. Outside the block rather than
              * over it, so it never covers the words it belongs to. */}
            {isSelected && active && hasBlockSettings(block.kind) && (
              <div
                style={{
                  left: pct(rect.x + rect.w, width),
                  top: pct(rect.y, height),
                  transform: rect.y / height < 0.04 ? 'translate(-4px, 4px)' : 'translate(-4px, -28px)',
                }}
                className="pointer-events-none absolute"
              >
                <BlockSettings block={block} />
              </div>
            )}

            {/* Insert above this block. The last boundary is added below. */}
            <InsertHere
              at={i}
              armed={insertAt === i}
              onArm={setInsertAt}
              style={{ left: pct(rect.x, width), top: pct(rect.y, height), width: pct(rect.w, width) }}
              enabled={active}
            />
          </div>
        )
      })}

      {placed.length > 0 && (
        <InsertHere
          at={placed.length}
          armed={insertAt === placed.length}
          onArm={setInsertAt}
          style={{
            left: pct(placed[placed.length - 1].rect.x, width),
            top: pct(
              placed[placed.length - 1].rect.y + placed[placed.length - 1].rect.h,
              height,
            ),
            width: pct(placed[placed.length - 1].rect.w, width),
          }}
          enabled={active}
        />
      )}

      {/* Where the block would land, drawn as the block. A hairline between two
        * components was the right preview when a drag could only reorder; now
        * that it also decides how far down the page the block sits, the honest
        * preview is its own outline at its own size. Drawn on whichever page the
        * pointer is over, which may not be the one it started on. */}
      {drag?.mode === 'reorder' && drag.target?.leafIndex === leafIndex && (
        <DropGhost target={drag.target} blockId={drag.blockId} width={width} height={height} />
      )}

      {/* Last, so the caret sits above every hit target and insert strip. */}
      {editingBlock && editingRegion && (
        <InlineEditor
          block={editingBlock}
          region={editingRegion}
          scale={scale}
          canvas={{ w: width, h: height }}
          onClose={() => setCaret(null)}
        />
      )}
    </div>
  )
}

/**
 * A hairline between two components that adds a third.
 *
 * `addBlock` has always taken an index and never been passed one, so every
 * component landed at the bottom of the page and had to be walked up with the
 * arrows. This is that index, as a place on the page.
 */
function InsertHere({
  at,
  armed,
  onArm,
  style,
  enabled,
}: {
  at: number
  armed: boolean
  onArm: (at: number | null) => void
  style: React.CSSProperties
  enabled: boolean
}) {
  const anchor = useRef<HTMLDivElement>(null)
  if (!enabled) return null
  return (
    <div ref={anchor} style={{ ...style, transform: 'translateY(-6px)' }} className="absolute">
      <button
        type="button"
        title="Add a component here"
        onClick={(e) => {
          e.stopPropagation()
          onArm(armed ? null : at)
        }}
        className="pointer-events-auto group relative flex h-3 w-full cursor-pointer items-center justify-center"
      >
        <span
          className={`h-px w-full transition-colors ${armed ? 'bg-select' : 'bg-transparent group-hover:bg-select'}`}
        />
        <span
          className={`absolute flex h-4 w-4 items-center justify-center border text-[10px] leading-none transition
            ${armed ? 'border-select bg-select text-white' : 'border-transparent bg-transparent text-transparent group-hover:border-select group-hover:bg-white group-hover:text-select'}`}
        >
          +
        </span>
      </button>

      {/* The palette, here, rather than a slot armed on the page and a list to
        * go and find in the panel. */}
      {armed && <InsertPalette boundary={anchor} onClose={() => onArm(null)} />}
    </div>
  )
}

/** The component palette, at the place on the page it will insert into. */
function InsertPalette({
  boundary,
  onClose,
}: {
  boundary: React.RefObject<HTMLDivElement | null>
  onClose: () => void
}) {
  useDismiss(boundary, onClose)
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute left-1/2 top-3 z-40 w-60 -translate-x-1/2
        rounded-card bg-card p-4"
    >
      <ComponentList onPick={onClose} />
    </div>
  )
}

function LeafCanvas({
  leaf,
  index,
  deck,
  assets,
  ready,
  selected,
  onSelect,
  devicePx,
  devicePxH,
  editorScale,
  dpr,
}: LeafCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const leafEl = useRef<HTMLDivElement>(null)
  const imageVersion = useImageCache()
  const [placed, setPlaced] = useState<PlacedBlock[]>([])
  // Where the flow starts on this page, which is not the first block's top once
  // anything has been dragged. The drag resolver needs it to know how far up a
  // block may be dropped.
  const [origin, setOrigin] = useState(0)
  const [regions, setRegions] = useState<TextRegion[]>([])
  const addBlock = useDeck((s) => s.addBlock)
  const requestEdit = useDeck((s) => s.requestEdit)
  const register = useBlockDrag((s) => s.register)
  const forget = useBlockDrag((s) => s.forget)
  const drag = useBlockDrag((s) => s.drag)
  const gridOpen = useUi((s) => s.gridOpen)
  const pageWpt = pageWidthPt(leaf.full)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas || !ready || !devicePx) return
    canvas.width = devicePx
    canvas.height = devicePxH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingQuality = 'high'
    const result = renderLeaf(ctx, leaf, deck, devicePx, assets, { index, regions: true })
    canvas.dataset.overflow = result.overflow ? 'true' : 'false'
    setPlaced(result.placed)
    setOrigin(result.origin)
    setRegions(result.regions)
  }, [leaf, deck, assets, ready, index, imageVersion, devicePx, devicePxH])

  // Publish what was painted, so a drag that ends over this page can work out
  // which boundary it ended on. Registered after every repaint rather than once
  // on mount: the rects are what changed.
  useEffect(() => {
    const el = leafEl.current
    if (!el || !devicePx) return
    register(index, { placed, width: devicePx, height: devicePxH, pageWpt, origin, el })
    return () => forget(index)
  }, [register, forget, index, placed, origin, devicePx, devicePxH, pageWpt])

  /**
   * The first block that falls past the page's foot, if any.
   *
   * The overflow was reported only in the side panel, as a sentence naming the
   * component. It is a fact about a *place on the page*, so it is also shown
   * there — the blocks that have run off get a warning outline, and you can see
   * which ones without reading anything. The panel note stays, because it
   * carries the two fixes (show it, set the text smaller) and a marker cannot.
   */
  const overflowFrom = (() => {
    if (!placed.length || !devicePxH) return null
    // A bare plate has no foot rule to respect: its band and credit run to the
    // trim. Same rule as `paintBlocks`.
    const bottomPt = leaf.bare ? PAGE_H - RUNNING_HEAD_Y : CONTENT_BOTTOM
    const bottom = devicePxH * (bottomPt / PAGE_H)
    const at = placed.findIndex((p) => p.rect.y + p.rect.h > bottom + 0.5)
    return at < 0 ? null : at
  })()

  // The CSS box is the backing store divided back down, never an independent
  // measurement — see the header. Both axes come from the two integers the
  // painter was given, so the page cannot be stretched on one of them.
  const cssW = devicePx / dpr
  const cssH = devicePxH / dpr

  // The guides show when they are switched on, and *also* for the length of a
  // drag. That second half is what makes the grid discoverable: you find out
  // the page has columns at the exact moment you are trying to put something in
  // one, without having had to know there was a setting.
  const guides = gridOpen || !!drag

  return (
    <div
      ref={leafEl}
      onClick={onSelect}
      // Double-clicking the empty part of a page adds a paragraph and puts the
      // caret in it — the gesture every page editor has, and which did nothing
      // here. Only on the page itself: a double-click that landed on a block
      // reached that block's own handler and never gets this far.
      onDoubleClick={(e) => {
        if (!selected || e.target !== e.currentTarget) return
        addBlock('para')
        requestEdit(useDeck.getState().selectedBlock)
      }}
      data-leaf
      style={{ width: `${cssW}px`, height: `${cssH}px` }}
      className={`relative block shrink-0 outline-offset-2 ${
        selected ? 'outline outline-2 outline-select' : 'outline outline-1 outline-black/20'
      }`}
    >
      <canvas ref={ref} style={{ width: `${cssW}px`, height: `${cssH}px` }} className="block" />
      {guides && (
        <GridGuides
          pageWpt={pageWpt}
          highlight={drag?.fromLeaf === index ? drag.band : null}
          snap={drag?.target?.leafIndex === index ? drag.target.top : null}
        />
      )}
      <HitLayer
        placed={placed}
        regions={regions}
        width={devicePx}
        height={devicePxH}
        scale={editorScale}
        leafIndex={index}
        active={selected}
        overflowFrom={overflowFrom}
      />
    </div>
  )
}

/** Below this many CSS pixels across, a page stops being worth showing two of. */
const MIN_LEAF_CSS_W = 300

/**
 * The smallest a component's hit target may be, in points.
 *
 * A rule is a hairline and a small spacer is a few points, so their painted
 * rects are one or two device pixels tall — targets nobody can hit, which made
 * them impossible to select and therefore impossible to move or delete. The
 * target grows around the ink rather than downwards from it, so it doesn't
 * swallow clicks meant for whatever sits below.
 *
 * In points because that is the only unit here that doesn't change with the
 * display: `height` is always `PAGE_H` points of backing store, whatever the
 * zoom or the pixel ratio.
 */
const MIN_HIT_PT = 12

/** Back and forward, for when only one page is on the stage. */
function PageTurn() {
  const leafIndex = useDeck((s) => s.leafIndex)
  const count = useDeck((s) => s.deck.leaves.length)
  const selectLeaf = useDeck((s) => s.selectLeaf)
  const btn =
    'flex h-8 w-8 items-center justify-center rounded-full bg-control text-ink transition ' +
    'hover:bg-control/70 disabled:opacity-25'

  return (
    <div className="absolute bottom-5 right-5 z-30 flex gap-1">
      <button
        type="button"
        title="Previous page"
        disabled={leafIndex === 0}
        onClick={() => selectLeaf(leafIndex - 1)}
        className={btn}
      >
        ‹
      </button>
      <button
        type="button"
        title="Next page"
        disabled={leafIndex >= count - 1}
        onClick={() => selectLeaf(leafIndex + 1)}
        className={btn}
      >
        ›
      </button>
    </div>
  )
}

/**
 * Drive a drag from the window, and write the document once when it lands.
 *
 * On the window rather than on the block, because a drag is allowed to leave
 * the page it started on — pointer capture would keep the events coming, but
 * only to the element that was pressed, and the gesture needs to know about the
 * *facing* page too. The leaves publish their geometry into the drag store for
 * exactly this reason.
 */
function useDragGesture() {
  const move = useBlockDrag((s) => s.move)
  const end = useBlockDrag((s) => s.end)
  const cancel = useBlockDrag((s) => s.cancel)
  const active = useBlockDrag((s) => s.drag !== null)
  const updateBlock = useDeck((s) => s.updateBlock)
  const moveBlockTo = useDeck((s) => s.moveBlockTo)

  useEffect(() => {
    if (!active) return
    const onMove = (e: PointerEvent) => move(e.clientX, e.clientY)
    const onUp = () => {
      const drag = end()
      if (!drag) return
      // One write, on drop — see the note in `useBlockDrag`. A drag that
      // resolved to nothing (straight back where it started, or off the page
      // entirely) writes nothing at all rather than committing a no-op that
      // would still cost an undo step.
      if (drag.mode === 'reorder' && drag.target) {
        const { leafIndex, at, top, pins } = drag.target
        moveBlockTo(drag.blockId, leafIndex, at, { top, pins })
      } else if (drag.band && (drag.band.col !== drag.col0 || drag.band.span !== drag.span0)) {
        updateBlock(drag.blockId, { col: drag.band.col, span: drag.band.span })
      }
    }
    // Escape puts it back. Nothing has been written yet, so there is nothing to
    // undo — the gesture simply stops meaning anything.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', onKey)
    }
  }, [active, move, end, cancel, updateBlock, moveBlockTo])
}

export function SpreadCanvas() {
  const deck = useDeck((s) => s.deck)
  const leafIndex = useDeck((s) => s.leafIndex)
  const selectLeaf = useDeck((s) => s.selectLeaf)
  const selectBlock = useDeck((s) => s.selectBlock)
  const ready = useFontsReady()
  const assets = useRenderAssets()
  const stage = useRef<HTMLDivElement>(null)
  useDragGesture()

  const spreads = deckSpreads(deck)
  const spread = spreads.find((s) =>
    s.kind === 'full' ? s.index === leafIndex : s.index === leafIndex || s.index + 1 === leafIndex,
  )

  // A cover is one leaf the width of the whole spread; a pair is two leaves that
  // add up to it. Either way the stage fits the same 1190 × 842 box, so the page
  // never changes size when you turn onto the cover.
  const leafPt = spread?.kind === 'full' ? SPREAD_W : PAGE_W
  const fit = useContainFit(stage, SPREAD_W, PAGE_H)

  // Below this a page is too small to read, let alone type on, and showing two
  // of them is showing neither. One page at a time is the honest fallback: the
  // document is unchanged and `deckSpreads` is untouched — this is purely what
  // the stage chooses to draw.
  const single = fit.measured && fit.scale * PAGE_W < MIN_LEAF_CSS_W && spread?.kind !== 'full'
  const scale = single ? fit.scaleFor(leafPt, PAGE_H) : fit.scale

  const devicePx = Math.round(leafPt * scale * fit.dpr)
  const devicePxH = Math.round(devicePx * (PAGE_H / leafPt))
  const editorScale = devicePx / fit.dpr / leafPt

  /** Selecting a page you were already on clears the block selection instead. */
  const pick = (i: number) => {
    if (i === leafIndex) selectBlock(null)
    else selectLeaf(i)
  }

  const shared = { deck, assets, ready, devicePx, devicePxH, editorScale, dpr: fit.dpr }

  return (
    // The stage is measured, not sized: `useContainFit` reads its content box and
    // returns the scale at which a spread fits inside it. Nothing here has an
    // aspect ratio, because a ratio plus a definite axis is what squashed the
    // page at narrow widths in the first place.
    <div
      ref={stage}
      // The band across the top is reserved whether or not the toolbar is in
      // it. Growing the padding only when something is selected would resize
      // the page — and therefore repaint and re-fit it — on every click.
      className="relative flex h-full items-center justify-center overflow-hidden px-6 pb-6 pt-[68px]"
    >
      <TextToolbar />
      {single && <PageTurn />}
      {!spread || !fit.measured ? null : (
        // Leaves sit in a row with no gap — facing pages meet at the spine, as
        // they do bound.
        <div className="flex items-start">
          {single ? (
            // One leaf, and always the one being edited — so `active` is
            // tautologically true and the hit layer keeps a single code path.
            <LeafCanvas
              {...shared}
              leaf={deck.leaves[leafIndex]}
              index={leafIndex}
              selected
              onSelect={() => selectBlock(null)}
            />
          ) : spread.kind === 'full' ? (
            <LeafCanvas
              {...shared}
              leaf={spread.leaf}
              index={spread.index}
              selected={leafIndex === spread.index}
              onSelect={() => pick(spread.index)}
            />
          ) : (
            <>
              <LeafCanvas
                {...shared}
                leaf={spread.left}
                index={spread.index}
                selected={leafIndex === spread.index}
                onSelect={() => pick(spread.index)}
              />
              {spread.right ? (
                <LeafCanvas
                  {...shared}
                  leaf={spread.right}
                  index={spread.index + 1}
                  selected={leafIndex === spread.index + 1}
                  onSelect={() => pick(spread.index + 1)}
                />
              ) : (
                // Hold the spine in place on an odd last page, so the verso
                // doesn't drift to the middle of the stage.
                <div style={{ width: `${devicePx / fit.dpr}px` }} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
