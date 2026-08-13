/**
 * Handing a file to the browser, and naming it.
 *
 * Shared by the PDF export and the `.lehub.json` backup so that a report called
 * "Tools for Change" comes out as `tools-for-change.pdf` and
 * `tools-for-change.lehub.json` rather than two different guesses.
 */

/** A document name as a filename stem: lowercase, hyphenated, ASCII-safe. */
export function fileSlug(name: string, fallback = 'report'): string {
  const slug = name
    .normalize('NFKD')
    // Strip the combining marks NFKD just split off, so "Québec" slugs as
    // "quebec" rather than losing the letter entirely.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || fallback
}

/** Save a blob under `filename`, cleaning up the object URL afterwards. */
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoked on the next tick rather than immediately: Safari has been known to
  // cancel the download if the URL dies in the same frame as the click.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
