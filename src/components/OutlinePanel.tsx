import { useState } from 'react'
import type { Block, BlockKind } from '../doc/blocks'
import { blockId } from '../doc/blocks'
import { importMarkdown } from '../doc/importMarkdown'
import { isFlow, sectionOfPage } from '../doc/sections'
import { useCurrentPage, useDeck } from '../store/useDeck'
import { Section as Panel } from '../core/ui'

/**
 * The outline: a flow section's content as a linear stream.
 *
 * Flowed content is authored here rather than on the canvas, because its
 * position is a *result*. Dragging a paragraph to a spot on a page would be
 * asking for something the model cannot represent — the next edit upstream would
 * move it again. Reordering in the stream is the honest gesture, and the page it
 * lands on follows from that.
 */

const KIND_LABELS: Record<BlockKind, string> = {
  heading: 'Chapter title',
  subhead: 'Sub-head',
  lede: 'Lede',
  para: 'Paragraph',
  list: 'List',
  quote: 'Pull quote',
}

const KIND_ORDER: BlockKind[] = ['heading', 'subhead', 'lede', 'para', 'list', 'quote']

const textOf = (b: Block): string => (b.kind === 'list' ? b.items.join('\n') : b.text)

const withTextOf = (b: Block, value: string): Partial<Block> =>
  b.kind === 'list' ? { items: value.split('\n').filter(Boolean) } : { text: value }

/**
 * Change a block's kind, carrying its content across.
 *
 * A naive `{ kind }` patch would leave a list holding `text` and no `items`, or
 * a paragraph holding `items` — a block that renders as nothing and looks like
 * lost work. The two shapes have to be converted, not just relabelled.
 */
function retype(b: Block, kind: BlockKind): Block {
  const lines = b.kind === 'list' ? b.items : b.text.split('\n').filter(Boolean)
  const base = { id: b.id, breakBefore: b.breakBefore, keepWithNext: b.keepWithNext }
  if (kind === 'list') return { ...base, kind, items: lines }
  const text = lines.join(kind === 'para' || kind === 'lede' ? ' ' : '\n')
  return kind === 'para' ? { ...base, kind, text } : ({ ...base, kind, text } as Block)
}

export function OutlinePanel() {
  const deck = useDeck((s) => s.deck)
  // Resolve from the page actually open: after a delete the stored id can name a
  // page that no longer exists, and `useCurrentPage` already falls back.
  const currentPageId = useCurrentPage().id
  const setBlock = useDeck((s) => s.setBlock)
  const setBlocks = useDeck((s) => s.setBlocks)
  const removeBlock = useDeck((s) => s.removeBlock)
  const moveBlock = useDeck((s) => s.moveBlock)
  const addFlowSection = useDeck((s) => s.addFlowSection)

  const [importing, setImporting] = useState(false)
  const [draft, setDraft] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  const section = sectionOfPage(deck, currentPageId)
  const flow = section && isFlow(section) ? section : null

  if (!flow) {
    return (
      <Panel title="Outline" collapsible defaultOpen>
        <p className="text-xs leading-relaxed opacity-70">
          This page is hand-composed. Flowing content — where the text decides how many
          pages it needs — lives in a report section.
        </p>
        <button
          className="mt-2 w-full border border-black px-2 py-1 text-xs hover:bg-black hover:text-white"
          onClick={() => addFlowSection('Section')}
        >
          Add report section
        </button>
      </Panel>
    )
  }

  const preview = importing ? importMarkdown(draft) : null

  return (
    <Panel title="Outline" collapsible defaultOpen>
      {importing ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs opacity-70">
            Paste Markdown, or a document copied as plain text.
          </p>
          <textarea
            className="h-40 w-full border border-black p-1 font-mono text-[11px]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={'# Chapter\n\nOpening paragraph.\n\n- a point\n- another'}
            autoFocus
          />
          {/* Review before committing: a bad parse of forty pages is much worse
              than no parse, so the result is shown before it replaces anything. */}
          {preview && (
            <div className="border border-black p-1 text-[11px]">
              <div className="font-bold">
                {preview.blocks.length} block{preview.blocks.length === 1 ? '' : 's'}
              </div>
              <ul className="mt-1 max-h-24 overflow-y-auto">
                {preview.blocks.map((b) => (
                  <li key={b.id} className="truncate opacity-70">
                    {KIND_LABELS[b.kind]} — {textOf(b).slice(0, 40)}
                  </li>
                ))}
              </ul>
              {preview.warnings.map((w) => (
                <p key={w} className="mt-1 font-bold">
                  {w}
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-1">
            <button
              className="flex-1 border border-black px-2 py-1 text-xs hover:bg-black hover:text-white disabled:opacity-40"
              disabled={!preview?.blocks.length}
              onClick={() => {
                setBlocks(flow.id, preview!.blocks, 'section:import')
                setImporting(false)
                setDraft('')
                setWarnings(preview!.warnings)
              }}
            >
              Replace content
            </button>
            <button
              className="border border-black px-2 py-1 text-xs hover:bg-black hover:text-white"
              onClick={() => setImporting(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <div className="flex gap-1">
            <button
              className="flex-1 border border-black px-2 py-1 text-xs hover:bg-black hover:text-white"
              onClick={() => setImporting(true)}
            >
              Import text
            </button>
            <button
              className="border border-black px-2 py-1 text-xs hover:bg-black hover:text-white"
              onClick={() => addFlowSection('Section')}
            >
              + Section
            </button>
          </div>

          {warnings.map((w) => (
            <p key={w} className="text-[11px] font-bold">
              {w}
            </p>
          ))}

          {flow.blocks.map((b, i) => (
            <div key={b.id} className="border border-black p-1">
              <div className="flex items-center gap-1">
                <select
                  className="flex-1 border border-black bg-white text-[11px]"
                  value={b.kind}
                  onChange={(e) => setBlock(flow.id, b.id, retype(b, e.target.value as BlockKind))}
                >
                  {KIND_ORDER.map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
                <button
                  className="px-1 text-[11px] disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => moveBlock(flow.id, b.id, -1)}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  className="px-1 text-[11px] disabled:opacity-30"
                  disabled={i === flow.blocks.length - 1}
                  onClick={() => moveBlock(flow.id, b.id, 1)}
                  title="Move down"
                >
                  ↓
                </button>
                <button
                  className="px-1 text-[11px]"
                  onClick={() => removeBlock(flow.id, b.id)}
                  title="Delete"
                >
                  ×
                </button>
              </div>
              <textarea
                className="mt-1 w-full resize-y border border-black p-1 text-[11px]"
                rows={b.kind === 'para' || b.kind === 'list' ? 3 : 1}
                value={textOf(b)}
                onChange={(e) => setBlock(flow.id, b.id, withTextOf(b, e.target.value))}
              />
              <label className="mt-1 flex items-center gap-1 text-[11px] opacity-70">
                <input
                  type="checkbox"
                  checked={b.breakBefore ?? false}
                  onChange={(e) => setBlock(flow.id, b.id, { breakBefore: e.target.checked })}
                />
                Page break before
              </label>
            </div>
          ))}

          <button
            className="border border-black px-2 py-1 text-xs hover:bg-black hover:text-white"
            onClick={() =>
              setBlocks(flow.id, [...flow.blocks, { id: blockId(), kind: 'para', text: '' }])
            }
          >
            + Paragraph
          </button>
        </div>
      )}
    </Panel>
  )
}
