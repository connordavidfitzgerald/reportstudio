import type { Block } from '../../doc/blocks'
import { useDeck } from '../../store/useDeck'
import {
  BandEditor,
  BulletListEditor,
  ChartEditor,
  CoverEditor,
  CreditsEditor,
  DefListEditor,
  FigureEditor,
  LinksEditor,
  ParaEditor,
  QuoteEditor,
  QuoteOverlayEditor,
  SpacerEditor,
  StatementEditor,
  TextEditor,
  TocEntryEditor,
} from './editors'
import { LocalizedField } from './fields'

/**
 * The editor for whichever component is selected.
 *
 * A switch rather than a `Record<BlockKind, FC>` on purpose: the switch is what
 * narrows the union, so each editor receives its own block type with no casts,
 * and a new kind fails to compile until it has one. A registry keyed by kind
 * would need a cast at every entry, which is precisely where a mis-typed editor
 * would slip through.
 */

export function BlockEditor({ block }: { block: Block }) {
  const updateBlock = useDeck((s) => s.updateBlock)
  // Each editor gets a patcher already bound to its own block type.
  const patch = <T,>(p: T) => updateBlock(block.id, p as Partial<Block>)

  switch (block.kind) {
    // The four that are a single run of words and nothing else.
    case 'heading':
    case 'deck':
    case 'sectionHeading':
    case 'subhead':
      return (
        <LocalizedField
          value={block.text}
          onChange={(text) => patch({ text })}
          multiline
          rows={block.kind === 'deck' ? 3 : 2}
        />
      )

    case 'para':
      return <ParaEditor block={block} patch={patch} />
    case 'quote':
      return <QuoteEditor block={block} patch={patch} />
    case 'statement':
      return <StatementEditor block={block} patch={patch} />
    case 'quoteOverlay':
      return <QuoteOverlayEditor block={block} patch={patch} />
    case 'text':
      return <TextEditor block={block} patch={patch} />
    case 'band':
      return <BandEditor block={block} patch={patch} />

    case 'defList':
      return <DefListEditor block={block} patch={patch} />
    case 'bulletList':
      return <BulletListEditor block={block} patch={patch} />
    case 'links':
      return <LinksEditor block={block} patch={patch} />
    case 'credits':
      return <CreditsEditor block={block} patch={patch} />
    case 'chart':
      return <ChartEditor block={block} patch={patch} />
    case 'tocEntry':
      return <TocEntryEditor block={block} patch={patch} />

    case 'figure':
      return <FigureEditor block={block} patch={patch} />
    case 'cover':
      return <CoverEditor block={block} patch={patch} />

    case 'spacer':
      return <SpacerEditor block={block} patch={patch} />

    case 'rule':
      return (
        <p className="px-1 text-[11px] leading-snug text-dim">
          A hairline across the measure. Nothing to set — move it, or change how many columns it
          spans.
        </p>
      )
  }
}
