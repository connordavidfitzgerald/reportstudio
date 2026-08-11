/**
 * Markdown import checks — `npm run check:import`.
 *
 * This is the path most report content will actually arrive by, and its worst
 * failure is silent: a paragraph subtly mangled forty pages in, which nobody
 * catches until the PDF is out. So the assertions are mostly about *not losing
 * or corrupting text*, not about spec coverage.
 */
import assert from 'node:assert/strict'
import { importMarkdown, importSectionsMarkdown } from '../src/doc/importMarkdown.ts'

const kinds = (md) => importMarkdown(md).blocks.map((b) => b.kind)
const only = (md) => importMarkdown(md).blocks

// -- structure ---------------------------------------------------------------
{
  const b = only(`# Findings

The opening paragraph.

### Campaign development

Some running text here.
And a second line of the same paragraph.

- First item
- Second item

> A pulled sentence.
`)
  assert.deepEqual(
    b.map((x) => x.kind),
    ['heading', 'para', 'subhead', 'para', 'list', 'quote'],
  )
  assert.equal(b[0].text, 'Findings')
  assert.equal(b[2].text, 'Campaign development', 'level 3+ becomes the ruled sub-head band')
  assert.equal(
    b[3].text,
    'Some running text here. And a second line of the same paragraph.',
    'wrapped source lines join into one paragraph',
  )
  assert.deepEqual(b[4].items, ['First item', 'Second item'])
  assert.equal(b[5].text, 'A pulled sentence.')
}

// -- the first paragraph after a heading is set flush ------------------------
{
  const b = only('# H\n\nFirst para.\n\nSecond para.\n\nThird para.')
  assert.equal(b[1].indent, false, 'the paragraph after a heading is flush')
  assert.equal(b[2].indent, true, 'later paragraphs carry the indent')
  assert.equal(b[3].indent, true)
}

// -- horizontal rule becomes an explicit page break --------------------------
{
  const b = only('Before.\n\n---\n\nAfter.')
  assert.equal(b.length, 2)
  assert.ok(!b[0].breakBefore)
  assert.equal(b[1].breakBefore, true, 'a rule forces the next block onto a new page')

  const trailing = importMarkdown('Only.\n\n---\n')
  assert.equal(trailing.blocks.length, 1)
  assert.ok(
    trailing.warnings.some((w) => /trailing page break/i.test(w)),
    'a rule with nothing after it is reported rather than silently dropped',
  )
}

// -- inline markup is stripped, text is not --------------------------------
{
  const b = only('This is **bold** and *italic* and `code` and a [link](http://x.y).')
  assert.equal(b[0].text, 'This is bold and italic and code and a link.')
}
{
  // Asterisks that are not emphasis must survive — losing a multiplication sign
  // or a footnote marker inside a report is a real corruption.
  const b = only('Grant funding rose 3 * 4 times.')
  assert.equal(b[0].text, 'Grant funding rose 3 * 4 times.')
}

// -- ordered lists, and mixed markers ---------------------------------------
{
  const b = only('1. First\n2. Second\n3) Third')
  assert.equal(b[0].kind, 'list')
  assert.deepEqual(b[0].items, ['First', 'Second', 'Third'])
}

// -- no text is lost -------------------------------------------------------
{
  const source = `# Chapter

Para one with some length to it.

- alpha
- beta

Para two.

> Quoted words here.

Para three.`
  const b = only(source)
  const got = b
    .flatMap((x) => (x.kind === 'list' ? x.items : [x.text]))
    .join(' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
  const expected = source
    .replace(/^[#>\-\s]+/gm, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .sort()
  assert.deepEqual(got, expected, 'every word in the source appears in the blocks')
}

// -- ids are unique --------------------------------------------------------
{
  const b = only('# A\n\nOne.\n\nTwo.\n\n# B\n\nThree.')
  assert.equal(new Set(b.map((x) => x.id)).size, b.length, 'every block gets a distinct id')
}

// -- degenerate input ------------------------------------------------------
assert.deepEqual(kinds(''), [], 'empty input yields no blocks')
assert.ok(importMarkdown('').warnings.length, 'and says so')
assert.deepEqual(kinds('   \n\n  \n'), [], 'whitespace only yields no blocks')
// A lone '#' is not a heading, and is kept as literal text rather than dropped —
// consistent with never losing a character of the source.
assert.deepEqual(kinds('#'), ['para'])
assert.equal(only('#')[0].text, '#')
assert.deepEqual(kinds('Just one line.'), ['para'])

// A long run with no headings would typeset as one undifferentiated block.
{
  const many = Array.from({ length: 20 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
  assert.ok(
    importMarkdown(many).warnings.some((w) => /no headings/i.test(w)),
    'a long structureless paste is flagged for the review step',
  )
}

// -- splitting a document into sections -------------------------------------
{
  const { sections } = importSectionsMarkdown(
    '# Methodology\n\nHow it was done.\n\n# Findings\n\nWhat was found.\n\n### Detail\n\nMore.',
  )
  assert.equal(sections.length, 2, 'one section per top-level heading')
  assert.deepEqual(sections.map((s) => s.title), ['Methodology', 'Findings'])
  assert.equal(sections[1].blocks.length, 4, 'sub-heads stay inside their chapter')
}
{
  // Content before any heading must not be dropped on the floor.
  const { sections } = importSectionsMarkdown('Front matter.\n\n# Real chapter\n\nBody.')
  assert.equal(sections.length, 2)
  assert.equal(sections[0].title, 'Untitled')
  assert.equal(sections[0].blocks[0].text, 'Front matter.')
}


// -- localized text ----------------------------------------------------------
{
  const { t, setLang, isFullyTranslated } = await import('../src/doc/localized.ts')

  // A plain string serves both editions — the common case, and why a
  // monolingual document carries no translation machinery.
  assert.equal(t('Shared', 'en'), 'Shared')
  assert.equal(t('Shared', 'fr'), 'Shared')
  assert.ok(isFullyTranslated('Shared'))

  const pair = setLang('Findings', 'fr', 'Constatations')
  assert.deepEqual(pair, { en: 'Findings', fr: 'Constatations' })
  assert.equal(t(pair, 'fr'), 'Constatations')
  assert.ok(isFullyTranslated(pair))

  // A missing translation falls back to the other language rather than to empty:
  // an untranslated paragraph is obvious and fixable, a vanished one is neither.
  assert.equal(t({ en: 'Only English' }, 'fr'), 'Only English')
  assert.ok(!isFullyTranslated({ en: 'Only English' }))
  assert.equal(t(undefined, 'en'), '')
  assert.equal(t({}, 'en'), '')

  // Setting both to the same text collapses back to a plain string, so documents
  // don't accumulate redundant pairs.
  assert.equal(setLang({ en: 'A', fr: 'B' }, 'fr', 'A'), 'A')
}

console.log('import ok — structure, indents, breaks, inline markup, and no text lost, localization')
