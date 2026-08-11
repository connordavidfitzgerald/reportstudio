import { blockId, type Block } from './blocks'

/**
 * Turn pasted Markdown — or a Google Doc pasted as plain text — into blocks.
 *
 * A 46-page report is not going to be typed into the app one box at a time, so
 * this is the path most content will actually arrive by.
 *
 * Deliberately small and forgiving. It recognises the handful of structures the
 * report design actually has and treats everything else as running text, because
 * the failure mode that matters is silently mangling a paragraph, not failing to
 * honour some corner of the CommonMark spec.
 *
 * The caller is expected to show the result for review before committing it: a
 * bad parse of forty pages is much worse than no parse.
 */

export interface ImportResult {
  blocks: Block[]
  /** Human-readable notes about anything ambiguous, for the review step. */
  warnings: string[]
}

/** Markdown a Google Doc paste tends to bring: **bold**, *italic*, `code`. */
const stripInline = (s: string): string =>
  s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\W)\*(?!\s)(.+?)(?<!\s)\*(?=\W|$)/g, '$1$2')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .trim()

const BULLET = /^\s*([-*+]|\d+[.)])\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/
const QUOTE = /^>\s?(.*)$/
const RULE = /^\s*(?:---+|\*\*\*+|___+)\s*$/

/**
 * Parse Markdown into the report's block vocabulary.
 *
 * Mapping, chosen to match how the redesign actually uses type rather than to
 * mirror HTML: `#`/`##` become the chapter heading, `###`+ becomes the ruled
 * sub-head band, `>` becomes a pull quote, lists become one list block, a
 * horizontal rule becomes an explicit page break, and the first paragraph after
 * a heading is set flush while the rest carry the indent.
 */
export function importMarkdown(source: string): ImportResult {
  const blocks: Block[] = []
  const warnings: string[] = []
  const lines = source.replace(/\r\n?/g, '\n').split('\n')

  let para: string[] = []
  let list: string[] = []
  let quote: string[] = []
  /** True until the first paragraph after a heading has been emitted. */
  let flushNext = true
  let pendingBreak = false

  const add = (b: Block): void => {
    if (pendingBreak) {
      b.breakBefore = true
      pendingBreak = false
    }
    blocks.push(b)
  }

  const endPara = (): void => {
    if (!para.length) return
    add({
      id: blockId(),
      kind: 'para',
      text: stripInline(para.join(' ')),
      indent: !flushNext,
    })
    flushNext = false
    para = []
  }
  const endList = (): void => {
    if (!list.length) return
    add({ id: blockId(), kind: 'list', items: list.map(stripInline) })
    list = []
  }
  const endQuote = (): void => {
    if (!quote.length) return
    add({ id: blockId(), kind: 'quote', text: stripInline(quote.join(' ')) })
    quote = []
  }
  const endAll = (): void => {
    endPara()
    endList()
    endQuote()
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    if (!line.trim()) {
      endAll()
      continue
    }

    if (RULE.test(line)) {
      endAll()
      pendingBreak = true
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      endAll()
      const level = heading[1].length
      const text = stripInline(heading[2])
      if (!text) {
        warnings.push('An empty heading was skipped.')
        continue
      }
      // One and two are both chapter openers; deeper levels are the ruled band.
      add(level <= 2 ? { id: blockId(), kind: 'heading', text } : { id: blockId(), kind: 'subhead', text })
      flushNext = true
      continue
    }

    const quoted = QUOTE.exec(line)
    if (quoted) {
      endPara()
      endList()
      quote.push(quoted[1])
      continue
    }
    endQuote()

    const bullet = BULLET.exec(line)
    if (bullet) {
      endPara()
      list.push(bullet[2])
      continue
    }
    endList()

    para.push(line.trim())
  }

  endAll()

  if (pendingBreak) warnings.push('A trailing page break was ignored — nothing follows it.')
  if (!blocks.length) warnings.push('Nothing was recognised in that text.')

  const headings = blocks.filter((b) => b.kind === 'heading').length
  if (blocks.length > 12 && headings === 0) {
    warnings.push(
      'No headings were found, so this will typeset as one long run of text. ' +
        'Markdown headings (# or ##) become chapter titles.',
    )
  }

  return { blocks, warnings }
}

/**
 * A whole document as one section per top-level heading.
 *
 * Running heads come from the headings, which is what the redesign does — the
 * head on every page of the methodology chapter reads METHODOLOGY.
 */
export function importSectionsMarkdown(source: string): { sections: { title: string; blocks: Block[] }[]; warnings: string[] } {
  const { blocks, warnings } = importMarkdown(source)
  const sections: { title: string; blocks: Block[] }[] = []

  for (const block of blocks) {
    if (block.kind === 'heading' || !sections.length) {
      sections.push({
        title: block.kind === 'heading' ? block.text : 'Untitled',
        blocks: [],
      })
    }
    sections[sections.length - 1].blocks.push(block)
  }

  return { sections, warnings }
}
