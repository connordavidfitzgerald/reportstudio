import {
  COLS,
  CONTENT_BOTTOM,
  CONTENT_TOP,
  FOOT_RULE_Y,
  GUTTER,
  HEAD_RULE_Y,
  MARGIN,
  PAGE_H,
  ROWS,
  ROW_H,
  rowY,
} from '../../config/brand'

/**
 * The grid, over the page.
 *
 * ## Why this is a DOM overlay and not a painter
 *
 * Everything else that appears on a page goes through `render/compose.ts`,
 * because the canvas and the PDF share those painters and anything drawn in
 * only one of them is a divergence waiting to be noticed at export time. The
 * guides are the deliberate exception, and the reason is the same one: they
 * must *never* reach the PDF. Drawing them in the painter would mean a flag
 * threaded from here down through `renderLeaf` into every stack, with a real
 * chance that some future export path forgets to clear it and ships a client a
 * report with a grid printed on it.
 *
 * As chrome, that cannot happen — there is no code path from here to `pdf-lib`.
 *
 * ## What it draws
 *
 * The real furniture, not a decorative grid: the nine columns and their eight
 * gutters, the thirteen rows, the 40pt margins, the content band, and the two
 * hairlines the page already prints above the running head and at its foot.
 * Someone lining a block up against these is lining it up against the design
 * system.
 *
 * The rows are drawn a step fainter than the columns. They are the newer half
 * of the grid and the one a drag snaps to, so they need to be visible while
 * something is moving and invisible while something is being read — at full
 * column strength the page turns into graph paper and you stop being able to
 * see the type at all.
 *
 * ## The drop line
 *
 * `snap` is the one line a drag has actually chosen, drawn solid across the
 * measure. Without it the snapping is a mystery: the block lands somewhere
 * sensible and nobody can tell *why*, so nobody learns where it will go next
 * time. With it, the rule the editor is following is on screen.
 *
 * Sized in percentages of the page, like every other overlay here, so it
 * survives resize and zoom without measuring anything.
 */
export function GridGuides({
  pageWpt,
  highlight,
  snap,
}: {
  /** The page's width in points: 595 for a leaf, 1190 for a full-spread cover. */
  pageWpt: number
  /** Columns to pick out — the run a drag would drop into. */
  highlight?: { col: number; span: number } | null
  /** The line a vertical drag has snapped to, in page points. */
  snap?: number | null
}) {
  const measure = pageWpt - MARGIN * 2
  const colW = (measure - GUTTER * (COLS - 1)) / COLS
  const pct = (v: number, of: number) => `${(v / of) * 100}%`

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: COLS }, (_, c) => {
        const lit =
          !!highlight && c >= highlight.col && c < highlight.col + highlight.span
        return (
          <div
            key={c}
            style={{
              left: pct(MARGIN + c * (colW + GUTTER), pageWpt),
              width: pct(colW, pageWpt),
              top: pct(CONTENT_TOP, PAGE_H),
              height: pct(CONTENT_BOTTOM - CONTENT_TOP, PAGE_H),
            }}
            className={`absolute transition-colors ${
              lit ? 'bg-select/20' : 'bg-select/[0.055]'
            }`}
          />
        )
      })}

      {/* The margins and the content band, as hairlines. Faint enough to read
        * the page through, which is the whole point of a guide. */}
      {[MARGIN, pageWpt - MARGIN].map((x) => (
        <div
          key={`v${x}`}
          style={{ left: pct(x, pageWpt) }}
          className="absolute inset-y-0 w-px bg-black/15"
        />
      ))}
      {[HEAD_RULE_Y, CONTENT_TOP, CONTENT_BOTTOM, FOOT_RULE_Y].map((y) => (
        <div
          key={`h${y}`}
          style={{ top: pct(y, PAGE_H) }}
          className="absolute inset-x-0 h-px bg-black/15"
        />
      ))}

      {/* The thirteen rows, as bands rather than lines, so the gutter between
        * two of them reads as a gutter — which is what a block dropped on the
        * next row down is actually clearing. */}
      {Array.from({ length: ROWS }, (_, r) => (
        <div
          key={`r${r}`}
          style={{
            left: pct(MARGIN, pageWpt),
            width: pct(pageWpt - MARGIN * 2, pageWpt),
            top: pct(rowY(r), PAGE_H),
            height: pct(ROW_H, PAGE_H),
          }}
          className="absolute border-y border-select/[0.07]"
        />
      ))}

      {snap != null && (
        <div
          style={{
            left: pct(MARGIN, pageWpt),
            width: pct(pageWpt - MARGIN * 2, pageWpt),
            top: pct(snap, PAGE_H),
          }}
          className="absolute h-px bg-select"
        />
      )}
    </div>
  )
}
