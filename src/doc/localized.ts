export type Lang = 'en' | 'fr'

export const LANGS: Lang[] = ['en', 'fr']

/**
 * A string that may differ per language.
 *
 * A plain `string` means "the same in both", which is not a shortcut but the
 * common case: figures, proper nouns, URLs and most labels are identical in the
 * EN and FR editions. Making that the cheap representation means a monolingual
 * document carries no translation machinery at all, and a bilingual one only
 * pays for the strings that actually differ.
 *
 * The alternative — every field a `{ en, fr }` pair — would double the size of
 * every document and force a translation decision on content that has none.
 */
export type LocalizedText = string | Partial<Record<Lang, string>>

/**
 * Resolve for a language, falling back to the other rather than to empty.
 *
 * A missing translation should show the source text, not a blank page: an
 * untranslated paragraph is obvious and fixable, a vanished one is neither.
 *
 * ## Absent is not empty
 *
 * The fallback fires on `undefined` — no translation was ever written — and not
 * on `''`, which is somebody having deliberately cleared the field.
 *
 * Conflating the two made every text field impossible to empty. Clearing a
 * shared string splits it (`setLang` below turns `'Hello'` into
 * `{ en: '', fr: 'Hello' }`), and treating that `''` as missing sent the
 * resolver to the French — which is a *copy* of the English, not a translation
 * of it. So deleting the last character put the original text straight back on
 * the page, and no placeholder could ever be removed.
 */
export function t(value: LocalizedText | undefined, lang: Lang): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  const own = value[lang]
  if (own !== undefined) return own
  for (const other of LANGS) {
    const alt = value[other]
    if (alt !== undefined) return alt
  }
  return ''
}

/** Set one language's text, keeping the other. */
export function setLang(value: LocalizedText | undefined, lang: Lang, text: string): LocalizedText {
  const current = typeof value === 'string' ? { en: value, fr: value } : { ...(value ?? {}) }
  current[lang] = text
  // Collapse back to a plain string when both languages agree, so documents
  // don't accumulate redundant pairs.
  return current.en === current.fr ? (current.en ?? '') : current
}

/**
 * True when this text has been written in every language.
 *
 * Tested on presence, not truthiness, for the same reason as {@link t}: a field
 * someone deliberately cleared in French has been dealt with, and nagging about
 * it would be wrong.
 */
export const isFullyTranslated = (value: LocalizedText | undefined): boolean =>
  typeof value === 'string' || LANGS.every((l) => value?.[l] !== undefined)
