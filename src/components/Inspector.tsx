import { useState } from 'react'
import { BODY_SIZE, SURFACES, type BodySizeId, type SurfaceId } from '../config/brand'
import type { Block, BlockKind } from '../doc/blocks'
import { swashClashes } from '../doc/blocks'
import { BLOCK_LABELS, BLOCK_ORDER } from '../doc/defaults'
import { t } from '../doc/localized'
import { TEMPLATES } from '../templates'
import { useCurrentLeaf, useDeck } from '../store/useDeck'
import { labelClass, Section, Segmented, TextField } from './ui'

/**
 * The authoring surface.
 *
 * Everything here is content or order — there is nothing to drag and no
 * coordinates to type. Adding a component appends it, the arrows move it, and
 * swapping changes what a component *is* while keeping where it sits. That is
 * the whole editing model, and it is enough because the design has no
 * arbitrarily-placed anything in it.
 */

/** A one-line summary of a block, for the list. */
function summarise(block: Block, lang: 'en' | 'fr'): string {
  switch (block.kind) {
    case 'rule':
      return '—'
    case 'spacer':
      return `${block.height}pt`
    case 'defList':
      return `${block.rows.length} row${block.rows.length === 1 ? '' : 's'}`
    case 'bulletList':
      return `${block.items.length} items`
    case 'links':
      return block.items.map((i) => t(i.label, lang)).join(', ')
    case 'credits':
      return block.rows.map((r) => t(r.label, lang)).join(', ')
    case 'chart':
      return `${block.series.length} bars`
    case 'figure':
      return block.imageRef ? 'image' : 'no image yet'
    case 'tocEntry':
      return `${t(block.label, lang)} · ${block.folio}`
    case 'cover':
      return t(block.title, lang).replace(/\n/g, ' ')
    default:
      return t(block.text, lang)
  }
}

/** The text field a block edits, if it has a single obvious one. */
const primaryText = (block: Block): string | null =>
  'text' in block ? (typeof block.text === 'string' ? block.text : null) : null

function BlockRow({ block, index, count }: { block: Block; index: number; count: number }) {
  const leaf = useCurrentLeaf()
  const lang = useDeck((s) => s.deck.lang)
  const selected = useDeck((s) => s.selectedBlock) === block.id
  const selectBlock = useDeck((s) => s.selectBlock)
  const moveBlock = useDeck((s) => s.moveBlock)
  const removeBlock = useDeck((s) => s.removeBlock)
  const swapBlock = useDeck((s) => s.swapBlock)
  const updateBlock = useDeck((s) => s.updateBlock)

  const clash = swashClashes(block, leaf.surface)
  const body = primaryText(block)

  return (
    <div className={`border-b border-black/10 ${selected ? 'bg-black/[0.04]' : ''}`}>
      <div className="flex items-center gap-1 px-1 py-1.5">
        <button
          type="button"
          onClick={() => selectBlock(selected ? null : block.id)}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block text-[10px] uppercase tracking-wide text-black/45">
            {BLOCK_LABELS[block.kind]}
          </span>
          <span className="block truncate text-xs">{summarise(block, lang)}</span>
        </button>
        <button
          type="button"
          title="Move up"
          disabled={index === 0}
          onClick={() => moveBlock(block.id, -1)}
          className="px-1 text-xs disabled:opacity-20"
        >
          ↑
        </button>
        <button
          type="button"
          title="Move down"
          disabled={index === count - 1}
          onClick={() => moveBlock(block.id, 1)}
          className="px-1 text-xs disabled:opacity-20"
        >
          ↓
        </button>
        <button
          type="button"
          title="Remove"
          onClick={() => removeBlock(block.id)}
          className="px-1 text-xs text-black/50 hover:text-black"
        >
          ×
        </button>
      </div>

      {clash && (
        <p className="px-1 pb-1.5 text-[10px] text-[#B23]">
          This component paints a pink swash, which is invisible on a pink page.
        </p>
      )}

      {selected && (
        <div className="flex flex-col gap-2 px-1 pb-2">
          {body !== null && (
            <textarea
              value={body}
              onChange={(e) => updateBlock(block.id, { text: e.target.value } as Partial<Block>)}
              rows={4}
              className="w-full resize-y border border-black/20 p-1.5 text-xs"
            />
          )}

          <label className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-black/45">
            Swap for
            <select
              value={block.kind}
              onChange={(e) => swapBlock(block.id, e.target.value as BlockKind)}
              className="flex-1 border border-black/20 p-1 text-xs normal-case tracking-normal"
            >
              {BLOCK_ORDER.map((k) => (
                <option key={k} value={k}>
                  {BLOCK_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-black/45">Columns</span>
            <input
              type="number"
              min={0}
              max={8}
              value={block.col ?? 0}
              onChange={(e) => updateBlock(block.id, { col: Number(e.target.value) })}
              className="w-12 border border-black/20 p-1 text-xs"
              title="Start column (0–8)"
            />
            <span className="text-xs text-black/40">→</span>
            <input
              type="number"
              min={1}
              max={9}
              value={block.span ?? 9 - (block.col ?? 0)}
              onChange={(e) => updateBlock(block.id, { span: Number(e.target.value) })}
              className="w-12 border border-black/20 p-1 text-xs"
              title="Span in columns (1–9)"
            />
          </div>
        </div>
      )}
    </div>
  )
}

export function Inspector() {
  const leaf = useCurrentLeaf()
  const leafIndex = useDeck((s) => s.leafIndex)
  const updateLeaf = useDeck((s) => s.updateLeaf)
  const addBlock = useDeck((s) => s.addBlock)
  const applyTemplate = useDeck((s) => s.applyTemplate)
  const [adding, setAdding] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      <Section title="Page">
        <Segmented
          value={leaf.surface}
          onChange={(surface: SurfaceId) => updateLeaf(leafIndex, { surface })}
          options={(Object.keys(SURFACES) as SurfaceId[]).map((id) => ({ value: id, label: id }))}
        />
        <div className="mt-2">
          <span className="text-[10px] uppercase tracking-wide text-black/45">Body size</span>
          <Segmented
            value={leaf.bodySize}
            onChange={(bodySize: BodySizeId) => updateLeaf(leafIndex, { bodySize })}
            options={(Object.keys(BODY_SIZE) as BodySizeId[]).map((id) => ({
              value: id,
              label: `${BODY_SIZE[id]}`,
            }))}
          />
        </div>
        <div className="mt-2">
          <TextField
            label="Running head"
            value={typeof leaf.runningHead === 'string' ? leaf.runningHead : ''}
            onChange={(runningHead: string) => updateLeaf(leafIndex, { runningHead })}
          />
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={!!leaf.bare}
            onChange={(e) => updateLeaf(leafIndex, { bare: e.target.checked })}
          />
          No furniture (full-bleed plate)
        </label>
      </Section>

      <Section title="Template">
        <select
          value={leaf.templateId ?? ''}
          onChange={(e) => applyTemplate(leafIndex, e.target.value)}
          className="w-full border border-black/20 p-1 text-xs"
        >
          <option value="">—</option>
          {TEMPLATES.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[10px] text-black/45">
          Applying a template replaces this page's components.
        </p>
      </Section>

      <Section title="Components">
        <div className="border-t border-black/10">
          {leaf.blocks.map((block, i) => (
            <BlockRow key={block.id} block={block} index={i} count={leaf.blocks.length} />
          ))}
          {!leaf.blocks.length && (
            <p className="py-3 text-xs text-black/40">Nothing on this page yet.</p>
          )}
        </div>

        {adding ? (
          <div className="mt-2 grid grid-cols-2 gap-1">
            {BLOCK_ORDER.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => {
                  addBlock(kind)
                  setAdding(false)
                }}
                className="border border-black/20 px-1.5 py-1 text-left text-[11px] hover:bg-black hover:text-white"
              >
                {BLOCK_LABELS[kind]}
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="mt-2 w-full border border-black px-2 py-1.5 text-xs uppercase tracking-wide hover:bg-black hover:text-white"
          >
            Add component
          </button>
        )}
      </Section>

      <span className={labelClass}>Le HUB — Report</span>
    </div>
  )
}
