/**
 * Le HUB brand tokens, measured from the *Tools for Change* redesign.
 *
 * Source: Figma file `bsxXaOejl9i6KZ9FvXXpPO`, 11 spreads of 1190 × 842 pt, each
 * holding two 595 × 842 A4 pages. Every number below was read off that file, not
 * eyeballed from a render — where a value is a judgement call rather than a
 * measurement it says so.
 *
 * ## Reading the numbers
 *
 * Design values are quoted in points at the A4 reference page (595 pt wide) and
 * converted to fractions of the page width by {@link ptFrac}. Nothing downstream
 * ever sees a raw point value, so a 2× export and a 160 px thumbnail scale
 * identically — but the constants stay legible against the Figma file, which is
 * what makes them checkable a year from now.
 */

/** The A4 page the design was drawn at. Only ever a unit reference. */
export const REF_PAGE_W = 595
export const REF_PAGE_H = 842

/** A design point at the reference page, as a fraction of page width. */
export const ptFrac = (pt: number): number => pt / REF_PAGE_W

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * The page surfaces. `lime` and `ochre` are the same three channel values
 * permuted, which is why they sit together without clashing.
 *
 * Facing pages deliberately contrast — the observed spreads pair
 * lime|paper, pink|paper, ochre|photo and pink|pink.
 */
export const SURFACES = {
  paper: '#FFF8EC',
  lime: '#99CC00',
  ochre: '#CC9900',
  pink: '#FF669E',
} as const

export type SurfaceId = keyof typeof SURFACES

/**
 * Ink is black at 70% over whatever the page surface is — never a pre-blended
 * hex. Every text fill and every rule in the source file uses this exact alpha,
 * and blending it by hand would be wrong on each of the four surfaces.
 */
export const INK_ALPHA = 0.7
export const INK = `rgba(0, 0, 0, ${INK_ALPHA})`

/**
 * The swash — the colour rectangle behind a run of text (TOC rows, cover
 * subtitle, pull quotes, stat callouts). It takes the *spread's* accent, so it
 * is a role resolved per page, not a fixed colour. Pink is the accent on every
 * surface except pink itself, which falls back to paper.
 */
export const swashFor = (surface: SurfaceId): string =>
  surface === 'pink' ? SURFACES.paper : SURFACES.pink

/**
 * Categorical chart colours, in the order the source file uses them. Same
 * construction as the surfaces: one channel at 0.8 or 1.0, the rest derived, so
 * a six-series chart stays inside the brand rather than reaching for a generic
 * ramp.
 */
export const CHART_COLORS = [
  '#63CC00', // green
  '#00CC6D', // emerald
  '#009CCC', // blue
  '#FF669E', // pink (brand)
  '#FF6666', // coral
  '#CC9900', // ochre (brand)
] as const

// ---------------------------------------------------------------------------
// Page geometry
// ---------------------------------------------------------------------------

/**
 * 40 pt on all four sides — measured from the 515–516 pt content column on a
 * 595 pt page. The full-bleed colour field is the page *background*, a page
 * property rather than an element, so bleed and margins coexist: the colour runs
 * to the trim, the type never does.
 */
export const MARGIN = ptFrac(40)

/** Hairline rules, above the running head and at the foot of every page. */
export const RULE_WEIGHT = ptFrac(1)
export const RULE_COLOR = INK

/**
 * Gap between blocks in the flow. The source pages are Figma vertical
 * auto-layout frames with `itemSpacing: 10`; the typesetter rounds this to the
 * baseline so facing pages stay registered.
 */
export const BLOCK_GAP = ptFrac(10)

/**
 * First-line indent on body copy. Body paragraphs are set indented with *no*
 * space between them — classic book setting, and the strongest editorial signal
 * in the design. Judgement call: the source fakes the indent with whitespace, so
 * 2em is read off the rendered result rather than a stored value.
 */
export const BODY_INDENT_EM = 2

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * The modular scale is ratio **1.2** off a 12.5 pt base, and it is exact:
 *
 *   12.5 × 1.2² = 18      lede
 *   12.5 × 1.2⁴ = 25.92   deck / definition
 *   12.5 × 1.2⁸ = 53.7477 chapter title (file says 53.75)
 *
 * Note this is *not* the 1.25 the poster and slide formats use, which is why
 * `PageFormat` now carries its own ratio.
 */
export const TYPE_RATIO = 1.2
export const TYPE_BASE_PT = 12.5

/**
 * The type roles, as steps on the ladder above.
 *
 * `family` picks between the two brand voices:
 *   'display' → Review Condensed Heavy — running heads, folios, cover title,
 *               TOC rows, stat numbers, definition terms, quote overlays.
 *   'text'    → Neue Haas Grotesk Display Pro 65 Medium — chapter titles, ledes,
 *               body, sub-heads, captions.
 *
 * `lineHeight` and `tracking` are multiples of the font size, matching the
 * percentages in the source file.
 */
export interface TypeRole {
  family: 'display' | 'text'
  /** Step on the 1.2 ladder. Fractional steps are hand-nudges from the file. */
  step: number
  lineHeight: number
  tracking: number
  caps?: boolean
  /** Size to fill the available width instead of using `step`. */
  autoFit?: boolean
}

export const TYPE: Record<string, TypeRole> = {
  /** 53.75 pt in the file. */
  chapterTitle: { family: 'text', step: 8, lineHeight: 0.9, tracking: 0 },
  /** 25.92 pt — the definition under a chapter title, and definition-list bodies. */
  deck: { family: 'text', step: 4, lineHeight: 1.05, tracking: 0 },
  /** 18 pt — the opening paragraph of a section, unindented. */
  lede: { family: 'text', step: 2, lineHeight: 1.1, tracking: 0.01 },
  /** 12.64 pt — running text. */
  body: { family: 'text', step: 0, lineHeight: 1.1, tracking: 0.01 },
  /** 12.64 pt caps, in a rule/label/rule band. */
  subhead: { family: 'text', step: 0, lineHeight: 1.04, tracking: 0, caps: true },
  /** 13.21 pt in the file — a nudge off step 0, not a distinct tier. */
  caption: { family: 'text', step: 0, lineHeight: 1.1, tracking: 0.01 },
  /** 12.64 pt condensed caps, +2% tracking. */
  runningHead: { family: 'display', step: 0, lineHeight: 1.04, tracking: 0.02, caps: true },
  /** 8 pt. Step -2 is 8.68 pt; the difference is invisible on a folio. */
  folio: { family: 'display', step: -2, lineHeight: 1.04, tracking: 0.02 },
  /**
   * The giant percentages on the stat page. The file has them at 71.2 and 74.4
   * depending on digit count, i.e. optically fitted rather than set to a step —
   * so this role fits to width and step 10 (77.4 pt) is only the ceiling.
   */
  statNumber: {
    family: 'display',
    step: 10,
    lineHeight: 0.9,
    tracking: 0.01,
    caps: true,
    autoFit: true,
  },
} as const

export type TypeRoleId = keyof typeof TYPE

/** Size in points at the reference page, for a role. */
export const roleSizePt = (role: TypeRole): number => TYPE_BASE_PT * TYPE_RATIO ** role.step

/**
 * The baseline every vertical advance snaps to: one line of body copy.
 * This is the mechanism behind the editorial feel — it is what keeps the text
 * on facing pages sitting on the same lines.
 */
export const BASELINE = ptFrac(roleSizePt(TYPE.body) * TYPE.body.lineHeight)

// ---------------------------------------------------------------------------
// Texture
// ---------------------------------------------------------------------------

/**
 * The grain sitting over every page. In the source it is the last child of each
 * page frame — desaturated, contrast lifted, placed rotated (892 × 595 on a
 * 595 × 842 page) and locked on the cover.
 *
 * Note the vector-PDF export composites this *under* the text rather than over
 * it; see `export/exportPdf.ts`. The canvas preview does the same, so the two
 * cannot drift.
 */
export const TEXTURE = {
  /** Texturelabs_Grunge_265XL — asset still to be supplied by Connor. */
  id: 'grunge265',
  saturation: 0,
  contrast: 1.133,
  scale: 0.5,
  rotated: true,
  defaultOpacity: 0.4,
} as const
