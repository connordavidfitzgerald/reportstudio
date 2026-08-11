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
 */
export function t(value: LocalizedText | undefined, lang: Lang): string {
  if (value === undefined) return ''
  if (typeof value === 'string') return value
  const own = value[lang]
  if (own !== undefined && own !== '') return own
  for (const other of LANGS) {
    const alt = value[other]
    if (alt) return alt
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

/** True when this text has a distinct translation for every language. */
export const isFullyTranslated = (value: LocalizedText | undefined): boolean =>
  typeof value === 'string' || LANGS.every((l) => !!value?.[l])
