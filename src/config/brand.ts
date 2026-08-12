/**
 * The Le HUB report design system, measured from the *Tools for Change* file.
 *
 * Source: Figma `bsxXaOejl9i6KZ9FvXXpPO`, 11 spreads of 1190 × 842, each holding
 * two 595 × 842 A4 leaves. Every number here was read off that file with
 * `absoluteBoundingBox` — not eyeballed from a render, and not inferred from a
 * ratio. Where a value is a judgement call it says so.
 *
 * ## Everything is in points
 *
 * There is exactly one page format, so there is no reason for geometry to be
 * expressed as fractions of anything. A point here is a point in the Figma file,
 * which is what makes these constants checkable a year from now. The renderer
 * applies a single `scale = canvasWidth / PAGE_W` at the boundary, so a 148px
 * thumbnail and a 2× export both work without any of these numbers moving.
 *
 * (The previous version of this file used `ptFrac` fractions because it served
 * three formats at two type ratios. It doesn't any more.)
 */

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

/** A4, in points. */
export const PAGE_W = 595
export const PAGE_H = 842

/**
 * A spread is two leaves side by side, and it is the unit the editor shows and
 * the unit the cover is composed on. Body leaves are still laid out
 * independently — only the cover treats the full 1190 as one canvas.
 */
export const SPREAD_W = PAGE_W * 2

/** 40pt on all four sides. */
export const MARGIN = 40

/** The text measure: 595 − 2 × 40. */
export const MEASURE = PAGE_W - MARGIN * 2 // 515

// ---------------------------------------------------------------------------
// The column grid
// ---------------------------------------------------------------------------

/**
 * Nine columns of 51pt with 7pt gutters, per leaf:
 *
 *   9 × 51 + 8 × 7 = 459 + 56 = 515
 *
 * This is exact, and it is the grid the file was actually drawn on — it was not
 * imposed afterwards. Every structural edge in all 11 spreads lands on a column
 * line to within ~1pt:
 *
 *   def-list term      3 cols = 167     measured 165.1
 *   def-list def x     col 5  = 290     measured 291.1
 *   def-list def w     4 cols = 225     measured 223.9
 *   quote / figure x   col 1  = 58      measured 58.0   (exact)
 *   quote / figure w   7 cols = 399     measured 399.0  (exact)
 *   colophon intro w   6 cols = 341     measured 340
 *   about-author x     col 4  = 232     measured 231.1
 *   about-author w     5 cols = 283     measured 283.9
 *
 * The one thing that is deliberately off-grid is a chart bar, whose width *is*
 * its value — snapping it to a column line would misreport the data.
 */
export const COLS = 9
export const COL_W = 51
export const GUTTER = 7

/** Left edge of column `c` (0-based), relative to the content box. */
export const colX = (c: number): number => c * (COL_W + GUTTER)

/** Width of a run of `n` columns, gutters included. */
export const colSpan = (n: number): number => n * COL_W + (n - 1) * GUTTER

// ---------------------------------------------------------------------------
// Vertical furniture
// ---------------------------------------------------------------------------

/**
 * The page chrome, identical on every leaf except the cover and full-bleed
 * plates. Rebuilt per leaf at render time and never stored in the document —
 * a running head that could go stale relative to its section would be a bug
 * waiting to happen.
 *
 * `CONTENT_BOTTOM` is confirmed rather than assumed: "Building coalitions", the
 * last line of the resources page, sits exactly on it.
 */
export const RUNNING_HEAD_Y = 20
export const HEAD_RULE_Y = 37
export const CONTENT_TOP = 57
export const CONTENT_BOTTOM = 802
export const FOOT_RULE_Y = 822

/** Height available to content on a body leaf. */
export const CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP // 745

/** Hairline rules, above the running head and at the foot of every leaf. */
export const RULE_WEIGHT = 1

/**
 * There is **no baseline grid**. The file stacks content with auto-layout gaps,
 * and facing pages are not registered to shared lines — checked across all 11
 * spreads. An earlier version of this module invented a baseline and snapped to
 * it; that produced rhythm the design does not have.
 *
 * These are the gaps the file actually uses.
 */
export const GAP = {
  /** Within a compound row: rule to content, term to definition. */
  tight: 5,
  /** Between TOC entries. */
  toc: 6,
  /** Between blocks in a flow, and inside the chart and resources stacks. */
  block: 10,
  /** Between definition-list rows. The airiest gap in the system. */
  defRow: 70,
} as const

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * The page surfaces.
 *
 * Two paper tints appear in the file — `#FFFDF2` on the cover and three
 * spreads, `#FFF8EC` on four others — with nothing distinguishing their use.
 * Read as drift rather than intent and collapsed to one on Connor's call, so
 * there is a single paper in the system.
 */
export const SURFACES = {
  paper: '#FFFDF2',
  lime: '#99CC00',
  ochre: '#CC9900',
  pink: '#FF669E',
} as const

export type SurfaceId = keyof typeof SURFACES

/**
 * Ink is black at an alpha over whatever the surface is — never a pre-blended
 * hex, because the same ink sits on five different surfaces.
 *
 * Four alphas are in use, and they are a de-emphasis ladder rather than four
 * arbitrary values: `body` is the default, `strong` picks the un-highlighted
 * words out of a statement, `soft` sets a quote overlay back into its
 * photograph, `muted` is a chart sub-label under its label.
 */
export const INK_ALPHA = {
  strong: 0.8,
  body: 0.7,
  soft: 0.6,
  muted: 0.5,
} as const

export type InkAlphaId = keyof typeof INK_ALPHA

export const ink = (alpha: InkAlphaId = 'body'): string => `rgba(0, 0, 0, ${INK_ALPHA[alpha]})`

/** The default ink, which is almost everything. */
export const INK = ink('body')

/**
 * The swash — the colour rectangle behind a run of text. It takes the spread's
 * accent, so it is a role resolved per page rather than a fixed colour. Pink is
 * the accent on every surface except pink itself; ochre pages use ochre, which
 * is why the quote overlay on the findings plate is an ochre swash.
 */
export const swashFor = (surface: SurfaceId): string =>
  surface === 'pink' ? SURFACES.paper : surface === 'ochre' ? SURFACES.ochre : SURFACES.pink

/**
 * Vertical breathing room on a swash, above the cap line and below the
 * descender, as a fraction of the font size.
 *
 * The bar's *height* is not a constant: it is taken from the font's own ink
 * extents at render time (see `render/text.ts` → `swashMetrics`), because a
 * fraction of the em cannot hug both a caps-only display face and a mixed-case
 * text one. For the record, the ratios measured in the file were:
 *
 *   display  statement 0.836 · TOC chapter 0.833 · quote overlay 0.886
 *   text     TOC sub-row 1.00 · caption 1.03 · cover subtitle 1.089
 *
 * — which is the same voice split, arrived at by hand.
 */
export const SWASH_PAD_Y = 0.04

/** Horizontal breathing room on a swash, per side. Measured on the TOC rows. */
export const SWASH_PAD_X = 2

/**
 * Categorical chart colours, in the order the file uses them down the
 * methodology plate.
 *
 * These were measured off the bars. An earlier version of this file had a
 * different six (a generated ramp built from the brand hues); it was never in
 * the design.
 */
export const CHART_COLORS = [
  '#CC9900', // ochre
  '#99CC00', // lime
  '#009841', // green
  '#40B5EA', // blue
  '#A08EC4', // violet
  '#FF669E', // pink
] as const

/**
 * Bar-chart metrics, measured off the methodology plate.
 *
 * `barFull` is the width of the largest bar in the file (the 40% row). It is
 * not a column count — 362 sits between 6 cols (341) and 7 (399) — because a
 * bar's width is its value and the grid deliberately does not apply. Everything
 * else in the chart does sit on the grid.
 *
 * The measured bars are only roughly proportional to their values (10% is drawn
 * at 84 where proportion wants 90.5, and 2.5% at 39 where it wants 22.6). Those
 * are drawing slips, not a scale: this renders them true, which means the chart
 * will not match the file bar for bar, and will be right.
 */
export const CHART = {
  barHeight: 121,
  /** Bar to number/label group. */
  gutter: 20,
  rowGap: 7.4,
  barFull: 362,
} as const

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * ## There is no modular scale
 *
 * A previous version of this file claimed the type was a 1.2 ladder off a 12.5pt
 * base, and that the ladder was exact. It isn't. The sizes actually in the file
 * are hand-rounded:
 *
 *   8  12.6  13.2  14  16  18  20  24  25.9  30  36  49.3  53.8  71.2/74.4  272.8
 *
 * Some of those sit near ladder steps and most don't (20, 24, 30, 36 are round
 * numbers; 49.3 and 53.8 are not steps of anything). Encoding a ratio would mean
 * every role rendered at a size the designer did not choose, so the roles below
 * carry their measured size directly.
 *
 * `size` is in points at the A4 page. `lineHeight` and `tracking` are multiples
 * of the size, matching the percentages in the file.
 */
export interface TypeRole {
  voice: 'display' | 'text'
  /** Points. Omitted when the role fits itself to the available width. */
  size?: number
  lineHeight: number
  /** Em. */
  tracking: number
  case?: 'upper' | 'lower'
  /** Size to fill the measure instead of using `size`. */
  autoFit?: boolean
  /** Default ink for the role; `body` unless stated. */
  alpha?: InkAlphaId
}

/**
 * The two voices split cleanly by function:
 *
 *   display (Review Condensed Heavy) — page chrome, and anything SHOUTED:
 *     running heads, folios, cover title, TOC chapter rows, definition terms,
 *     statements, quote overlays, stat numbers.
 *   text (Neue Haas Grotesk Display Pro 65 Medium) — everything read as prose:
 *     chapter titles, ledes, body, sub-heads, captions, links, labels, and the
 *     TOC's folios and sub-rows.
 *
 * Note that chapter titles are the *text* voice at 53.8pt, not the display one.
 * That inversion — the biggest type on a body page being the quieter face — is
 * a real signature of the design and easy to get backwards.
 *
 * **The display voice is always uppercase.** Every Review Condensed role below
 * carries `case: 'upper'`, so nothing set in that face can reach the page in
 * mixed case regardless of how the copy was typed. The one deliberate exception
 * is {@link TYPE.wordmark} — a logo is not type.
 */
export const TYPE = {
  // -- page chrome ---------------------------------------------------------
  runningHead: { voice: 'display', size: 12.6, lineHeight: 1.04, tracking: 0.02, case: 'upper' },
  folio: { voice: 'display', size: 8, lineHeight: 1.04, tracking: 0.02, case: 'upper' },

  // -- cover ---------------------------------------------------------------
  /** 272.8pt in the file, but it is fitted to the spread, not set. */
  coverTitle: { voice: 'display', lineHeight: 0.8, tracking: 0, autoFit: true, case: 'upper' },
  coverSubtitle: { voice: 'text', size: 37.1, lineHeight: 1.0, tracking: -0.03 },
  /**
   * "Le HUB" on the cover.
   *
   * The only display-voice role NOT uppercased, because it is a wordmark rather
   * than a run of type. The file sets it in Review *Black* at 30.4/50%/−4%;
   * that cut isn't loaded, so Condensed Heavy stands in and the mixed case is
   * preserved.
   */
  wordmark: { voice: 'display', size: 30.4, lineHeight: 0.5, tracking: -0.04 },

  // -- contents ------------------------------------------------------------
  tocChapter: { voice: 'display', size: 36, lineHeight: 0.8, tracking: 0, case: 'upper' },
  tocChapterFolio: { voice: 'text', size: 30, lineHeight: 0.9, tracking: 0 },
  tocSection: { voice: 'text', size: 18, lineHeight: 0.8, tracking: 0, case: 'lower' },
  /** The "(campaigns/actions)" half of a TOC sub-row, set smaller inline. */
  tocQualifier: { voice: 'text', size: 14, lineHeight: 0.8, tracking: 0, case: 'lower' },
  tocSectionFolio: { voice: 'text', size: 13, lineHeight: 0.9, tracking: 0 },

  // -- openers -------------------------------------------------------------
  chapterTitle: { voice: 'text', size: 53.8, lineHeight: 0.9, tracking: 0 },
  /** The definition under a chapter title. Same size as `sectionHeading`. */
  chapterDeck: { voice: 'text', size: 25.9, lineHeight: 1.05, tracking: 0 },
  /** "Resources", "Related Articles". */
  sectionHeading: { voice: 'text', size: 25.9, lineHeight: 1.05, tracking: 0 },

  // -- set blocks ----------------------------------------------------------
  defTerm: { voice: 'display', size: 20, lineHeight: 1.0, tracking: 0.01, case: 'upper' },
  defBody: { voice: 'text', size: 12.6, lineHeight: 1.05, tracking: 0 },
  /** Caps in a rule/label/rule band, 23.2pt tall overall. */
  subhead: { voice: 'text', size: 12.6, lineHeight: 1.04, tracking: 0, case: 'upper' },
  link: { voice: 'text', size: 18, lineHeight: 1.05, tracking: 0 },
  caption: { voice: 'text', size: 12.6, lineHeight: 1.05, tracking: 0 },
  credits: { voice: 'text', size: 12.6, lineHeight: 1.04, tracking: 0 },

  // -- shouted -------------------------------------------------------------
  statement: { voice: 'display', size: 49.3, lineHeight: 0.9, tracking: 0.01, case: 'upper' },
  /** The "(Ontario, Quebec, …)" line under a statement. */
  statementNote: { voice: 'display', size: 24, lineHeight: 0.9, tracking: 0.02, case: 'upper' },
  quoteOverlay: {
    voice: 'display',
    size: 29.8,
    lineHeight: 0.85,
    tracking: 0.01,
    case: 'upper',
    alpha: 'soft',
  },

  // -- chart ---------------------------------------------------------------
  /**
   * 71.2 and 74.4 in the file depending on digit count — optically fitted rather
   * than set, so this role fits to its box and 74.4 is only the ceiling.
   */
  statNumber: { voice: 'display', size: 74.4, lineHeight: 0.9, tracking: 0.01, autoFit: true, case: 'upper' },
  statLabel: { voice: 'text', size: 13.2, lineHeight: 1.1, tracking: 0.01 },
  statSublabel: { voice: 'text', size: 13.2, lineHeight: 1.1, tracking: 0.01, alpha: 'muted' },
} as const satisfies Record<string, TypeRole>

export type TypeRoleId = keyof typeof TYPE

/**
 * A role, widened to {@link TypeRole}.
 *
 * `satisfies` above keeps the literal types so a typo in a role name is caught,
 * but that also means `TYPE.folio.alpha` is a type error rather than
 * `undefined` — the optional keys only exist on the entries that set them.
 * Reading through here restores the common shape.
 */
export const typeRole = (id: TypeRoleId): TypeRole => TYPE[id]

// ---------------------------------------------------------------------------
// Body copy
// ---------------------------------------------------------------------------

/**
 * ## Body size is an editorial choice, not a constant
 *
 * This is the single most structural thing about the design, and the thing the
 * old model could not say. Running text is set at four different sizes depending
 * on what the page is doing:
 *
 *   xs  12.6  the dense pages — definition bodies, methodology, credits
 *   s   16    chapter body, colophon
 *   m   18    quotes, resources, the second half of a findings page
 *   l   25.9  section openers: the intro, the exec-summary lede, findings
 *
 * A page picks one and holds it. Treating 12.6 as "the" body size and the rest
 * as headings would misread the design badly — the intro page is 667pt of
 * running text at 25.9.
 */
export const BODY_SIZE = {
  xs: 12.6,
  s: 16,
  m: 18,
  l: 25.9,
} as const

export type BodySizeId = keyof typeof BODY_SIZE

/**
 * Running text and set blocks are leaded and tracked differently.
 *
 * The file is not perfectly consistent about this — 2:479's chapter body is at
 * 1.05/0 where 1:33's and 1:47's running text is at 1.10/0.01 — but the split
 * holds for the clear majority, and picking per-paragraph would be noise rather
 * than design.
 */
export const RUNNING_TEXT = { lineHeight: 1.1, tracking: 0.01 } as const
export const SET_TEXT = { lineHeight: 1.05, tracking: 0 } as const

/**
 * First-line indent on body copy, with **no** space between paragraphs — classic
 * book setting, and the strongest editorial signal in the design.
 *
 * It is a flat 64pt at every body size, not a multiple of the em: the same 64pt
 * indents 12.6pt methodology text and 25.9pt findings text. (An earlier version
 * of this file had it as 2em, which would make it 25pt on the dense pages.)
 */
export const BODY_INDENT = 64

// ---------------------------------------------------------------------------
// Texture
// ---------------------------------------------------------------------------

/**
 * Two overlays sit above every page, both in soft light. The file has them as
 * the last children of each page frame.
 *
 * Note there are *two*: an earlier version of this module knew only about the
 * grain. The `sunset` layer is what warms the paper and keeps the four surfaces
 * from reading as flat swatches.
 *
 * Both composite above vector text in the PDF export, which keeps the text
 * extractable — see `export/exportPdf.ts`.
 */
export const OVERLAYS = [
  {
    /** Texturelabs_Grunge_265XL. Placed rotated: 892.4 × 595 on a 595 × 842 page. */
    id: 'grunge265',
    blend: 'soft-light',
    rotated: true,
    opacity: 1,
  },
  {
    /** "Sunset 001" — a full-page wash. */
    id: 'sunset001',
    blend: 'soft-light',
    rotated: false,
    opacity: 1,
  },
] as const
