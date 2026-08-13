import { useEffect, useRef, useState } from 'react'
import { PAGE_H, PAGE_W, SPREAD_W } from '../config/brand'
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
import { InlineEditor } from './InlineEditor'
import { TextToolbar } from './canvas/TextToolbar'
import { BlockEditor } from './blocks'

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
 * backing store so they survive every resize without being recomputed. This
 * adds *no* positional state to the document: you still cannot drag anything,
 * and a block still has no coordinates. It only makes the existing model
 * pointable.
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
 * The controls that appear on the selected block, over the page.
 *
 * The `⋯` is the escape hatch for everything that cannot be typed into the page
 * itself — a bar's value, a contents folio, which image a figure holds, where
 * its focal point is. Those fields deliberately have no text region (see
 * `InlineEditor`), so "edit on the canvas" has to mean *next to* the block for
 * them rather than *in* it.
 */
function BlockTools({ block, index, count }: { block: Block; index: number; count: number }) {
  const moveBlock = useDeck((s) => s.moveBlock)
  const duplicateBlock = useDeck((s) => s.duplicateBlock)
  const removeBlock = useDeck((s) => s.removeBlock)
  const [fields, setFields] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const id = block.id

  const btn =
    'flex h-6 w-6 items-center justify-center rounded-full text-[11px] leading-none text-ink ' +
    'transition hover:bg-ink hover:text-card disabled:opacity-25 disabled:hover:bg-transparent ' +
    'disabled:hover:text-ink'

  return (
    <div ref={panel} onClick={(e) => e.stopPropagation()} className="pointer-events-auto relative">
      <div className="flex items-center rounded-full bg-card px-1 py-1">
        <button
          type="button"
          title="Move up"
          disabled={index === 0}
          onClick={() => moveBlock(id, -1)}
          className={btn}
        >
          ↑
        </button>
        <button
          type="button"
          title="Move down"
          disabled={index === count - 1}
          onClick={() => moveBlock(id, 1)}
          className={btn}
        >
          ↓
        </button>
        <button type="button" title="Duplicate" onClick={() => duplicateBlock(id)} className={btn}>
          ⧉
        </button>
        <button
          type="button"
          title="Fields that aren't typed on the page"
          onClick={() => setFields((f) => !f)}
          className={btn}
        >
          ⋯
        </button>
        <button type="button" title="Remove" onClick={() => removeBlock(id)} className={btn}>
          ×
        </button>
      </div>

      {fields && (
        <BlockFields boundary={panel} block={block} onClose={() => setFields(false)} />
      )}
    </div>
  )
}

/** The per-component fields, in a card anchored to the block. */
function BlockFields({
  boundary,
  block,
  onClose,
}: {
  /** The whole tool row, so pressing ⋯ again closes rather than reopens. */
  boundary: React.RefObject<HTMLDivElement | null>
  block: Block
  onClose: () => void
}) {
  useDismiss(boundary, onClose)
  return (
    <div
      className="absolute left-0 top-full z-40 mt-1.5 flex w-64 flex-col gap-2.5 rounded-card bg-card p-4"
    >
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
}) {
  const selectedBlock = useDeck((s) => s.selectedBlock)
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

  if (!width || !height) return null
  const pct = (v: number, of: number) => `${(v / of) * 100}%`

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

  const startEditing = (blockId: string, e: React.MouseEvent) => {
    const { x, y } = pointOn(e)
    const region = regionAt(blockId, x, y)
    if (region) setCaret({ leafIndex, blockId, path: region.path.join('.'), from: 0, to: 0 })
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
        return (
          <div key={block.id}>
            <button
              type="button"
              title={typeable ? `${BLOCK_LABELS[block.kind]} — click again to type` : BLOCK_LABELS[block.kind]}
              onMouseEnter={() => setHover(block.id)}
              onMouseLeave={() => setHover((h) => (h === block.id ? null : h))}
              onDoubleClick={(e) => {
                e.stopPropagation()
                focusHere(block.id)
                if (typeable) startEditing(block.id, e)
              }}
              onClick={(e) => {
                e.stopPropagation()
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
                top: pct(rect.y, height),
                width: pct(rect.w, width),
                height: pct(Math.max(rect.h, 6), height),
              }}
              className={`pointer-events-auto absolute cursor-pointer transition-[outline-color]
                ${
                  isEditing
                    ? // The caret's own outline is the strong one while typing.
                      // A component holding several fields still shows where it
                      // ends, but quietly, so the two don't compete.
                      'outline outline-1 outline-[#FF669E]/30'
                    : isSelected
                      ? 'outline outline-2 outline-[#FF669E]'
                      : isHover
                        ? 'outline outline-1 outline-black/40'
                        : 'outline outline-1 outline-transparent'
                }`}
            />

            {isSelected && (
              <div
                style={{
                  left: pct(rect.x, width),
                  top: pct(rect.y, height),
                  // Sit the toolbar just above the block, or just inside it when
                  // the block starts at the very top of the page.
                  transform: rect.y / height < 0.05 ? 'translateY(2px)' : 'translateY(-28px)',
                }}
                className="pointer-events-none absolute"
              >
                <BlockTools block={block} index={i} count={placed.length} />
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
  if (!enabled) return null
  return (
    <button
      type="button"
      title="Add a component here"
      onClick={(e) => {
        e.stopPropagation()
        onArm(armed ? null : at)
      }}
      style={{ ...style, transform: 'translateY(-6px)' }}
      className="pointer-events-auto group absolute flex h-3 cursor-pointer items-center justify-center"
    >
      <span
        className={`h-px w-full transition-colors ${armed ? 'bg-[#FF669E]' : 'bg-transparent group-hover:bg-[#FF669E]'}`}
      />
      <span
        className={`absolute flex h-4 w-4 items-center justify-center border text-[10px] leading-none transition
          ${armed ? 'border-[#FF669E] bg-[#FF669E] text-white' : 'border-transparent bg-transparent text-transparent group-hover:border-[#FF669E] group-hover:bg-white group-hover:text-[#FF669E]'}`}
      >
        +
      </span>
    </button>
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
  const imageVersion = useImageCache()
  const [placed, setPlaced] = useState<PlacedBlock[]>([])
  const [regions, setRegions] = useState<TextRegion[]>([])

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
    setRegions(result.regions)
  }, [leaf, deck, assets, ready, index, imageVersion, devicePx, devicePxH])

  // The CSS box is the backing store divided back down, never an independent
  // measurement — see the header. Both axes come from the two integers the
  // painter was given, so the page cannot be stretched on one of them.
  const cssW = devicePx / dpr
  const cssH = devicePxH / dpr

  return (
    <div
      onClick={onSelect}
      data-leaf
      style={{ width: `${cssW}px`, height: `${cssH}px` }}
      className={`relative block shrink-0 outline-offset-2 ${
        selected ? 'outline outline-2 outline-[#FF669E]' : 'outline outline-1 outline-black/20'
      }`}
    >
      <canvas ref={ref} style={{ width: `${cssW}px`, height: `${cssH}px` }} className="block" />
      <HitLayer
        placed={placed}
        regions={regions}
        width={devicePx}
        height={devicePxH}
        scale={editorScale}
        leafIndex={index}
        active={selected}
      />
    </div>
  )
}

/** Below this many CSS pixels across, a page stops being worth showing two of. */
const MIN_LEAF_CSS_W = 300

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

export function SpreadCanvas() {
  const deck = useDeck((s) => s.deck)
  const leafIndex = useDeck((s) => s.leafIndex)
  const selectLeaf = useDeck((s) => s.selectLeaf)
  const selectBlock = useDeck((s) => s.selectBlock)
  const ready = useFontsReady()
  const assets = useRenderAssets()
  const stage = useRef<HTMLDivElement>(null)

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
