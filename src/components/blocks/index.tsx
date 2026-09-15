import type { Block } from '../../doc/blocks'
import { useDeck } from '../../store/useDeck'
import {
  BandEditor,
  BulletListEditor,
  ChartEditor,
  CoverEditor,
  FigureEditor,
  LinksEditor,
  QuoteOverlayEditor,
  SpacerEditor,
  TableEditor,
  TextEditor,
  TocEntryEditor,
} from './editors'

/**
 * The settings for whichever component is selected.
 *
 * A switch rather than a `Record<BlockKind, FC>` on purpose: the switch is what
 * narrows the union, so each editor receives its own block type with no casts,
 * and a new kind fails to compile until it has been considered here. A registry
 * keyed by kind would need a cast at every entry, which is precisely where a
 * mis-typed editor would slip through.
 *
 * `hasBlockSettings` in `./settings.ts` says which kinds have anything here,
 * and must agree with the switch below.
 *
 * Most kinds now return null: a paragraph, a quote, a heading, a definition list
 * and the rest are *entirely* words on the page, and words on the page are typed
 * on the page. See the note at the head of `./editors.tsx`.
 */

export function BlockEditor({ block }: { block: Block }) {
  const updateBlock = useDeck((s) => s.updateBlock)
  // Each editor gets a patcher already bound to its own block type.
  const patch = <T,>(p: T) => updateBlock(block.id, p as Partial<Block>)

  switch (block.kind) {
    case 'quoteOverlay':
      return <QuoteOverlayEditor block={block} patch={patch} />
    case 'text':
      return <TextEditor block={block} patch={patch} />
    case 'band':
      return <BandEditor block={block} patch={patch} />
    case 'bulletList':
      return <BulletListEditor block={block} patch={patch} />
    case 'links':
      return <LinksEditor block={block} patch={patch} />
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
    case 'table':
      return <TableEditor block={block} patch={patch} />

    // Words on the page, and nothing else.
    case 'heading':
    case 'deck':
    case 'sectionHeading':
    case 'subhead':
    case 'para':
    case 'quote':
    case 'statement':
    case 'defList':
    case 'credits':
    case 'rule':
    // A contents block holds nothing at all: it reads the document.
    case 'contents':
      return null
  }
}
