import { LANGS, t, type Lang, type LocalizedText } from './localized'

/**
 * Bold, italic, underline, highlight and links, as ranges over a field's text.
 *
 * ## Why a sidecar, and not rich text
 *
 * The obvious model is to make every text-bearing field a `{ text, marks }`
 * object. That would touch `doc/defaults.ts`, all twelve templates, the whole
 * `doc/toolsForChange.ts` transcription, every panel editor and every saved
 * document — to express something that is absent from almost all of them.
 *
 * So marks hang off the block instead, keyed by the field's path. A field with
 * no entry is plain text, which is the state of nearly every field in the
 * document and needs no migration to stay that way.
 *
 * ## Why offsets, and not markup
 *
 * The page is a canvas and the caret is a transparent `<textarea>` laid over
 * the painted glyphs (see `components/InlineEditor.tsx`). That textarea holds
 * *exactly* the string the painter draws, so `selectionStart`/`selectionEnd`
 * are already offsets into it. Storing `**bold**` instead would put characters
 * in the textarea that aren't on the page, and every offset either side of the
 * marker would drift by two.
 *
 * The cost is that offsets have to be maintained as the text changes, which is
 * {@link remapMarks} and is the only genuinely subtle thing in this file.
 */

export interface Mark {
  /** Inclusive start offset into the resolved plain text. */
  from: number
  /** Exclusive end offset. */
  to: number
  b?: true
  i?: true
  u?: true
  /**
   * Highlighted — set on the spread's swash colour.
   *
   * This is the same effect a statement's pink words have always had. It used
   * to be `StatementBlock.highlights`, a list of *phrases* matched against the
   * text at paint time, which meant editing a highlighted word silently lost
   * its highlight and the same word twice in a sentence could only be marked
   * once. As a range it is just another mark, maintained by `remapMarks` like
   * every other, and available to any component rather than only a statement.
   */
  h?: true
  href?: string
}

/** A block's marks, keyed by `path.join('.')` and then by language. */
export type MarkMap = Record<string, Partial<Record<Lang, Mark[]>>>

/** The attributes a single character carries. */
export interface Attrs {
  b?: true
  i?: true
  u?: true
  h?: true
  href?: string
}

export type Flag = 'b' | 'i' | 'u' | 'h'

/** Every flag, for the loops below that must not forget one. */
const FLAGS: Flag[] = ['b', 'i', 'u', 'h']

export const markKey = (path: (string | number)[]): string => path.join('.')

const same = (a: Attrs, b: Attrs): boolean =>
  FLAGS.every((k) => !!a[k] === !!b[k]) && a.href === b.href

const empty = (a: Attrs): boolean => !FLAGS.some((k) => a[k]) && a.href === undefined

/**
 * Spread marks over a per-character array, and gather them back up.
 *
 * Every operation here is expressed as "decompose, change, recompose", which is
 * longer than editing the ranges in place and impossible to get subtly wrong:
 * overlapping bold and italic, a link inside a bold run, toggling the middle out
 * of a mark, all fall out of it. Fields are paragraphs, so the arrays are short.
 */
function explode(marks: Mark[], len: number): Attrs[] {
  const out: Attrs[] = Array.from({ length: len }, () => ({}))
  for (const m of marks) {
    const from = Math.max(0, Math.floor(m.from))
    const to = Math.min(len, Math.ceil(m.to))
    for (let i = from; i < to; i += 1) {
      for (const k of FLAGS) if (m[k]) out[i][k] = true
      if (m.href !== undefined) out[i].href = m.href
    }
  }
  return out
}

function implode(attrs: Attrs[]): Mark[] {
  const out: Mark[] = []
  let start = 0
  while (start < attrs.length) {
    let end = start + 1
    while (end < attrs.length && same(attrs[start], attrs[end])) end += 1
    if (!empty(attrs[start])) out.push({ ...attrs[start], from: start, to: end })
    start = end
  }
  return out
}

/** Clamp to the text, drop empties, and merge runs that say the same thing. */
export const normalizeMarks = (marks: Mark[], len: number): Mark[] =>
  implode(explode(marks, len))

/**
 * What the whole selection carries.
 *
 * A flag is "on" only when *every* character in the range has it — the rule
 * every word processor uses, and the one that makes a second press of ⌘B on a
 * partly-bold selection bold the rest rather than clearing it.
 */
export function activeAt(
  marks: Mark[],
  text: string,
  from: number,
  to: number,
): Record<Flag, boolean> & { href: string | null } {
  const none = { b: false, i: false, u: false, h: false, href: null }
  if (to <= from) return none
  const attrs = explode(marks, text.length).slice(from, to)
  if (!attrs.length) return none
  const all = (k: Flag) => attrs.every((a) => a[k])
  const href = attrs[0].href
  return {
    b: all('b'),
    i: all('i'),
    u: all('u'),
    h: all('h'),
    href: href !== undefined && attrs.every((a) => a.href === href) ? href : null,
  }
}

/** Turn a flag on across the selection, or off if it is already on throughout. */
export function toggleFlag(
  marks: Mark[],
  text: string,
  from: number,
  to: number,
  key: Flag,
): Mark[] {
  const attrs = explode(marks, text.length)
  const on = !attrs.slice(from, to).every((a) => a[key])
  for (let i = from; i < to; i += 1) {
    if (on) attrs[i][key] = true
    else delete attrs[i][key]
  }
  return implode(attrs)
}

/** Set or clear a link across the selection. */
export function setHref(
  marks: Mark[],
  text: string,
  from: number,
  to: number,
  href: string | null,
): Mark[] {
  const attrs = explode(marks, text.length)
  for (let i = from; i < to; i += 1) {
    if (href === null) delete attrs[i].href
    else attrs[i].href = href
  }
  return implode(attrs)
}

/**
 * Carry marks across an edit to the text.
 *
 * A textarea edit is always one contiguous replacement, however it was made —
 * typing, pasting, deleting a selection — so the change can be recovered by
 * measuring the common prefix and suffix and treating everything between them
 * as replaced.
 *
 * **The asymmetry between the two mappers is the whole point.** `from` moves
 * with a strict comparison and `to` with a loose one, which is what makes typing
 * immediately *before* a bold word not bold, and typing immediately *after* one
 * not bold either. Use the same comparison for both and every keystroke at the
 * end of a bold word silently extends the bold — the single most common
 * complaint about editors that get this wrong.
 */
export function remapMarks(marks: Mark[], before: string, after: string): Mark[] {
  if (before === after || !marks.length) return marks

  let prefix = 0
  const min = Math.min(before.length, after.length)
  while (prefix < min && before[prefix] === after[prefix]) prefix += 1

  let suffix = 0
  while (
    suffix < min - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1
  }

  const oldEnd = before.length - suffix
  const newEnd = after.length - suffix
  const delta = after.length - before.length

  const mapFrom = (o: number) => (o < prefix ? o : o >= oldEnd ? o + delta : newEnd)
  const mapTo = (o: number) => (o <= prefix ? o : o >= oldEnd ? o + delta : newEnd)

  const moved = marks
    .map((m) => ({ ...m, from: mapFrom(m.from), to: mapTo(m.to) }))
    .filter((m) => m.to > m.from)
  return normalizeMarks(moved, after.length)
}

/** One run of text that is set differently from its neighbours. */
export interface MarkedSegment extends Attrs {
  text: string
}

/**
 * Split text at every mark boundary.
 *
 * Tolerant of marks that have fallen out of step with the text — an imported
 * document, or one edited in a second tab — because a page that paints wrongly
 * is recoverable and a page that throws is not.
 */
export function toSegments(text: string, marks: Mark[] | undefined): MarkedSegment[] {
  if (!marks?.length) return [{ text }]
  const attrs = explode(marks, text.length)
  const out: MarkedSegment[] = []
  let start = 0
  while (start < text.length) {
    let end = start + 1
    while (end < text.length && same(attrs[start], attrs[end])) end += 1
    out.push({ ...attrs[start], text: text.slice(start, end) })
    start = end
  }
  return out.length ? out : [{ text }]
}

/** Read one field's marks for one language. */
export const marksAt = (
  map: MarkMap | undefined,
  key: string,
  lang: Lang,
): Mark[] | undefined => map?.[key]?.[lang]

/**
 * Write one field's marks for one language, dropping empties as they empty.
 *
 * Returns undefined when nothing is left, so a block that had marks and then
 * lost them is indistinguishable from one that never had any — otherwise the
 * document would slowly fill with `{ text: { en: [] } }`.
 */
export function withMarks(
  map: MarkMap | undefined,
  key: string,
  lang: Lang,
  marks: Mark[],
): MarkMap | undefined {
  const field = { ...map?.[key] }
  if (marks.length) field[lang] = marks
  else delete field[lang]

  const next: MarkMap = { ...map }
  if (Object.keys(field).length) next[key] = field
  else delete next[key]
  return Object.keys(next).length ? next : undefined
}

/**
 * Build highlight marks by finding phrases in a field's text.
 *
 * This is how `StatementBlock.highlights` used to work at *paint* time, kept
 * here for the two callers that still need it: migration v9, which converts
 * stored documents once, and the seeds in `doc/defaults.ts`, `templates/` and
 * `doc/toolsForChange.ts`, which are authored as phrases because writing out
 * offsets by hand would be unreadable and would rot the moment the copy
 * changed.
 *
 * Nothing calls it while rendering. Once a document is loaded its highlights
 * are ranges, and the whole point of the change is that they stay put when the
 * words around them move.
 *
 * Matching is by literal phrase, in the order given, each used once, resolved
 * per language — so the same block can highlight "21 organizers" in English and
 * "21 organisateurs" in French. A phrase that isn't found is skipped rather
 * than throwing: it was decoration, and losing one should not stop the page.
 */
export function phraseMarks(
  value: LocalizedText,
  phrases: string[],
  key = 'text',
): MarkMap | undefined {
  let map: MarkMap | undefined
  for (const lang of LANGS) {
    const text = t(value, lang)
    if (!text) continue
    const marks: Mark[] = []
    let at = 0
    for (const phrase of phrases) {
      if (!phrase) continue
      const found = text.indexOf(phrase, at)
      if (found < 0) continue
      marks.push({ from: found, to: found + phrase.length, h: true })
      at = found + phrase.length
    }
    if (marks.length) map = withMarks(map, key, lang, normalizeMarks(marks, text.length))
  }
  return map
}

/** Merge two mark maps, with `extra` winning where both name a field. */
export const mergeMarks = (base: MarkMap | undefined, extra: MarkMap | undefined): MarkMap | undefined => {
  if (!base) return extra
  if (!extra) return base
  const out: MarkMap = { ...base }
  for (const [key, byLang] of Object.entries(extra)) out[key] = { ...out[key], ...byLang }
  return out
}
