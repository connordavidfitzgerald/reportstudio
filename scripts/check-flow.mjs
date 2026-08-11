/**
 * Pagination checks — `npm run check:flow`.
 *
 * Break decisions are the hardest thing here to judge by eye: a widow or a
 * stranded heading looks like a slightly unlucky page rather than a bug, and an
 * overflowing block looks fine until it is printed. They are also pure given a
 * measuring context, so they can be pinned exactly.
 *
 * Text metrics come from a deterministic stub rather than a real canvas — the
 * question is where the paginator *breaks*, not what the font does.
 */
import assert from 'node:assert/strict'
import { flowSection } from '../src/render/flow.ts'
import { getFormat } from '../src/config/formats.ts'
import { MARGIN } from '../src/config/brand.ts'

/** Every glyph is half an em wide. Deterministic and easy to reason about. */
function stubCtx() {
  let font = '10px stub'
  let letterSpacing = '0px'
  const size = () => parseFloat(/([\d.]+)px/.exec(font)?.[1] ?? '10')
  const noop = () => {}
  return {
    get font() { return font },
    set font(v) { font = v },
    get letterSpacing() { return letterSpacing },
    set letterSpacing(v) { letterSpacing = v },
    textAlign: 'left',
    textBaseline: 'alphabetic',
    measureText: (t) => ({
      width: t.length * size() * 0.5,
      actualBoundingBoxAscent: size() * 0.7,
      actualBoundingBoxDescent: size() * 0.2,
    }),
    save: noop, restore: noop, fillText: noop, fillRect: noop, beginPath: noop,
    moveTo: noop, lineTo: noop, closePath: noop, fill: noop, rect: noop,
    clip: noop, drawImage: noop,
  }
}

const ASSETS = { logo: null, papers: {}, image: () => null }
const deck = { format: 'a4', lang: 'en', paletteId: 'paper', paperIds: [], paperOpacities: {}, sections: [] }
const F = getFormat('a4')
const BOTTOM = F.h - MARGIN * F.w

const words = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ')
const flow = (blocks, title = 'Methodology') =>
  flowSection({ kind: 'flow', id: 'sec1', title, blocks }, deck, stubCtx(), ASSETS, { startFolio: 3 })

const contentOf = (page) => page.items.filter((i) => i.source === 'flow')
const furnitureOf = (page) => page.items.filter((i) => i.source === 'furniture')

// -- furniture ---------------------------------------------------------------
{
  const pages = flow([{ id: 'b1', kind: 'para', text: 'Short.' }])
  assert.equal(pages.length, 1)
  const chrome = furnitureOf(pages[0])
  assert.equal(chrome.length, 4, 'running head, folio, and two rules')
  assert.ok(chrome.every((i) => i.el.locked), 'furniture is locked, so hit-testing skips it')
  const head = chrome.find((i) => i.el.kind === 'text' && i.el.align === 'left')
  assert.equal(head.el.text, 'METHODOLOGY', 'the section title becomes the running head, in caps')
  const folio = chrome.find((i) => i.el.kind === 'text' && i.el.align === 'right')
  assert.equal(folio.el.text, '3', 'the folio starts where the section starts')
}

// -- long content paginates, and folios advance ------------------------------
{
  const pages = flow(
    Array.from({ length: 40 }, (_, i) => ({ id: `p${i}`, kind: 'para', text: words(60) })),
  )
  assert.ok(pages.length > 1, 'a long stream spills onto more pages')
  assert.deepEqual(
    pages.map((p) => furnitureOf(p).find((i) => i.el.align === 'right').el.text),
    pages.map((_, i) => String(3 + i)),
    'folios increment across the section',
  )
  assert.equal(new Set(pages.map((p) => p.id)).size, pages.length, 'page ids are unique')
}

// -- nothing runs past the bottom margin -------------------------------------
{
  const pages = flow(
    Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, kind: 'para', text: words(40) })),
  )
  for (const page of pages) {
    for (const item of contentOf(page)) {
      const end = (item.frame.yFrac + item.frame.hFrac) * F.h
      assert.ok(end <= BOTTOM + 0.5, `content ends at ${end}, past the ${BOTTOM} margin`)
    }
  }
}

// -- explicit page break -----------------------------------------------------
{
  const pages = flow([
    { id: 'a', kind: 'para', text: 'First.' },
    { id: 'b', kind: 'para', text: 'Second.', breakBefore: true },
  ])
  assert.equal(pages.length, 2, 'breakBefore starts a new page')
  assert.equal(contentOf(pages[0])[0].blockId, 'a')
  assert.equal(contentOf(pages[1])[0].blockId, 'b')
}

// A break on the very first block must not leave an empty page in front of it.
{
  const pages = flow([{ id: 'a', kind: 'para', text: 'First.', breakBefore: true }])
  assert.equal(pages.length, 1, 'no leading blank page')
}

// -- a heading is never stranded at the foot of a page ------------------------
{
  // Fill most of a page, then a heading, then more text.
  const filler = Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, kind: 'para', text: words(40) }))
  const pages = flow([
    ...filler,
    { id: 'h', kind: 'heading', text: 'Findings' },
    { id: 'after', kind: 'para', text: words(50) },
  ])
  for (const page of pages) {
    const content = contentOf(page)
    const last = content.at(-1)
    if (last?.blockId === 'h') {
      assert.fail('a heading was left as the last thing on a page')
    }
  }
  // And it must still appear exactly once.
  const all = pages.flatMap(contentOf).filter((i) => i.blockId === 'h')
  assert.equal(all.length, 1, 'the heading is placed exactly once')
}

// -- splitting: content is preserved across the break ------------------------
{
  // Long enough to exceed one A4 region (~62 lines of body copy).
  const long = words(1500)
  const pages = flow([{ id: 'big', kind: 'para', text: long }])
  const parts = pages.flatMap(contentOf).filter((i) => i.blockId === 'big')
  assert.ok(parts.length > 1, 'a very long paragraph splits across pages')

  // Every word survives, in order, exactly once.
  const recovered = parts.map((p) => p.el.text).join(' ').split(/\s+/).filter(Boolean)
  assert.deepEqual(recovered, long.split(' '), 'no text is lost or duplicated by the split')
}

// -- an atomic block taller than a page overflows rather than looping ---------
{
  // A quote is atomic. Make it far taller than the region.
  const pages = flow([
    { id: 'q', kind: 'quote', text: words(600) },
    { id: 'after', kind: 'para', text: 'Follows.' },
  ])
  assert.ok(pages.length >= 2, 'an oversized atomic block still terminates')
  const q = pages.flatMap(contentOf).filter((i) => i.blockId === 'q')
  assert.equal(q.length, 1, 'an atomic block is placed once, whole')
  assert.ok(
    pages.flatMap(contentOf).some((i) => i.blockId === 'after'),
    'content after an overflowing block is not dropped',
  )
}

// -- lists split by item, never mid-item -------------------------------------
{
  const items = Array.from({ length: 80 }, (_, i) => `Item number ${i}`)
  const pages = flow([{ id: 'l', kind: 'list', items }])
  const parts = pages.flatMap(contentOf).filter((i) => i.blockId === 'l')
  const lines = parts.flatMap((p) => p.el.text.split('\n')).filter(Boolean)
  assert.equal(lines.length, items.length, 'every item survives exactly once')
  assert.ok(lines.every((l) => l.startsWith('•')), 'no item was split mid-way')
}

// -- flowed items span the full content column -------------------------------
{
  const pages = flow([{ id: 'a', kind: 'para', text: words(30) }])
  const item = contentOf(pages[0])[0]
  assert.equal(item.frame.col, 0)
  assert.equal(item.frame.colSpan, F.cols, 'flowed content spans the content box')
  assert.ok(item.frame.yFrac > 0, 'content starts below the running head')
}

// -- structured kinds compile to several parts, all inside the margins -------
{
  const blocks = [
    { id: 'd', kind: 'defList', rows: [
      { term: 'Campaign development', def: 'The process of ideating and carrying out a campaign.' },
      { term: 'Security culture', def: 'Skills, roles and best practices for safety.' },
    ] },
    { id: 'c', kind: 'chart', unit: '%', series: [
      { label: 'Doing', sublabel: 'Campaign/Action', value: 40 },
      { label: 'Being', sublabel: 'Culture/Relating', value: 25 },
      { label: 'Structural factors', value: 7.5 },
    ] },
    { id: 'r', kind: 'links', title: 'Resources', items: [
      { label: 'Groundswell', href: 'https://x.y' },
      { label: 'Another', href: 'https://x.z' },
    ] },
    { id: 'st', kind: 'statement', text: 'Le HUB members spoke with 21 organizers.' },
    { id: 'l2', kind: 'list', columns: 2, items: Array.from({ length: 10 }, (_, i) => `Code ${i}`) },
  ]
  const pages = flow(blocks)
  const placed = pages.flatMap(contentOf)
  for (const b of blocks) {
    assert.ok(placed.some((i) => i.blockId === b.id), `${b.kind} was placed`)
  }
  // A definition list is several elements per row, all belonging to one block.
  assert.ok(placed.filter((i) => i.blockId === 'd').length >= 6, 'defList emits rule/term/def per row')

  for (const item of placed) {
    const end = (item.frame.yFrac + item.frame.hFrac) * F.h
    assert.ok(end <= BOTTOM + 0.5, `${item.blockId} ends at ${end}, past ${BOTTOM}`)
  }
}

// -- chart bars are proportional to their values -----------------------------
{
  const pages = flow([
    { id: 'c', kind: 'chart', unit: '%', series: [
      { label: 'A', value: 40 },
      { label: 'B', value: 20 },
      { label: 'C', value: 0 },
    ] },
  ])
  const bars = pages
    .flatMap(contentOf)
    .filter((i) => i.el.kind === 'block' && i.el.bg?.startsWith('chart'))
  assert.equal(bars.length, 3)
  // Half the value, half the bar. The Figma's hand-drawn bars are only roughly
  // proportional; the tool should be exact.
  assert.ok(Math.abs(bars[1].frame.wFrac * 2 - bars[0].frame.wFrac) < 1e-9, 'bar width tracks value')
  assert.equal(bars[2].frame.wFrac, 0, 'a zero value is a zero-width bar, not a minimum one')
  assert.ok(bars.every((b) => b.frame.wFrac <= 0.5), 'bars stay in their half of the column')
}

// -- definition lists split between rows, never inside one -------------------
{
  const rows = Array.from({ length: 24 }, (_, i) => ({
    term: `Term ${i}`,
    def: words(25),
  }))
  const pages = flow([{ id: 'd', kind: 'defList', rows }])
  assert.ok(pages.length > 1, 'a long definition list paginates')
  // Every term appears exactly once, and always on the same page as its definition.
  const terms = pages.flatMap(contentOf).filter((i) => /-t\d+$/.test(i.el.id))
  assert.equal(terms.length, rows.length, 'every row survives exactly once')
  for (const page of pages) {
    const ids = contentOf(page).map((i) => i.el.id)
    for (const id of ids.filter((x) => /-t(\d+)$/.test(x))) {
      const n = /-t(\d+)$/.exec(id)[1]
      assert.ok(ids.includes(id.replace(`-t${n}`, `-d${n}`)), `term ${n} kept with its definition`)
    }
  }
}

// -- language selects the edition, and both typeset --------------------------
{
  const bilingual = [
    { id: 'h', kind: 'heading', text: { en: 'Findings', fr: 'Constatations' } },
    { id: 'p', kind: 'para', text: { en: 'English body.', fr: 'Corps francais.' } },
    { id: 'u', kind: 'para', text: 'Untranslated, shared by both.' },
  ]
  const en = flowSection({ kind: 'flow', id: 's', title: { en: 'Findings', fr: 'Constatations' }, blocks: bilingual }, deck, stubCtx(), ASSETS, { lang: 'en' })
  const fr = flowSection({ kind: 'flow', id: 's', title: { en: 'Findings', fr: 'Constatations' }, blocks: bilingual }, deck, stubCtx(), ASSETS, { lang: 'fr' })

  const headOf = (pages) => furnitureOf(pages[0]).find((i) => i.el.align === 'left').el.text
  assert.equal(headOf(en), 'FINDINGS')
  assert.equal(headOf(fr), 'CONSTATATIONS', 'the running head follows the edition')

  const bodyOf = (pages, id) => pages.flatMap(contentOf).find((i) => i.blockId === id).el.text
  assert.ok(bodyOf(en, 'p').includes('English body.'))
  assert.ok(bodyOf(fr, 'p').includes('Corps francais.'))
  // A shared string appears in both rather than leaving a blank.
  assert.ok(bodyOf(fr, 'u').includes('Untranslated'), 'plain strings serve both editions')
}

console.log('flow ok — furniture, folios, breaks, keep-with-next, splitting, structured kinds, charts, bilingual')
