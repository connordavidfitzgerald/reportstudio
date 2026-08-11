import { useState } from 'react'
import type { Block, BlockKind } from '../doc/blocks'
import {
  isFullyTranslated,
  LANGS,
  setLang,
  t,
  type Lang,
  type LocalizedText,
} from '../doc/localized'
import { blockId } from '../doc/blocks'
import { importMarkdown } from '../doc/importMarkdown'
import { isFlow, sectionOfPage } from '../doc/sections'
import { useCurrentPage, useDeck } from '../store/useDeck'
import { Section as Panel, Segmented } from '../core/ui'

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
  statement: 'Statement',
  defList: 'Definitions',
  links: 'Resources',
  chart: 'Bar chart',
  figure: 'Figure',
}

/**
 * The kinds the type dropdown offers.
 *
 * Chart and figure are absent on purpose: neither is text, so converting a
 * paragraph into one would mean inventing data or an image. They are added by
 * their own buttons and edited by their own controls.
 */
const KIND_ORDER: BlockKind[] = [
  'heading',
  'subhead',
  'lede',
  'para',
  'list',
  'quote',
  'statement',
  'defList',
  'links',
]

/**
 * A block's content as editable plain text.
 *
 * Structured kinds get a line-based syntax rather than a bespoke form: a
 * definition list is `term | definition` per line, a chart is `label | value`,
 * resources are `label | url`. It keeps the whole outline one uniform editing
 * gesture, and it is what someone pasting out of a spreadsheet already has.
 */
function textOf(b: Block, lang: Lang): string {
  const L = (v: Parameters<typeof t>[0]) => t(v, lang)
  switch (b.kind) {
    case 'list':
      return b.items.map(L).join('\n')
    case 'defList':
      return b.rows.map((r) => `${L(r.term)} | ${L(r.def)}`).join('\n')
    case 'chart':
      return b.series.map((s) => `${L(s.label)} | ${s.value}`).join('\n')
    case 'links':
      return [L(b.title), ...b.items.map((i) => `${L(i.label)} | ${i.href ?? ''}`)].join('\n')
    case 'figure':
      return L(b.caption)
    default:
      return L(b.text)
  }
}

const cells = (line: string): string[] => line.split('|').map((c) => c.trim())

function withTextOf(b: Block, value: string, lang: Lang): Partial<Block> {
  const lines = value.split('\n')
  const nonEmpty = lines.filter((l) => l.trim())
  const set = (existing: LocalizedText | undefined, text: string) => setLang(existing, lang, text)

  switch (b.kind) {
    case 'list':
      return { items: nonEmpty.map((l, i) => set(b.items[i], l)) }
    case 'defList':
      return {
        rows: nonEmpty.map((l, i) => {
          const [term, def = ''] = cells(l)
          return { term: set(b.rows[i]?.term, term), def: set(b.rows[i]?.def, def) }
        }),
      }
    case 'chart':
      return {
        series: nonEmpty.map((l, i) => {
          const [label, value = ''] = cells(l)
          return {
            label: set(b.series[i]?.label, label),
            // A non-numeric cell keeps the previous value rather than becoming
            // NaN, which would render as a bar of no width and read as data loss.
            value: Number.isFinite(parseFloat(value)) ? parseFloat(value) : (b.series[i]?.value ?? 0),
          }
        }),
      }
    case 'links': {
      const [title = '', ...rest] = nonEmpty
      return {
        title: set(b.title, title),
        items: rest.map((l, i) => {
          const [label, href = ''] = cells(l)
          return { label: set(b.items[i]?.label, label), href: href || undefined }
        }),
      }
    }
    case 'figure':
      return { caption: set(b.caption, value) }
    default:
      return { text: set(b.text, value) }
  }
}

/**
 * Change a block's kind, carrying its content across.
 *
 * A naive `{ kind }` patch would leave a list holding `text` and no `items`, or
 * a paragraph holding `items` — a block that renders as nothing and looks like
 * lost work. The two shapes have to be converted, not just relabelled.
 */
/** The field a block's translation status is judged by. */
const translatableOf = (b: Block): LocalizedText | undefined => {
  switch (b.kind) {
    case 'list':
      return b.items[0]
    case 'defList':
      return b.rows[0]?.def
    case 'chart':
      return b.series[0]?.label
    case 'links':
      return b.title
    case 'figure':
      return b.caption
    default:
      return b.text
  }
}

function retype(b: Block, kind: BlockKind, lang: Lang): Block {
  const base = { id: b.id, breakBefore: b.breakBefore, keepWithNext: b.keepWithNext }
  const lines = textOf(b, lang).split('\n').filter((l) => l.trim())
  const seed = { ...base, kind } as Block
  return { ...seed, ...withTextOf(seed, lines.join('\n'), lang) } as Block
}

/** Kinds that can be appended, including the two that are not text. */
const ADDABLE: [BlockKind, string][] = [
  ['para', 'Paragraph'],
  ['subhead', 'Sub-head'],
  ['quote', 'Quote'],
  ['list', 'List'],
  ['defList', 'Definitions'],
  ['chart', 'Chart'],
  ['links', 'Resources'],
  ['figure', 'Figure'],
]

/** A new block of `kind`, seeded so it renders as something rather than nothing. */
function newBlock(kind: BlockKind): Block {
  const id = blockId()
  switch (kind) {
    case 'list':
      return { id, kind, items: ['First point', 'Second point'] }
    case 'defList':
      return { id, kind, rows: [{ term: 'Term', def: 'Its definition.' }] }
    case 'chart':
      return { id, kind, unit: '%', series: [{ label: 'First', value: 40 }, { label: 'Second', value: 25 }] }
    case 'links':
      return { id, kind, title: 'Resources', items: [{ label: 'A resource', href: '' }] }
    case 'figure':
      return { id, kind, imageRef: null, caption: '' }
    default:
      return { id, kind, text: '' } as Block
  }
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
  const setDeck = useDeck((s) => s.setDeck)

  const [importing, setImporting] = useState(false)
  const [draft, setDraft] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])

  const lang = deck.lang
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
  const translated = flow.blocks.filter((b) => isFullyTranslated(translatableOf(b))).length

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
                    {KIND_LABELS[b.kind]} — {textOf(b, lang).slice(0, 40)}
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

          {/* One layout, two editions. Switching re-typesets: French runs longer
              than English, so the page count legitimately differs. */}
          <div className="flex items-center gap-1 text-[11px]">
            <span className="opacity-70">Edition</span>
            <Segmented<Lang>
              value={lang}
              onChange={(l) => setDeck({ lang: l }, 'deck:lang')}
              options={LANGS.map((l) => ({ value: l, label: l.toUpperCase() }))}
            />
            <span className="ml-auto opacity-70" title="Blocks with text in both languages">
              {translated}/{flow.blocks.length} translated
            </span>
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
                  onChange={(e) => setBlock(flow.id, b.id, retype(b, e.target.value as BlockKind, lang))}
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
                value={textOf(b, lang)}
                onChange={(e) => setBlock(flow.id, b.id, withTextOf(b, e.target.value, lang))}
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

          <div className="grid grid-cols-2 gap-1">
            {ADDABLE.map(([kind, label]) => (
              <button
                key={kind}
                className="border border-black px-2 py-1 text-[11px] hover:bg-black hover:text-white"
                onClick={() => setBlocks(flow.id, [...flow.blocks, newBlock(kind)])}
              >
                + {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}
