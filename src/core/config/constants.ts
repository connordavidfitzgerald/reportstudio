import type { HalftoneParams } from "../types";

/** The fixed brand pink — the notched outline / swash fill. */
export const OUTLINE_COLOR = "#FF669E";

/**
 * Every glyph fill and every rule is black at 70% over the page surface.
 *
 * Measured from the *Tools for Change* redesign, where all four surfaces rely on
 * this one alpha. It must stay an alpha rather than a blended hex — pre-blending
 * would be wrong on each of the four backgrounds.
 *
 * Delta from the poster app, which uses 0.55.
 */
export const TEXT_COLOR = "rgba(0, 0, 0, 0.7)";

/**
 * Padding around every fitted text background (header + secondary + category),
 * as a fraction of the poster's short edge — ~2px on all sides at the 1080 base.
 */
export const PAD_RATIO = 5 / 1080;

/** Default letter-spacing for secondary text, as a fraction of its font size (negative = tighter). */
export const SECONDARY_TRACKING = -0.03;

/**
 * Vertical gap between stacked secondary-text lines, as a fraction of the
 * font size. 0 = lines packed flush (boxes touching); increase to loosen.
 */
export const SECONDARY_LINE_GAP = -0.12;

/** Line advance within an editorial paragraph, as a multiple of the font size (1 = 100%). */
export const PARAGRAPH_LINE_HEIGHT = 1;

/**
 * Modular type scale. Every text size is a step on one geometric ladder
 * (BASE × RATIO^n, as a fraction of the short edge) so the elements stay in
 * proportion instead of using hand-picked decimals.
 *   step 0 → body/secondary + logo · step 1 → category/label
 *   step 2 → small subhead · step 4 → medium subhead
 */
export const TYPE_BASE = 0.035;
/**
 * Default ladder ratio, used by the poster-derived primitives in this folder.
 * Formats now carry their own — the report is 1.2, not 1.25 — so prefer
 * `PageFormat.typeRatio` via `typeStepFor()` anywhere a format is in hand.
 */
export const TYPE_RATIO = 1.25;
export const typeStep = (n: number): number => TYPE_BASE * TYPE_RATIO ** n;

/**
 * Fitted-header ceiling as a fraction of the short edge. A width-fitted header
 * never grows past this, so a two-word headline in a wide box can't balloon out
 * of scale with the rest of the type.
 */
export const HEADER_MAX_RATIO = 0.2;

export const EXPORT_SCALES = [1, 2] as const;

/** Opacity (0..1) seeded when a paper texture is first toggled on. */
export const DEFAULT_PAPER_OPACITY = 0.4;

/** Logo/secondary sizes are CONSTANT across layouts — steps on the type scale. */
export const LOGO_HEIGHT_RATIO = typeStep(0); // same tier as the secondary text
export const SECONDARY_SIZE_RATIO = typeStep(0);
export const CATEGORY_SIZE_RATIO = typeStep(1);

/** Grid: 10 columns, no margin, no gutter. */
export const GRID_COLUMNS = 10;

export const DEFAULT_HALFTONE: HalftoneParams = {
  dotScale: 3,
  contrast: 1,
  brightness: 1,
  saturation: 1,
  shadows: 0,
  highlights: 0,
  angleC: 75,
  angleM: 45,
  angleY: 15,
  angleK: 0,
  sharpness: 0.75,
};
